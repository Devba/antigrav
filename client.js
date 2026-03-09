/**
 * Cliente de prueba WebSocket para diagnosticar conexión al VPS
 * Reemplaza TU_VPS_IP por la IP real del VPS antes de ejecutar.
 * Instalación: npm install socket.io-client
 * Ejecución: node client.js
 */

import { io } from 'socket.io-client';

const SERVER = 'http://62.171.142.58:3300'; // reemplaza TU_VPS_IP (incluye http:// o https:// según corresponda)
const TOKEN = '5bd135a51030edc8bb26e84076f30520';
const CONNECT_TIMEOUT_MS = 10000;

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

log('Iniciando cliente WebSocket...');

const socket = io(SERVER, {
  auth: { token: TOKEN },
  // No forzamos `transports` para permitir polling->websocket fallback durante diagnóstico
  timeout: CONNECT_TIMEOUT_MS,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

let waitingPong = true;
let pongTimer = null;

socket.on('connect', () => {
  log('Conectado al servidor. id=', socket.id);

  // Enviar test-ping y usar callback ack si está disponible
  log('Enviando test-ping...');
  try {
    socket.emit('test-ping', (ack) => {
      log('Ack de test-ping (callback):', ack);
    });
  } catch (e) {
    log('Error al emitir test-ping con callback:', e && e.message ? e.message : e);
  }

  // configurar timeout para test-pong
  waitingPong = true;
  if (pongTimer) clearTimeout(pongTimer);
  pongTimer = setTimeout(() => {
    if (waitingPong) {
      log(`No se recibió 'test-pong' en ${TEST_PONG_TIMEOUT}ms.`);
    }
  }, TEST_PONG_TIMEOUT);
});

const TEST_PONG_TIMEOUT = 10000;

socket.on('test-pong', (payload) => {
  waitingPong = false;
  if (pongTimer) clearTimeout(pongTimer);
  log('Evento test-pong recibido:', payload);

  // Tras recibir pong, enviamos comando date usando callback
  const comandoPayload = { comando: 'date' };
  log('Enviando evento "comando":', comandoPayload);
  try {
    socket.emit('comando', comandoPayload, (respuesta) => {
      log('Callback de "comando" recibido:', respuesta);
    });
  } catch (e) {
    log('Error al emitir "comando":', e && e.message ? e.message : e);
  }
});

// Escuchar respuesta_comando por si el servidor usa evento separado
socket.on('respuesta_comando', (data) => {
  log('Evento respuesta_comando recibido:', data);
});

// Eventos relacionados con archivos
socket.on('archivo-recibido', (info) => {
  log('Evento archivo-recibido:', info);
});

// Estado de conexión y errores
socket.on('connect_error', (err) => {
  log('Error de conexión:', err && err.message ? err.message : err);
});

socket.on('disconnect', (reason) => {
  log('Desconectado. Razón:', reason);
});

socket.on('reconnect_attempt', (attempt) => {
  log(`Intento de reconexión #${attempt}`);
});

socket.on('reconnect_failed', () => {
  log('Reconexión fallida');
});

socket.on('error', (err) => {
  log('Error del socket:', err);
});

// Registrar cualquier evento recibido para depuración
socket.onAny((event, ...args) => {
  log('Evento recibido ->', event, ...args);
});

// Manejo de proceso para cerrar socket limpiamente
process.on('SIGINT', () => {
  log('SIGINT recibido: cerrando conexión...');
  try {
    socket.close();
  } catch (e) {}
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('uncaughtException:', err && err.stack ? err.stack : err);
  try { socket.close(); } catch (e) {}
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('unhandledRejection:', reason);
});

// Nota: Timeout del test-pong definido arriba

// Mensaje final para indicar que el cliente está corriendo
log('Cliente listo. Reemplaza TU_VPS_IP y ejecuta `node client.js`.');
