// pruebas/dbbtest.js
import 'dotenv/config'; // Esto carga las variables de entorno automáticamente
import mysql from 'mysql2/promise';

async function testConnection() {
  console.log("🚀 Iniciando test de conexión a 1mag1na.xyz (Modo ESM)...");
  
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    });

    console.log("✅ ¡Conexión exitosa a hoacontabo24!");

    // 1. Obtener lista de tablas
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    console.log(`\nEncontradas ${tableNames.length} tablas:`, tableNames);
    console.log("\n--- DETALLE DE ESQUEMA ---");

    // 2. Obtener columnas de cada tabla
    for (const table of tableNames) {
      const [columns] = await connection.query(`DESCRIBE ${table}`);
      const colsInfo = columns.map(c => `${c.Field} (${c.Type})`);
      console.log(`📍 Tabla: ${table} -> [${colsInfo.join(', ')}]`);
    }

    console.log("\n--- FIN DEL TEST ---");

  } catch (error) {
    console.error("❌ Error durante el test:");
    console.error("Mensaje:", error.message);
  } finally {
    if (connection) await connection.end();
  }
}

testConnection();