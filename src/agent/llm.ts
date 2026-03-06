import Groq from 'groq-sdk';
import { envConfig } from '../config/index.js';

let groq: Groq | null = null;

if (envConfig.groqApiKey && !envConfig.groqApiKey.includes('SUSTITUYE')) {
    groq = new Groq({
        apiKey: envConfig.groqApiKey,
    });
}

export const callLLM = async (messages: any[], tools: any[]) => {
    try {
        if (!groq) throw new Error('Groq API Key no configurada correctamente.');

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            tool_choice: (tools.length > 0 ? 'auto' : 'none') as any,
        });
        return completion.choices[0].message;
    } catch (error) {
        console.error('⚠️ Groq API Error, intentando fallback a OpenRouter...', error);
        return await callOpenRouter(messages, tools);
    }
};

const callOpenRouter = async (messages: any[], tools: any[]) => {
    if (!envConfig.openRouterApiKey || envConfig.openRouterApiKey.includes('SUSTITUYE')) {
        throw new Error('OpenRouter API Key no configurada, y Groq falló.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${envConfig.openRouterApiKey}`,
            'HTTP-Referer': 'https://opengravity.local',
            'X-Title': 'OpenGravity',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: envConfig.openRouterModel,
            messages,
            tools: tools.length > 0 ? tools : undefined,
        })
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message;
};
