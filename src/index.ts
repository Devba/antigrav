import { startBot } from './bot.js';

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
