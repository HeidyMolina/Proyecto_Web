// db.js
require('dotenv').config();
const mysql = require('mysql2');

// ⚡ Usamos pool porque tu server.js usa db.query con callbacks
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 25060),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

// ✅ Exportamos el pool, y listo
module.exports = pool;
