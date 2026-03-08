import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '1mag1na.xyz',
  port: 3306,
  user: 'antigravity_bot',
  password: 'anti',
  database: 'hoacontabo24',
});

const tablas = ['MasterTransactionTable', 'HOA_Client_Name_Info_Table'];

for (const tabla of tablas) {
  const [cols] = await conn.query(`DESCRIBE \`${tabla}\``);
  console.log(`\n=== ${tabla} ===`);
  cols.forEach(r => console.log(`  ${r.Field}  [${r.Type}]`));
}

// Test: muestra de MasterTransactionTable
console.log('\n=== MUESTRA MasterTransactionTable (5 filas) ===');
try {
  const [rows] = await conn.query('SELECT * FROM MasterTransactionTable LIMIT 5');
  console.log(JSON.stringify(rows, null, 2));
} catch(e) {
  console.error('Error query:', e.message);
}

// Test: muestra de HOA_Client_Name_Info_Table
console.log('\n=== MUESTRA HOA_Client_Name_Info_Table (3 filas) ===');
try {
  const [rows] = await conn.query('SELECT * FROM HOA_Client_Name_Info_Table LIMIT 3');
  console.log(JSON.stringify(rows, null, 2));
} catch(e) {
  console.error('Error query:', e.message);
}

await conn.end();
