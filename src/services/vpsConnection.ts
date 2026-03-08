import fs from 'fs';
import path from 'path';
import { io, Socket } from 'socket.io-client';
import { envConfig } from '../config/index.js';

class VPSConnectionService {
  private socket: Socket | null = null;
  private isConnected = false;

  constructor() {
    this.initialize();
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

    // Listener para notificaciones del VPS
    this.socket.on('notificacion', (data: any) => {
      console.log('🔔 Notificación del VPS:', data);
      // Aquí podrías enviar esto al usuario de Telegram si fuera necesario
    });
  }

  public async ejecutarComando(comando: string): Promise<string> {
    if (!this.socket || !this.isConnected) {
      return 'Error: No hay conexión activa con el VPS.';
    }

    return new Promise((resolve) => {
      console.log(`[VPS Swarm] Enviando comando: ${comando}`);
      this.socket?.emit('comando', comando, (response: any) => {
        if (typeof response === 'string') {
          resolve(response);
        } else {
          resolve(JSON.stringify(response, null, 2));
        }
      });

      // Timeout por si el VPS no responde al evento
      setTimeout(() => {
        resolve('Error: El VPS no respondió al comando (timeout).');
      }, 30000);
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
