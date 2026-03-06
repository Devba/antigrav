import { callLLM } from './llm.js';
import { availableTools, executeTool } from '../tools/index.js';
import { getHistory, saveMessage } from '../db/index.js';

// Prevenimos loops infinitos del agente si entra en bucle llamando herramientas
const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `
Eres OpenGravity, un asistente de IA personal, rápido y eficiente, operando localmente a través de Telegram.
- Tienes acceso a herramientas externas. Úsalas cuando sea necesario.
- Tienes memoria persistente sobre las conversaciones pasadas con el usuario.
- Tus respuestas deben ser claras, amables y en español.
- Prioriza mantener las respuestas concisas a menos que el usuario pida más detalles.
- Tu arquitectura es modular y escalable para futuras integraciones.
`;

export const processUserMessage = async (userId: string, text: string): Promise<string> => {
  saveMessage(userId, 'user', text);

  // Cargamos contexto previo
  const history = getHistory(userId, 15);

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(msg => ({ role: msg.role, content: msg.content }))
  ];

  let iteration = 0;
  let finalResponse = '';

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Agente] Iteración ${iteration}/${MAX_ITERATIONS}`);

    const assistantMessage = await callLLM(messages, availableTools);
    messages.push(assistantMessage);

    // Verificamos si el modelo solicita usar una herramienta
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

        console.log(`[Agente] Ejecutando tool: ${functionName}`, functionArgs);

        const toolResult = await executeTool(functionName, functionArgs);

        console.log(`[Agente] Tool Result para ${functionName} obtenido.`);

        // Formato para Groq / OpenAI tool call responses
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
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

  return finalResponse;
};
