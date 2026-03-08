import { getCurrentTimeDef, getCurrentTime } from './getCurrentTime.js';
import { gmailSearchDef, gmailSendDef, driveSearchDef, executeGogCommand } from './googleWorkspace.js';
import { vpsService } from '../services/vpsConnection.js';

// Aquí podemos escalar añadiendo más herramientas en el futuro (ElevenLabs, web scraping, etc.)
export const availableTools = [
  getCurrentTimeDef,
  gmailSearchDef,
  gmailSendDef,
  driveSearchDef,
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
      case 'ejecutar_en_vps':
        return vpsService.ejecutarComando(args.comando);
      case 'enviar_archivo_al_vps':
        return vpsService.enviarArchivo(args.rutaLocal, args.rutaRemota);
      default:
        return `Error: Tool ${name} not found.`;
    }
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
};
