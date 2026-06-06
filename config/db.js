const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const promisePool = pool.promise();

promisePool.getConnection = () =>
  new Promise((resolve, reject) => {
    pool.getConnection((err, conn) => {
      if (err) return reject(err);
      const promiseConn = conn.promise();
      promiseConn.release = () => conn.release();
      resolve(promiseConn);
    });
  });

module.exports = promisePool;