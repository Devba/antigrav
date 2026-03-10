import { envConfig } from '../config/index.js';

type AllowedAction =
  | 'ping'
  | 'status'
  | 'list'
  | 'logs'
  | 'analyze_logs'
  | 'memory_status'
  | 'memory_recent'
  | 'auto_analyze';

type LogType = 'access' | 'error' | 'all';

type ControlResponse = {
  ok: boolean;
  action?: string;
  data?: any;
  error?: string;
  message?: string;
};

type ControlRequest = {
  action: AllowedAction | 'auth';
  token?: string;
  params?: Record<string, any>;
};

const ALLOWED_ACTIONS: AllowedAction[] = [
  'ping',
  'status',
  'list',
  'logs',
  'analyze_logs',
  'memory_status',
  'memory_recent',
  'auto_analyze',
];

const isLogType = (value: string): value is LogType => ['access', 'error', 'all'].includes(value);

export const parseSecCommand = (input: string): { ok: true; request: ControlRequest } | { ok: false; message: string } => {
  const clean = (input || '').trim();
  if (!clean) {
    return { ok: false, message: 'Uso: /sec <accion> [parametros]. Ejemplo: /sec logs access' };
  }

  const parts = clean.split(/\s+/);
  const action = (parts[0] || '').toLowerCase() as AllowedAction;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return { ok: false, message: `Acción no permitida: "${parts[0]}". Usa /sec list para ver capacidades.` };
  }

  if (action === 'ping' || action === 'status' || action === 'list' || action === 'memory_status') {
    if (parts.length > 1) {
      return { ok: false, message: `La acción ${action} no recibe parámetros.` };
    }
    return { ok: true, request: { action } };
  }

  if (action === 'logs' || action === 'analyze_logs') {
    const logType = (parts[1] || '').toLowerCase();
    if (!isLogType(logType)) {
      return { ok: false, message: `Uso: /sec ${action} <access|error|all>` };
    }
    if (parts.length > 2) {
      return { ok: false, message: `Demasiados parámetros para ${action}.` };
    }
    return { ok: true, request: { action, params: { logType } } };
  }

  if (action === 'memory_recent') {
    const countRaw = parts[1];
    const count = Number.parseInt(countRaw || '', 10);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return { ok: false, message: 'Uso: /sec memory_recent <1..50>' };
    }
    if (parts.length > 2) {
      return { ok: false, message: 'Demasiados parámetros para memory_recent.' };
    }
    return { ok: true, request: { action, params: { count } } };
  }

  // auto_analyze
  const mode = (parts[1] || '').toLowerCase();
  if (!['status', 'off', 'on'].includes(mode)) {
    return { ok: false, message: 'Uso: /sec auto_analyze <status|off|on ...>' };
  }

  if (mode === 'status' || mode === 'off') {
    if (parts.length > 2) {
      return { ok: false, message: `La modalidad ${mode} no recibe parámetros extra.` };
    }
    return { ok: true, request: { action, params: { mode } } };
  }

  const logType = (parts[2] || '').toLowerCase();
  const intervalMinutes = Number.parseInt(parts[3] || '', 10);

  if (!isLogType(logType) || !Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    return { ok: false, message: 'Uso: /sec auto_analyze on <access|error|all> <intervalMinutes>' };
  }

  if (parts.length > 4) {
    return { ok: false, message: 'Demasiados parámetros para auto_analyze on.' };
  }

  return {
    ok: true,
    request: {
      action,
      params: { mode: 'on', logType, intervalMinutes },
    },
  };
};

const waitForMessage = (ws: WebSocket, timeoutMs: number): Promise<ControlResponse> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout_waiting_response_${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      try {
        const payload = typeof event.data === 'string' ? event.data : String(event.data);
        const parsed = JSON.parse(payload);
        cleanup();
        resolve(parsed as ControlResponse);
      } catch {
        cleanup();
        reject(new Error('invalid_json_response'));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error('ws_message_error'));
    };

    const onClose = () => {
      cleanup();
      reject(new Error('ws_closed_before_response'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage as any);
      ws.removeEventListener('error', onError as any);
      ws.removeEventListener('close', onClose as any);
    };

    ws.addEventListener('message', onMessage as any);
    ws.addEventListener('error', onError as any);
    ws.addEventListener('close', onClose as any);
  });
};

const connectWs = (url: string, timeoutMs: number): Promise<WebSocket> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      reject(new Error(`ws_connect_timeout_${timeoutMs}ms`));
    }, timeoutMs);

    ws.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ws);
    });

    ws.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('ws_connect_error'));
    });
  });
};

export const runWsControlAction = async (request: ControlRequest): Promise<string> => {
  if (!envConfig.wsControlEnabled) {
    return 'WS control deshabilitado. Configura WS_CONTROL_ENABLED=true.';
  }
  if (!envConfig.wsControlToken) {
    return 'WS control token ausente. Configura WS_CONTROL_TOKEN.';
  }

  let ws: WebSocket | null = null;

  try {
    ws = await connectWs(envConfig.wsControlUrl, 5000);

    const sendAndWait = async (payload: ControlRequest) => {
      ws!.send(JSON.stringify(payload));
      return waitForMessage(ws!, 7000);
    };

    const authRes = await sendAndWait({ action: 'auth', token: envConfig.wsControlToken });
    if (!authRes.ok) {
      return JSON.stringify({
        ok: false,
        action: 'auth',
        error: authRes.error || 'auth_failed',
        message: authRes.message || 'Authentication failed',
      });
    }

    const statusRes = await sendAndWait({ action: 'status' });
    if (!statusRes.ok) {
      return JSON.stringify({
        ok: false,
        action: 'status',
        error: statusRes.error || 'status_failed',
        message: statusRes.message || 'Status check failed after auth',
      });
    }

    if (request.action === 'status') {
      return JSON.stringify(statusRes);
    }

    const actionRes = await sendAndWait(request);
    return JSON.stringify(actionRes);
  } catch (error: any) {
    return JSON.stringify({
      ok: false,
      action: request.action,
      error: 'ws_connection_failed',
      message: error?.message || 'Unknown websocket error',
    });
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
    }
  }
};
