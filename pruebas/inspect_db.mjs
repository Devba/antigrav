import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '1mag1na.xyz',
  port: 3306,
  user: 'antigravity_bot',
  password: 'anti',
  database: 'hoacontabo24',
});

const tablas = ['HOA_Client_Name_Info_Table', 'ResidentsPayable', 'AuthorizeApiPayments', 'UploadsDepRegister'];

for (const tabla of tablas) {
  const [cols] = await conn.query(`DESCRIBE \`${tabla}\``);
  console.log(`\n=== ${tabla} ===`);
  cols.forEach(r => console.log(`  ${r.Field}  [${r.Type}]`));
}

// Test query Top 3 deuda
console.log('\n=== TEST: Top 3 deuda ===');
try {
  const [rows] = await conn.query(`
    SELECT c.\`License_Number\`, SUM(CAST(r.TotalAmtDue AS DECIMAL(10,2))) AS total_deuda
    FROM ResidentsPayable r
    JOIN HOA_Client_Name_Info_Table c ON r.License = c.License_Number
    GROUP BY c.\`License_Number\`
    ORDER BY total_deuda DESC
    LIMIT 3
  `);
  console.log(JSON.stringify(rows, null, 2));
} catch(e) {
  console.error('Error query:', e.message);
}

await conn.end();
