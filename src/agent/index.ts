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

→ **NO uses \`consultar_negocio\` directamente.** En su lugar, usa \`execute_local_analysis\` con un script Node.js (ESM) que:
1. Se conecte a MySQL usando las variables de entorno disponibles: \`DB_HOST\`, \`DB_PORT\`, \`DB_USER\`, \`DB_PASS\`, \`DB_NAME\`.
2. Ejecute la query necesaria.
3. Guarde el resultado en \`./sandbox/reporte_<nombre>.csv\` o \`./sandbox/reporte_<nombre>.json\` usando \`fs\`.
4. Haga \`console.log\` de un resumen ejecutivo (máx. 5 líneas) con totales o estadísticas clave.

El usuario recibirá el resumen ejecutivo en el chat. Si quiere el archivo completo, ya está en \`./sandbox/\`.

**Ejemplo para "listar todos los residentes y sus emails":**
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
console.log(\`Total residentes: \${rows.length}\\nArchivo guardado: ./sandbox/residentes_emails.csv\`);
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
