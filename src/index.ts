import { startBot } from './bot.js';
import { vpsService } from './services/vpsConnection.js';

console.log('🚀 Iniciando OpenGravity...');
startBot();

// Manejo elegante de apagado
process.once('SIGINT', () => {
    console.log('Parando OpenGravity...');
    process.exit(0);
});
process.once('SIGTERM', () => {
    console.log('Parando OpenGravity...');
    process.exit(0);
});
