import fs from 'fs';
import path from 'path';
import { io, Socket } from 'socket.io-client';
import { envConfig } from '../config/index.js';

// Comandos o patrones peligrosos bloqueados
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/[^/]*/i,
  /rm\s+-rf\s+\//i,
  /rm\s+--no-preserve-root/i,
  /\bshutdown\b/i,
  /\bhalt\b/i,
  /\bpoweroff\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{/,           // fork bomb
  /chmod\s+-R\s+777\s+\//i,
  /chown\s+-R.*\s+\//i,
  /\bformat\b/i,
  /\bfdisk\b/i,
];

class VPSConnectionService {
  private socket: Socket | null = null;
  private isConnected = false;
  private notificationHandler: ((msg: string) => void) | null = null;

  constructor() {
    this.initialize();
  }

  public setNotificationHandler(fn: (msg: string) => void) {
    this.notificationHandler = fn;
  }

  private initialize() {
    if (!envConfig.vpsIp || !envConfig.vpsToken) {
      console.warn('⚠️ VPS Connection: Missing vpsIp or vpsToken in configuration.');
      return;
    }

    const url = envConfig.vpsIp.startsWith('http') ? envConfig.vpsIp : `http://${envConfig.vpsIp}`;
    
    this.socket = io(url, {
      auth: {
        token: envConfig.vpsToken
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('✅ VPS Swarm: Conexión establecida con éxito con el VPS.');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.warn(`⚠️ VPS Swarm: Desconectado del VPS. Razón: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`❌ VPS Swarm: Error de conexión: ${error.message}`);
    });

    // Listener para notificaciones del VPS → push a Telegram
    this.socket.on('notificacion', (data: any) => {
      const msg = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      console.log('🔔 Notificación del VPS:', msg);
      if (this.notificationHandler) {
        this.notificationHandler(`🔔 *VPS:* ${msg}`);
      }
    });
  }

  public async ejecutarComando(comando: string): Promise<string> {
    // Seguridad: bloquear comandos peligrosos
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(comando)) {
        console.warn(`[VPS Swarm] Comando bloqueado por seguridad: ${comando}`);
        return `⛔ Comando bloqueado por seguridad: '${comando}'. No se ejecutará.`;
      }
    }

    if (!this.socket || !this.isConnected) {
      return 'Error: No hay conexión activa con el VPS.';
    }

    return new Promise((resolve) => {
      let resolved = false;
      console.log(`[VPS Swarm] Enviando comando: ${comando}`);

      // El VPS opera en modo async: devuelve un ACK inmediato via 'respuesta_comando'
      // y envía el resultado real más tarde via 'notificacion' (ya capturado por notificationHandler)
      const handleAck = (response: any) => {
        if (resolved) return;
        resolved = true;
        this.socket?.off('respuesta_comando', handleAck);

        let ack: string;
        if (typeof response === 'string') {
          ack = response;
        } else if (Array.isArray(response)) {
          ack = response[0] ?? '(ACK sin contenido)';
        } else if (response?.success) {
          // Respuesta síncrona con output directo (modo legacy)
          ack = response.output || '(sin salida)';
        } else if (response?.error) {
          ack = `❌ Error en VPS: ${response.error}`;
        } else {
          ack = JSON.stringify(response);
        }

        console.log(`[VPS Swarm] ACK recibido:`, ack.substring(0, 200));
        resolve(ack);
      };

      // Escuchar ACK del servidor
      this.socket?.once('respuesta_comando', handleAck);

      // Enviar el comando
      this.socket?.emit('comando', { comando });

      // Timeout 15s para el ACK (no para el resultado, que llega por notificacion)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.socket?.off('respuesta_comando', handleAck);
          resolve('⚠️ El VPS no confirmó la recepción del comando (timeout 15s). Puede que no esté conectado.');
        }
      }, 15000);
    });
  }

  public async enviarArchivo(rutaLocal: string, rutaRemota: string): Promise<string> {
    if (!this.socket || !this.isConnected) {
      return 'Error: No hay conexión activa con el VPS.';
    }

    try {
      if (!fs.existsSync(rutaLocal)) {
        return `Error: El archivo local no existe: ${rutaLocal}`;
      }

      const contenido = fs.readFileSync(rutaLocal);
      const nombreArchivo = path.basename(rutaRemota || rutaLocal);

      return new Promise((resolve) => {
        console.log(`[VPS Swarm] Enviando archivo: ${nombreArchivo} a ${rutaRemota}`);
        this.socket?.emit('enviar-archivo', {
          nombre: nombreArchivo,
          ruta: rutaRemota,
          contenido: contenido
        }, (response: any) => {
          if (response && response.success) {
            resolve(`✅ Archivo '${nombreArchivo}' enviado con éxito al VPS.`);
          } else {
            resolve(`❌ Error enviando archivo: ${response?.message || 'Respuesta desconocida del VPS'}`);
          }
        });

        // Timeout
        setTimeout(() => {
          resolve('Error: El VPS no respondió a la transferencia de archivo (timeout).');
        }, 60000);
      });
    } catch (error: any) {
      return `Error leyendo archivo local: ${error.message}`;
    }
  }

  public getStatus(): boolean {
    return this.isConnected;
  }
}

export const vpsService = new VPSConnectionService();
