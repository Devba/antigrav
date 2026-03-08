import { getCurrentTimeDef, getCurrentTime } from './getCurrentTime.js';
import { gmailSearchDef, gmailSendDef, driveSearchDef, executeGogCommand } from './googleWorkspace.js';
import { vpsService } from '../services/vpsConnection.js';
import { saveMemory, deleteMemory, getMemories } from '../db/index.js';
import { dbService } from '../services/dbService.js';
import { chartService } from '../services/chartService.js';

// Aquí podemos escalar añadiendo más herramientas en el futuro (ElevenLabs, web scraping, etc.)
export const availableTools = [
  getCurrentTimeDef,
  gmailSearchDef,
  gmailSendDef,
  driveSearchDef,
  {
    name: 'guardar_memoria',
    description: 'Guarda un dato importante sobre el usuario (nombre, preferencias, configuraciones, etc.) para recordarlo en futuras conversaciones.',
    parameters: {
      type: 'object',
      properties: {
        clave: {
          type: 'string',
          description: 'Identificador corto del dato (ej: nombre, idioma, zona_horaria, preferencia_respuesta).',
        },
        valor: {
          type: 'string',
          description: 'Valor a recordar.',
        },
      },
      required: ['clave', 'valor'],
    },
  },
  {
    name: 'borrar_memoria',
    description: 'Elimina un dato guardado sobre el usuario.',
    parameters: {
      type: 'object',
      properties: {
        clave: {
          type: 'string',
          description: 'Identificador del dato a borrar.',
        },
      },
      required: ['clave'],
    },
  },
  {
    name: 'generar_reporte_visual',
    description: 'Genera un gráfico de barras PNG a partir de una consulta SQL y lo envía al usuario como imagen. Úsala cuando el usuario pida un gráfico, chart o reporte visual. Debes proporcionar el SQL ya validado, los labels y los valores numéricos extraídos de los resultados.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'Consulta SQL de solo lectura para obtener los datos (MySQL). Debe devolver exactamente 2 columnas: etiqueta y valor numérico.',
        },
        titulo: {
          type: 'string',
          description: 'Título del gráfico (ej: "Acumulados de Amt por mes 2026")',
        },
        nombre_archivo: {
          type: 'string',
          description: 'Nombre corto para el archivo (sin espacios, sin extensión). Ej: "amt_por_mes"',
        },
      },
      required: ['sql', 'titulo', 'nombre_archivo'],
    },
  },
  {
    name: 'consultar_negocio',
    description: 'Ejecuta consultas SQL de solo lectura en la base de datos de negocio (hoacontabo24) para obtener informes de pagos, clientes y licencias. Genera el SQL preciso y llama a esta herramienta.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'Consulta SQL de solo lectura (SELECT/SHOW/DESCRIBE). Usa backticks para tablas con caracteres especiales. Incluye siempre LIMIT 20 salvo que se pida un conteo.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'ejecutar_en_vps',
    description: 'Ejecuta un comando de Linux en el VPS remoto y devuelve la salida.',
    parameters: {
      type: 'object',
      properties: {
        comando: {
          type: 'string',
          description: 'El comando de consola a ejecutar (ej: ls, uptime, pm2 status).',
        },
      },
      required: ['comando'],
    },
  },
  {
    name: 'enviar_archivo_al_vps',
    description: 'Envía un archivo local al VPS remoto.',
    parameters: {
      type: 'object',
      properties: {
        rutaLocal: {
          type: 'string',
          description: 'La ruta del archivo en la máquina local.',
        },
        rutaRemota: {
          type: 'string',
          description: 'La ruta de destino en el VPS (incluyendo el nombre del archivo).',
        },
      },
      required: ['rutaLocal', 'rutaRemota'],
    },
  },
];

export const executeTool = async (name: string, args: Record<string, any>): Promise<string> => {
  try {
    switch (name) {
      case 'get_current_time':
        return getCurrentTime();
      case 'gmail_search':
        return executeGogCommand('gmail search', [`'${args.query}'`, `--max ${args.max || 10}`]);
      case 'gmail_send':
        return executeGogCommand('gmail send', [`--to ${args.to}`, `--subject "${args.subject}"`, `--body "${args.body}"`]);
      case 'drive_search':
        return executeGogCommand('drive search', [`"${args.query}"`, `--max ${args.max || 10}`]);
      case 'guardar_memoria': {
        const userId = args.user_id || args.userId;
        if (!userId) return 'Error: se necesita user_id para guardar memoria.';
        saveMemory(userId, args.clave, args.valor);
        return `✅ Recuerdo guardado: "${args.clave}" = "${args.valor}"`;
      }
      case 'borrar_memoria': {
        const userId = args.user_id || args.userId;
        if (!userId) return 'Error: se necesita user_id para borrar memoria.';
        const deleted = deleteMemory(userId, args.clave);
        return deleted ? `🗑️ Recuerdo "${args.clave}" eliminado.` : `⚠️ No se encontró ningún recuerdo con clave "${args.clave}".`;
      }
      case 'generar_reporte_visual': {
        const sql = args.sql;
        const titulo = args.titulo || 'Reporte';
        const nombreArchivo = (args.nombre_archivo || 'reporte').replace(/\s+/g, '_');

        if (!sql) return 'Error: se requiere el parámetro "sql".';

        // Ejecutar SQL para obtener los datos
        const rawResult = await dbService.consultarRaw(sql);
        if (!rawResult || rawResult.length === 0) {
          return '📭 La consulta no devolvió datos para generar el gráfico.';
        }

        const cols = Object.keys(rawResult[0]);
        if (cols.length < 2) {
          return '⚠️ La consulta debe devolver al menos 2 columnas: etiqueta y valor numérico.';
        }

        const labels = rawResult.map((r: any) => String(r[cols[0]]));
        const data = rawResult.map((r: any) => parseFloat(r[cols[1]]) || 0);

        const filePath = await chartService.generarGraficoBarras(labels, data, titulo, nombreArchivo);

        // Devolver la ruta con prefijo especial para que el bot lo detecte
        return `CHART_PNG:${filePath}`;
      }
      case 'consultar_negocio': {
        const sql = args.sql;
        if (!sql) return 'Error: se requiere el parámetro "sql".';
        return dbService.consultar(sql);
      }
      case 'ejecutar_en_vps': {
        const cmd = args.comando || args.command || args.cmd;
        if (!cmd) {
          console.error(`[Tool] ejecutar_en_vps: args recibidos:`, JSON.stringify(args));
          return `Error: el parámetro 'comando' no se recibió. Args recibidos: ${JSON.stringify(args)}`;
        }
        return vpsService.ejecutarComando(cmd);
      }
      case 'enviar_archivo_al_vps':
        return vpsService.enviarArchivo(args.rutaLocal, args.rutaRemota);
      default:
        return `Error: Tool ${name} not found.`;
    }
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
};
