import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Bot, InputFile } from 'grammy';
import { envConfig } from './config/index.js';
import { processUserMessage } from './agent/index.js';
import { clearHistory } from './db/index.js';
import { transcribeAudio } from './agent/transcription.js';
import { vpsService } from './services/vpsConnection.js';
import { chartService } from './services/chartService.js';
import { schedulerService } from './services/schedulerService.js';

export const startBot = () => {
  if (!envConfig.telegramBotToken || envConfig.telegramBotToken.includes('SUSTITUYE')) {
    console.error('❌ Error fatal: TELEGRAM_BOT_TOKEN no está configurado en el .env');
    return;
  }

  // Convierte el Markdown del LLM al subconjunto que Telegram acepta
  const sanitize = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/gs, '*$1*')
      .replace(/__(.+?)__/gs, '_$1_')
      .replace(/^[ \t]*\|[-| :]+\|[ \t]*$/gm, '')
      .replace(/\[via:/g, '[via:');

  const bot = new Bot(envConfig.telegramBotToken);

  // Envía la respuesta: como foto si es un gráfico, como texto si no
  const sendReply = async (chatId: string | number, reply: string) => {
    const chartMatch = reply.match(/CHART_PNG:(.+\.png)/);
    const fileMatch = reply.match(/SEND_FILE:([^\n]+)/);
    if (fileMatch && !chartMatch) {
      const filePath = fileMatch[1].trim();
      const caption = reply.replace(/SEND_FILE:[^\n]+\n?/, '').trim();
      try {
        await bot.api.sendDocument(chatId, new InputFile(filePath), {
          caption: caption ? sanitize(caption) : undefined,
          parse_mode: 'Markdown',
        });
      } catch (e: any) {
        if (e?.error_code === 400 && caption) {
          await bot.api.sendDocument(chatId, new InputFile(filePath), {
            caption: sanitize(caption).replace(/[*_`\[\]()~>#+=|{}.!\\]/g, ''),
          });
        } else if (e?.error_code !== 400) {
          throw e;
        }
      }
      return;
    }
    if (chartMatch) {
      const filePath = chartMatch[1].trim();
      const caption = reply.replace(/CHART_PNG:[^\n]+\n?/, '').trim();
      try {
        await bot.api.sendPhoto(chatId, new InputFile(filePath), {
          caption: caption ? sanitize(caption) : undefined,
          parse_mode: 'Markdown',
        });
      } catch (e: any) {
        if (e?.error_code === 400 && caption) {
          await bot.api.sendPhoto(chatId, new InputFile(filePath), {
            caption: sanitize(caption).replace(/[*_`\[\]()~>#+=|{}.!\\]/g, ''),
          });
        } else if (e?.error_code !== 400) {
          throw e;
        }
      } finally {
        chartService.limpiarArchivo(filePath);
      }
    } else {
      const sanitized = sanitize(reply);
      try {
        await bot.api.sendMessage(chatId, sanitized, { parse_mode: 'Markdown' });
      } catch (e: any) {
        if (e?.error_code === 400) {
          const plain = sanitized.replace(/[*_`\[\]()~>#+=|{}.!\\]/g, '');
          await bot.api.sendMessage(chatId, plain);
        } else {
          throw e;
        }
      }
    }
  };

  // Registrar handler de notificaciones push del VPS
  const primaryUserId = envConfig.telegramAllowedUserIds[0];
  if (primaryUserId) {
    vpsService.setNotificationHandler((msg: string) => {
      bot.api.sendMessage(primaryUserId, msg).catch(err =>
        console.error('❌ Error enviando notificación VPS a Telegram:', err)
      );
    });
  }

  // MIDDLEWARE DE SEGURIDAD: Whitelist
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id.toString();

    // Si no hay ID o el ID no está en la lista permitida, se ignora el mensaje sin responder (seguridad por oscuridad)
    if (!userId || !envConfig.telegramAllowedUserIds.includes(userId)) {
      console.warn(`🛡️ Intento de acceso no autorizado bloqueado. User ID: ${userId || 'Desconocido'}, Username: @${ctx.from?.username || 'Sin username'}`);
      // return; 
    }
    await next();
  });

  // Comandos básicos
  bot.command('start', async (ctx) => {
    await ctx.reply('¡Hola! Soy OpenGravity, tu agente personal. Estoy operativo de forma segura y escuchando tus órdenes. 🚀');
  });

  bot.command('clear', async (ctx) => {
    const userId = ctx.from!.id.toString();
    clearHistory(userId);
    await ctx.reply('🧹 Memoria borrada. ¿En qué te puedo ayudar ahora?');
  });

  // Manejador de mensajes de voz
  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const userId = ctx.from!.id.toString();

    await ctx.replyWithChatAction('typing');

    try {
      const voice = ctx.message.voice || ctx.message.audio;
      if (!voice) return;

      console.log(`[Bot] Recibido mensaje de voz de ${userId}`);

      const file = await ctx.getFile();
      const filePath = file.file_path;
      if (!filePath) throw new Error('No se pudo obtener la ruta del archivo de Telegram.');

      const url = `https://api.telegram.org/file/bot${envConfig.telegramBotToken}/${filePath}`;
      const tempPath = path.join('/tmp', `voice_${Date.now()}_${userId}.ogg`);

      // Descargar archivo
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      console.log(`[Bot] Audio descargado en ${tempPath}. Transcribiendo...`);

      const transcription = await transcribeAudio(tempPath);
      console.log(`[Bot] Transcripción completada: "${transcription}"`);

      // Limpiar archivo temporal
      fs.unlinkSync(tempPath);

      // Enviar el texto transcrito al agente
      const reply = await processUserMessage(userId, transcription);
      await sendReply(ctx.chat.id, reply);

    } catch (error: any) {
      console.error('❌ Error procesando mensaje de voz:', error);
      await ctx.reply(`⚠️ Ocurrió un error procesando tu audio: ${error.message}`);
    }
  });

  // Manejador de mensajes de texto principales
  bot.on('message:text', async (ctx) => {
    const userId = ctx.from!.id.toString();
    const text = ctx.message.text;

    // Acción de "Escribiendo..."
    await ctx.replyWithChatAction('typing');

    try {
      const reply = await processUserMessage(userId, text);
      await sendReply(ctx.chat.id, reply);
    } catch (error: any) {
      console.error('❌ Error procesando el mensaje:', error);
      await ctx.reply(`⚠️ Ocurrió un error en mi procesamiento interno: ${error.message}`);
    }
  });

  // Captura global de errores
  bot.catch((err) => {
    console.error('Ocurrió un error en el Bot de Telegram:', err);
  });

  // Inicialización (Long Polling, no requiere servidor web)
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot OpenGravity iniciado de forma segura como @${botInfo.username}`);
      console.log(`🔒 Usuarios permitidos: ${envConfig.telegramAllowedUserIds.join(', ')}`);

      // Arrancar el scheduler con el executor que procesa la tarea y notifica al usuario
      schedulerService.setExecutor(async (userId, instruction, notificationText) => {
        try {
          const result = await processUserMessage(userId, instruction);
          await sendReply(userId, result);
        } catch (e) {
          console.error('[Scheduler] Error ejecutando tarea:', e);
          await bot.api.sendMessage(userId, `⚠️ Error ejecutando tarea programada: ${notificationText}`);
        }
      });
      schedulerService.start();
    }
  });
};
