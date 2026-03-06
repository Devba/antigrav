import { getCurrentTimeDef, getCurrentTime } from './getCurrentTime.js';

// Aquí podemos escalar añadiendo más herramientas en el futuro (ElevenLabs, web scraping, etc.)
export const availableTools = [
  getCurrentTimeDef,
];

export const executeTool = async (name: string, args: Record<string, any>): Promise<string> => {
  try {
    switch (name) {
      case 'get_current_time':
        return getCurrentTime();
      default:
        return `Error: Tool ${name} not found.`;
    }
  } catch (error: any) {
    return `Error executing tool ${name}: ${error.message}`;
  }
};
