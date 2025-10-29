// db.js
require('dotenv').config();
const mysql = require('mysql2');

// ⚡ Creamos el pool de conexiones
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '159.89.179.173',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'appuser',
  password: process.env.MYSQL_PASSWORD || 'TuPasswordSeguro123!',
  database: process.env.MYSQL_DB || 'sistema',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ✅ Exportamos el pool para usarlo en servidor.js y rutas
module.exports = pool;

