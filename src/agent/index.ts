import { callLLM } from './llm.js';
import { availableTools, executeTool } from '../tools/index.js';
import { getHistory, saveMessage, getMemories } from '../db/index.js';
import { envConfig } from '../config/index.js';

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
