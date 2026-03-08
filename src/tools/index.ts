import { getCurrentTimeDef, getCurrentTime } from './getCurrentTime.js';
import { gmailSearchDef, gmailSendDef, driveSearchDef, executeGogCommand } from './googleWorkspace.js';
import { vpsService } from '../services/vpsConnection.js';
import { saveMemory, deleteMemory, getMemories } from '../db/index.js';

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
