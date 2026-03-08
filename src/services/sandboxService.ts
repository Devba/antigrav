import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SANDBOX_DIR = path.resolve('./sandbox');
const TIMEOUT_MS = 30_000; // 30 segundos máximo de ejecución

class SandboxService {
  constructor() {
    if (!fs.existsSync(SANDBOX_DIR)) {
      fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    }
  }

  /**
   * Ejecuta un bloque de código Node.js de forma aislada.
   * El código recibe DB_HOST/PORT/USER/PASS/DB_NAME como variables de entorno.
   * Devuelve stdout truncado a 4000 chars, o stderr si falla.
   */
  async ejecutar(codigo: string): Promise<string> {
    // Nombre de archivo único por timestamp para evitar colisiones
    const nombre = `script_${Date.now()}.mjs`;
    const rutaScript = path.join(SANDBOX_DIR, nombre);

    // Seguridad básica: bloquear imports de módulos de sistema sensibles
    const patronesPeligrosos = [
      /require\s*\(\s*['"]child_process['"]/,
      /import.*['"]child_process['"]/,
      /process\.exit/,
      /fs\.rmSync|fs\.unlinkSync|fs\.rmdirSync/,
      /exec\s*\(|spawn\s*\(|execSync\s*\(/,
    ];
    for (const patron of patronesPeligrosos) {
      if (patron.test(codigo)) {
        return '🚫 El script contiene operaciones no permitidas en el sandbox.';
      }
    }

    try {
      fs.writeFileSync(rutaScript, codigo, 'utf-8');

      const { stdout, stderr } = await execAsync(`node "${rutaScript}"`, {
        timeout: TIMEOUT_MS,
        env: {
          ...process.env,
        },
      });

      const salida = stdout.trim();
      const errores = stderr.trim();

      if (errores && !salida) {
        return `⚠️ Error en ejecución:\n${errores.slice(0, 2000)}`;
      }

      const resultado = salida || '(Sin salida)';
      return resultado.length > 4000
        ? resultado.slice(0, 4000) + '\n\n...[salida truncada]'
        : resultado;

    } catch (err: any) {
      if (err.killed || err.signal === 'SIGTERM') {
        return `⏱️ El script superó el límite de ${TIMEOUT_MS / 1000}s y fue detenido.`;
      }
      const msg = err.stderr?.trim() || err.message || String(err);
      return `❌ Error: ${msg.slice(0, 2000)}`;
    } finally {
      // Limpiar el script temporal siempre
      try { fs.unlinkSync(rutaScript); } catch { /* ignorar */ }
    }
  }
}

export const sandboxService = new SandboxService();
