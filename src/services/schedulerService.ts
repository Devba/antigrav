import { getPendingTasks, updateTaskAfterRun, ScheduledTask } from '../db/index.js';

type TaskExecutor = (userId: string, instruction: string, notificationText: string) => Promise<void>;

const TICK_INTERVAL_MS = 15_000; // revisa cada 15 segundos

class SchedulerService {
  private executor: TaskExecutor | null = null;
  private timer: NodeJS.Timeout | null = null;

  /** Registra la función que ejecutará cada tarea cuando dispare */
  setExecutor(fn: TaskExecutor) {
    this.executor = fn;
  }

  /** Arranca el loop de polling */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    console.log('[Scheduler] Iniciado — revisando cada', TICK_INTERVAL_MS / 1000, 's');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    const now = Date.now();
    const pending = getPendingTasks(now);
    for (const task of pending) {
      await this.runTask(task);
    }
  }

  private async runTask(task: ScheduledTask) {
    if (!this.executor) return;

    console.log(`[Scheduler] Ejecutando tarea #${task.id}: "${task.instruction.slice(0, 60)}"`);

    try {
      await this.executor(task.user_id, task.instruction, task.notification_text);
    } catch (e) {
      console.error(`[Scheduler] Error en tarea #${task.id}:`, e);
    }

    const newRunsDone = task.runs_done + 1;
    const maxRuns = task.occurrence_count;
    const exhausted = maxRuns !== null && newRunsDone >= maxRuns;

    if (exhausted || task.interval_ms === null) {
      // tarea única o agotada — desactivar
      updateTaskAfterRun(task.id, null);
    } else {
      // recurrente — programar siguiente ejecución
      updateTaskAfterRun(task.id, Date.now() + task.interval_ms);
    }
  }
}

export const schedulerService = new SchedulerService();
