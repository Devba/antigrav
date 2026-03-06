import fs from 'fs';
import Groq from 'groq-sdk';
import { envConfig } from '../config/index.js';

let groq: Groq | null = null;

if (envConfig.groqApiKey && !envConfig.groqApiKey.includes('SUSTITUYE')) {
    groq = new Groq({
        apiKey: envConfig.groqApiKey,
    });
}

/**
 * Transcribes an audio file using Groq's Whisper model.
 * @param filePath Path to the audio file (e.g., .oga, .mp3, .wav)
 * @returns The transcribed text
 */
export const transcribeAudio = async (filePath: string): Promise<string> => {
    if (!groq) {
        throw new Error('Groq API Key no configurada para transcripción.');
    }

    try {
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3', // El modelo más potente de Groq para esto
            response_format: 'json',
            language: 'es', // Forzamos español por defecto para papelesya.co
        });

        return transcription.text;
    } catch (error: any) {
        console.error('❌ Error en la transcripción de Groq:', error);
        throw new Error(`Error de transcripción: ${error.message}`);
    }
};
