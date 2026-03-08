import { config } from 'dotenv';

config();

export const envConfig = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramAllowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(id => id.length > 0),
    groqApiKey: process.env.GROQ_API_KEY || '',
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterUrl: process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1',
    primaryModel: process.env.PRIMARY_MODEL || 'stepfun/step-3.5-flash:free',
    specialistModel: process.env.SPECIALIST_MODEL || 'minimax/minimax-01',
    dbPath: process.env.DB_PATH || './memory.db',
    googleCreds: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
    vpsIp: process.env.vpsip || '',
    vpsToken: process.env.vpstoke || '',
    dbHost: process.env.DB_HOST || '',
    dbPort: parseInt(process.env.DB_PORT || '3306', 10),
    dbUser: process.env.DB_USER || '',
    dbPass: process.env.DB_PASS || '',
    dbName: process.env.DB_NAME || '',
};

// Validaciones de seguridad en inicio
if (!envConfig.telegramBotToken || envConfig.telegramBotToken.includes('SUSTITUYE')) {
    console.warn('⚠️  ADVERTENCIA: TELEGRAM_BOT_TOKEN no configurado o tiene el valor por defecto.');
}

if (envConfig.telegramAllowedUserIds.length === 0 || envConfig.telegramAllowedUserIds[0].includes('SUSTITUYE')) {
    console.warn('⚠️  ADVERTENCIA: TELEGRAM_ALLOWED_USER_IDS no configurado. El bot ignorará todos los mensajes por seguridad.');
}
