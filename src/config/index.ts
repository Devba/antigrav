import { config } from 'dotenv';

config();

export const envConfig = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramAllowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(id => id.length > 0),
    groqApiKey: process.env.GROQ_API_KEY || '',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || 'openrouter/free',
    openRouterPreset: process.env.OPENROUTER_PRESET || '@preset/open-gravity-primary',
    dbPath: process.env.DB_PATH || './memory.db',
    googleCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
    vpsIp: process.env.vpsip || '',
    vpsToken: process.env.vpstoke || '',
};

// Validaciones de seguridad en inicio
if (!envConfig.telegramBotToken || envConfig.telegramBotToken.includes('SUSTITUYE')) {
    console.warn('⚠️  ADVERTENCIA: TELEGRAM_BOT_TOKEN no configurado o tiene el valor por defecto.');
}

if (envConfig.telegramAllowedUserIds.length === 0 || envConfig.telegramAllowedUserIds[0].includes('SUSTITUYE')) {
    console.warn('⚠️  ADVERTENCIA: TELEGRAM_ALLOWED_USER_IDS no configurado. El bot ignorará todos los mensajes por seguridad.');
}
