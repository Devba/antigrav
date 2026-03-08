/**
 * Script de diagnóstico VPS — conexión directa vía socket.io
 * Uso: node diag_vps.mjs
 */
import { io } from 'socket.io-client';
import { execSync } from 'child_process';

const VPS_IP    = '62.171.142.58:3300';
const VPS_TOKEN = '5bd135a51030edc8bb26e84076f30520';
const URL       = `http://${VPS_IP}`;

// ─── 1. Diagnóstico de red básico ────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log(' DIAGNÓSTICO VPS — antigrav');
console.log('══════════════════════════════════════════\n');

console.log(`[NET] Ping a ${VPS_IP.split(':')[0]} ...`);
try {
  const ping = execSync(`ping -c 3 -W 3 ${VPS_IP.split(':')[0]} 2>&1`, { timeout: 10000 }).toString();
  console.log(ping);
} catch (e) {
  console.warn('[NET] Ping falló:', e.stdout?.toString() || e.message);
}

console.log(`[NET] Verificando puerto TCP ${VPS_IP} ...`);
try {
  const nc = execSync(`nc -zv -w 5 ${VPS_IP.split(':')[0]} ${VPS_IP.split(':')[1]} 2>&1`, { timeout: 8000 }).toString();
  console.log('[NET]', nc);
} catch (e) {
  console.warn('[NET] Puerto cerrado o inaccesible:', e.stdout?.toString() || e.stderr?.toString() || e.message);
}

console.log(`[HTTP] Probando endpoint HTTP ...`);
try {
  const curl = execSync(`curl -s -o /dev/null -w "%{http_code} | time: %{time_total}s" --connect-timeout 5 ${URL}/`, { timeout: 10000 }).toString();
  console.log('[HTTP] Respuesta:', curl);
} catch (e) {
  console.warn('[HTTP] Curl falló:', e.message);
}

// ─── 2. Conexión socket.io ────────────────────────────────────────────────────
console.log('\n[WS] Intentando conexión socket.io...\n');

const socket = io(URL, {
  auth: { token: VPS_TOKEN },
  reconnection: false,
  timeout: 15000,
  transports: ['websocket', 'polling'],
});

// Solo un comando para la prueba: rápido y con salida clara
const COMANDOS = ['uptime'];
let cmdIndex = 0;
let notificacionesRecibidas = 0;
let finTimeout;

const connectionTimeout = setTimeout(() => {
  console.error('\n❌ TIMEOUT: No se pudo establecer conexión con el VPS en 15s.');
  socket.disconnect();
  process.exit(1);
}, 15000);

socket.on('connect', () => {
  clearTimeout(connectionTimeout);
  console.log('✅ Conectado! socket.id:', socket.id);
  console.log('\n──── Enviando uptime ────\n');

  const COMANDOS = ['uptime', 'df -h', 'pm2 status 2>&1 || echo "pm2 no disponible"'];
  let idx = 0;

  socket.on('respuesta_comando', (response) => {
    const msg = Array.isArray(response) ? response[0] :
      (typeof response === 'string' ? response : JSON.stringify(response));
    console.log(`✅ ACK: ${msg.trim()}`);
    console.log('   → El resultado real llegará por notificacion/Telegram\n');
    enviar();
  });

  socket.on('notificacion', (data) => {
    const msg = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    console.log(`\n🔔 RESULTADO via notificacion:\n${'─'.repeat(50)}\n${msg.trim()}\n${'─'.repeat(50)}\n`);
  });

  function enviar() {
    if (idx >= COMANDOS.length) {
      console.log('✅ Todos los comandos enviados. Escuchando notificaciones 20s más...');
      setTimeout(() => { socket.disconnect(); process.exit(0); }, 20000);
      return;
    }
    const cmd = COMANDOS[idx++];
    console.log(`\n>>> ${cmd}`);
    socket.emit('comando', { comando: cmd });
    setTimeout(() => {
      console.warn(`⚠️  Sin ACK para: ${cmd}`);
      enviar();
    }, 10000);
  }

  enviar();
});

socket.on('connect_error', (err) => {
  console.error(`❌ Error conexión: ${err.message}`);
});

socket.on('disconnect', (reason) => {
  console.log(`\n[WS] Desconectado: ${reason}`);
});
