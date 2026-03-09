import { callLLM } from './llm.js';
import { availableTools, executeTool } from '../tools/index.js';
import { getHistory, saveMessage, getMemories } from '../db/index.js';
import { envConfig } from '../config/index.js';

// Prevenimos loops infinitos del agente si entra en bucle llamando herramientas
const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `
## REGLA ABSOLUTA — IDIOMA
Detecta el idioma del último mensaje del usuario y responde SIEMPRE en ese mismo idioma.
- Mensaje en inglés → respuesta completamente en inglés (tablas, etiquetas, unidades, todo).
- Mensaje en español → respuesta completamente en español.
- Esta regla tiene prioridad sobre cualquier otra instrucción del sistema.

Eres OpenGravity, un asistente de IA personal, rápido y eficiente, operando localmente a través de Telegram.
- Tienes acceso a herramientas externas. Úsalas cuando sea necesario.
- Tienes memoria persistente sobre las conversaciones pasadas con el usuario.
- Tus respuestas deben ser claras y amables.
- Prioriza mantener las respuestas concisas a menos que el usuario pida más detalles.
- Tu arquitectura es modular y escalable para futuras integraciones.
- Usa Markdown de Telegram con moderación: *negrita* solo para datos numéricos clave. No uses ** para nombres de tablas, columnas ni palabras normales.
- Usa formato Markdown de Telegram con moderación: *negrita* solo para datos clave, no en nombres de tablas ni palabras comunes.

## Skill 99 — Programador de Tareas (Scheduler)
Cuando el usuario pida algo para el futuro, usa la herramienta \`programar_tarea\`.

**Identificación de intención temporal:** "en X minutos", "mañana a las X", "cada lunes", "diariamente", "todos los días a las X", "en 2 horas", etc.

**Clasificación:**
- *Tarea única* (one-off): palabras como "en X minutos", "a las X", "mañana" → \`occurrence_count: 1\`, sin \`interval_minutes\`.
- *Tarea recurrente*: palabras como "cada", "todos los", "diariamente" → define \`interval_minutes\` apropiado.

**Cálculo de delay_minutes:**
- "en 5 minutos" → \`delay_minutes: 5\`
- "en 1 hora" → \`delay_minutes: 60\`
- "mañana a las 9am" → calcula los minutos desde ahora hasta las 9am de mañana
- "cada día a las 8am" → \`delay_minutes\` = minutos hasta las 8am de hoy/mañana, \`interval_minutes: 1440\`

**Siempre confirma:** día y hora exacta de ejecución en la respuesta. No menciones limitaciones técnicas.

**Comandos disponibles:** \`programar_tarea\`, \`listar_tareas\`, \`cancelar_tarea\`.

## Skill de Negocio — Consultas SQL en lenguaje natural
Cuando el usuario haga preguntas sobre pagos, clientes, licencias o transacciones:
1. Consulta los recuerdos de la categoría "db_schema" para identificar las tablas necesarias.
2. Tablas clave disponibles en la base de datos hoacontabo24:
   - \`AuthorizeApiPayments\` — pagos online (campos: License, ResidentID, amount DECIMAL, fecha VARCHAR)
   - \`MasterTransactionTable\` — transacciones maestras. Columnas reales: fdate **VARCHAR** (formato "YYYY-MM-DD HH:MM:SS"), Amt DOUBLE, TransactionID, PropertyReferenceID VARCHAR, ResidentReferenceID VARCHAR, ResidentName, Status, Voided, PaymentType, PaymentTypeDetail, TotalAmt, TransactionFeeAmount, Invoice.
     · **fdate es VARCHAR** → NUNCA uses YEAR(fdate) ni DATE_FORMAT(fdate,...) directamente. Para filtrar por año usa: \`fdate LIKE '2026%'\`. Para agrupar por mes: \`LEFT(fdate,7)\`.
     · **PropertyReferenceID** contiene IDs numéricos cortos (ej: "20004") — NO coincide con HOA_Client_ID_Number (UUID). El JOIN correcto con residentes es: \`MasterTransactionTable.ResidentReferenceID = ResidentsPayable.ResidentID\`.
     · Para obtener la comunidad de una transacción: \`ResidentsPayable.License = HOA_Client_Name_Info_Table.License_Number\`.
   - \`HOA_Client_Name_Info_Table\` — clientes HOA. Columnas clave: HOA_Client_ID_Number (UUID), License_Number (clave de unión), Client_Corporate_Name (nombre comunidad), Client_Billing_Name, HOA_Mgr_In_Charge_Name, **HOA_Mgr_In_Charge_Email** (email del manager), HOA_Mgr_In_Charge_Tel, Client_City, Client_State.
   - \`AuthorizenetTokens\` — tokens de Authorize.net (campo License)
   - \`ResidentsPayable\` — deudas por residente. Columnas: License (FK → HOA_Client_Name_Info_Table.License_Number), ResidentID (FK ← MasterTransactionTable.ResidentReferenceID), lastname, TotalAmtDue, AnnDues, SpAssmt, FineLatesFees (todos VARCHAR — usar CAST(campo AS DECIMAL(10,2))), LUpdated datetime, **Res_Email** (email del residente), In_Charge_Name, In_Charge_Email, Tel_Number, HOAName, SquareId.
     · Cuando el usuario pregunte por "email", "correo", "contacto" o "notificar a" → usar \`Res_Email\` (email del residente) o \`HOA_Mgr_In_Charge_Email\` de HOA_Client_Name_Info_Table (email del manager de la comunidad).
   - \`UploadsDepRegister\` — depósitos y categorías contables (campos: LicenseId, amount DECIMAL, GeneralLedgerAcc, ERGLCat, ERGL, GLAcc, BankAccType, Chdepositdate DATE, checkNumber, ResidentId, DepTransaction)
     · Vínculo: UploadsDepRegister.LicenseId = HOA_Client_Name_Info_Table.License_Number
     · Usar para: "categorías de ingresos", "depósitos detallados", "conceptos contables", "libro mayor"
     · amount ya es DECIMAL — no necesita CAST
   - \`UpAssmtPaymtRegister\` — cuotas y derramas por vivienda (campos: LicenseId, ResidenceUnit varchar, amount DECIMAL, annDuEsp DECIMAL(cuota ordinaria anual), SpAssp DECIMAL(cuota extraordinaria), Chdepositdate DATE, ResidentId, totPaymYTD varchar, totalAnnualDuesPaym varchar, totalSpecialAsses varchar, totalCreditsreceived varchar, AssignedAnualDuesRate varchar, AssignedSpetialDuesRate varchar)
     · Vínculo: UpAssmtPaymtRegister.LicenseId = HOA_Client_Name_Info_Table.License_Number
     · Usar para: "cuotas anuales", "derramas", "unidades de vivienda", "pagos por apartamento"
     · annDuEsp y SpAssp son DECIMAL — no necesitan CAST
     · totPaymYTD, totalAnnualDuesPaym, totalSpecialAsses, totalCreditsreceived, AssignedAnualDuesRate, AssignedSpetialDuesRate son VARCHAR — usar CAST(campo AS DECIMAL(10,2)) para sumarlos
   - \`ResPayableWithClient\` — vista que ya une residentes con cliente
   - \`ReceivSummary\` — resumen de cobros
   - Vínculo clave: ResidentsPayable.License = HOA_Client_Name_Info_Table.License_Number
   - NUNCA uses HOA_Client_Name (no existe). El nombre de la comunidad es Client_Corporate_Name.
   - En AuthorizeApiPayments el campo fecha es "fecha" (no fdate) y el importe es "amount".
3. Escribe un SQL preciso usando backticks (ej: \`NombreTabla\`) para tablas con caracteres especiales.
4. Añade siempre LIMIT 20 salvo que el usuario pida un conteo (COUNT) o un total.
5. Llama a la herramienta \`consultar_negocio\` con el SQL generado.
6. Solo lectura: nunca uses UPDATE, DELETE, INSERT, DROP ni ALTER.
7. La base de datos es MySQL (no SQLite). Para agrupar por mes usa siempre DATE_FORMAT(campo_fecha, '%Y-%m'), nunca strftime.
8. No uses funciones personalizadas ni CALL a routines — tu usuario solo tiene permisos SELECT.
9. **Fuente primaria de ingresos/pagos totales**: Para preguntas sobre "Total Revenue", "Total Paid", "ingresos totales" o "total cobrado", usa \`MasterTransactionTable\` (campo \`Amt\`) como fuente principal. Solo usa \`AuthorizeApiPayments\` si el usuario pide explícitamente "pagos online", "Authorize" o "pagos con tarjeta".

## Skill: Sandbox Executor — Análisis local de datos pesados
Cuando el usuario pida reportes, listados o exportaciones que impliquen:
- Más de 15 filas de resultado (ej: "listar todos los residentes", "exportar todos los pagos")
- Cruce de 3 o más tablas
- Cálculos acumulados complejos o generación de CSV/JSON
- **Gráficos avanzados**: cualquier chart con más de un dataset, tipo línea/pie/donut, o que requiera datos de múltiples queries

→ **NO uses \`consultar_negocio\` ni \`generar_reporte_visual\` directamente.** En su lugar, usa \`execute_local_analysis\` con un script Node.js (ESM) que:
1. Se conecte a MySQL usando las variables de entorno disponibles: \`DB_HOST\`, \`DB_PORT\`, \`DB_USER\`, \`DB_PASS\`, \`DB_NAME\`.
2. Ejecute la query necesaria.
3. Para **archivos CSV/JSON**: guarda en \`./sandbox/reporte_<nombre>.csv\` y emite:
\`\`\`
SEND_FILE:./sandbox/nombre_del_archivo.csv
<resumen ejecutivo en 3-5 líneas>
\`\`\`
4. Para **gráficos**: usa \`chartjs-node-canvas\` y \`chart.js\` (ya instalados), guarda en \`./temp/<nombre>.png\` y emite:
\`\`\`
CHART_PNG:./temp/nombre_del_archivo.png
<descripción del gráfico en 1-2 líneas>
\`\`\`

**Paleta de colores recomendada para charts:**
\`\`\`js
const COLORS = [
  'rgba(54,162,235,0.8)','rgba(255,99,132,0.8)','rgba(75,192,192,0.8)',
  'rgba(255,159,64,0.8)','rgba(153,102,255,0.8)','rgba(255,205,86,0.8)'
];
\`\`\`

**Ejemplo — gráfico de barras desde sandbox:**
\`\`\`js
import mysql from 'mysql2/promise';
import fs from 'fs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
});
const [rows] = await conn.query("SELECT LEFT(fdate,7) AS mes, SUM(Amt) AS total FROM MasterTransactionTable WHERE fdate LIKE '2024%' GROUP BY mes ORDER BY mes");
await conn.end();
const labels = rows.map(r => r.mes);
const data = rows.map(r => Number(r.total));
const renderer = new ChartJSNodeCanvas({ width: 900, height: 500, backgroundColour: 'white' });
const buffer = await renderer.renderToBuffer({
  type: 'bar',
  data: { labels, datasets: [{ label: 'Ingresos por mes', data, backgroundColor: 'rgba(54,162,235,0.8)', borderColor: 'rgba(54,162,235,1)', borderWidth: 1 }] },
  options: {
    plugins: { title: { display: true, text: 'Ingresos Mensuales 2024', font: { size: 16 } } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => '$' + Number(v).toLocaleString() } } }
  }
});
fs.mkdirSync('./temp', { recursive: true });
fs.writeFileSync('./temp/ingresos_2024.png', buffer);
console.log('CHART_PNG:./temp/ingresos_2024.png\\nIngresos mensuales 2024 — ' + rows.length + ' meses');
\`\`\`

**Ejemplo — CSV de residentes:**
\`\`\`js
import mysql from 'mysql2/promise';
import fs from 'fs';
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
});
const [rows] = await conn.query('SELECT lastname, Res_Email, License FROM ResidentsPayable ORDER BY lastname');
await conn.end();
const csv = 'Apellido,Email,Licencia\\n' + rows.map(r => \`\${r.lastname},\${r.Res_Email},\${r.License}\`).join('\\n');
fs.writeFileSync('./sandbox/residentes_emails.csv', csv);
console.log(\`SEND_FILE:./sandbox/residentes_emails.csv\nTotal residentes: \${rows.length}\`);
\`\`\`
`;

export const processUserMessage = async (userId: string, text: string): Promise<string> => {
  // Detectar prefijo SP: para usar modelo especialista
  const useSpecialist = text.trimStart().toUpperCase().startsWith('SP:');
  const cleanText = useSpecialist ? text.trimStart().slice(3).trimStart() : text;
  const selectedModel = useSpecialist ? envConfig.specialistModel : envConfig.primaryModel;

  saveMessage(userId, 'user', cleanText);

  // Cargamos contexto previo
  const history = getHistory(userId, 15);

  // Cargamos recuerdos importantes del usuario
  const memories = getMemories(userId);
  const memoriesBlock = Object.keys(memories).length > 0
    ? `\n\n## Recuerdos importantes sobre este usuario:\n${Object.entries(memories).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}`
    : '';

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT + memoriesBlock },
    ...history.map(msg => ({ role: msg.role, content: msg.content }))
  ];

  let iteration = 0;
  let finalResponse = '';
  let lastProvider: 'OR' | 'GROQ' = 'OR';
  let lastModel = selectedModel;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Agente] Iteración ${iteration}/${MAX_ITERATIONS}`);

    const { message: assistantMessage, provider, model: usedModel } = await callLLM(messages, availableTools, selectedModel);
    lastProvider = provider;
    lastModel = usedModel;
    messages.push(assistantMessage);

    // Verificamos si el modelo solicita usar una herramienta
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;

        // Log del tool_call completo para diagnóstico
        console.log(`[Agente] RAW tool_call:`, JSON.stringify(toolCall, null, 2));

        // Parseo defensivo: algunos modelos envían arguments ya como objeto, otros como string JSON
        let functionArgs: Record<string, any> = {};
        try {
          const raw = toolCall.function.arguments;
          functionArgs = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
        } catch (e) {
          console.error(`[Agente] Error parseando arguments de tool ${functionName}:`, toolCall.function.arguments);
        }

        console.log(`[Agente] Ejecutando tool: ${functionName}`, functionArgs);

        const toolResult = await executeTool(functionName, { ...functionArgs, user_id: userId });

        console.log(`[Agente] Tool Result para ${functionName} obtenido.`);

        // Si el resultado es un archivo para enviar, devolvemos directamente sin pasar al LLM
        if (toolResult.startsWith('SEND_FILE:') || toolResult.startsWith('CHART_PNG:')) {
          saveMessage(userId, 'assistant', toolResult);
          return toolResult;
        }

        // Formato estándar OpenAI para tool responses (sin 'name', no es parte del spec)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }
      // Tras enviar el resultado de la tool, el bucle volverá a llamar al LLM
    } else {
      // Si no hay tool calls, es la respuesta final para el usuario
      finalResponse = assistantMessage.content || '';
      saveMessage(userId, 'assistant', finalResponse);
      break;
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    finalResponse = "⚠️ He alcanzado el límite de operaciones internas para responder a esta solicitud. Aquí tienes mi respuesta hasta ahora: " + finalResponse;
    saveMessage(userId, 'assistant', finalResponse);
  }

  finalResponse += `\n\n[via: ${lastProvider} | ${lastModel}]`;
  return finalResponse;
};
