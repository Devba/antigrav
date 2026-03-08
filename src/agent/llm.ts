import Groq from 'groq-sdk';
import { envConfig } from '../config/index.js';

let groq: Groq | null = null;

if (envConfig.groqApiKey && !envConfig.groqApiKey.includes('SUSTITUYE')) {
    groq = new Groq({ apiKey: envConfig.groqApiKey });
}

export const callLLM = async (messages: any[], tools: any[], model?: string): Promise<{ message: any; provider: 'OR' | 'GROQ'; model: string }> => {
    const selectedModel = model || envConfig.primaryModel;
    try {
        const message = await callOpenRouter(messages, tools, selectedModel);
        return { message, provider: 'OR', model: selectedModel };
    } catch (error) {
        console.error('⚠️ OpenRouter Error, intentando fallback a Groq...', error);
        if (!groq) throw new Error('Groq API Key no configurada y OpenRouter falló.');
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            tool_choice: (tools.length > 0 ? 'auto' : 'none') as any,
        });
        return { message: completion.choices[0].message, provider: 'GROQ', model: 'llama-3.3-70b-versatile' };
    }
};

const callOpenRouter = async (messages: any[], tools: any[], model: string) => {
    if (!envConfig.openRouterApiKey || envConfig.openRouterApiKey.includes('SUSTITUYE')) {
        throw new Error('OpenRouter API Key no configurada, y Groq falló.');
    }

    // Normalizar tools al formato OpenAI: { type: "function", function: { name, description, parameters } }
    const normalizedTools = tools
        .map(t => {
            // Ya tiene el formato correcto
            if (t.type === 'function' && t.function?.name) return t;
            // Formato plano { name, description, parameters } → convertir
            if (t.name && t.parameters) {
                return { type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters } };
            }
            return null;
        })
        .filter(Boolean);

    const body: Record<string, any> = { model, messages };
    if (normalizedTools.length > 0) body.tools = normalizedTools;

    const response = await fetch(`${envConfig.openRouterUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${envConfig.openRouterApiKey}`,
            'HTTP-Referer': 'https://opengravity.local',
            'X-Title': 'OpenGravity',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.choices[0].message;
};
