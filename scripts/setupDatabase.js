require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`❌ Missing required .env values: ${missing.join(', ')}`);
  process.exit(1);
}

async function setupDatabase() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );

    await connection.changeUser({ database: process.env.DB_NAME });

    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await connection.query(schema);

    console.log('✅ Infinity database setup completed successfully.');
    console.log(`✅ Database ready: ${process.env.DB_NAME}`);
  } catch (error) {
    console.error('❌ Database setup failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

setupDatabase();
