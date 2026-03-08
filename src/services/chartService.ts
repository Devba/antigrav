import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.resolve(__dirname, '../../temp');

// Asegurar que el directorio temp existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const renderer = new ChartJSNodeCanvas({ width: 800, height: 450, backgroundColour: 'white' });

export const chartService = {
  async generarGraficoBarras(
    labels: string[],
    data: number[],
    titulo: string,
    nombre: string,
  ): Promise<string> {
    const config: any = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: titulo,
            data,
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          legend: { display: true, position: 'top' },
          title: { display: true, text: titulo, font: { size: 16 } },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    };

    const buffer = await renderer.renderToBuffer(config);
    const filePath = path.join(TEMP_DIR, `${nombre}_${Date.now()}.png`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  },

  limpiarArchivo(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignorar errores de limpieza
    }
  },
};
