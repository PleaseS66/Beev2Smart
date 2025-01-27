const mysql = require('mysql2/promise');
require('dotenv').config();

let connection;

async function connectDB() {
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    });
    console.log('📦 Conexión a MySQL exitosa');



  } catch (error) {
    console.error('❌ Error al conectar a MySQL:', error.message);
    throw error;
  }
}


async function query(sql, params = []) {
  try {
    const [results] = await connection.execute(sql, params);
    return results;
  } catch (error) {
    console.error('❌ Error en la consulta SQL:', error);
    throw error;
  }
}


module.exports = { connectDB, query };