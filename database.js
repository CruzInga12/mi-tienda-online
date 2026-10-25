// database.js - Conexión a Turso (Cloud SQLite) con respaldo local
const { createClient } = require('@libsql/client');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let db;
const isProduction = process.env.TURSO_DATABASE_URL ? true : false;

if (isProduction) {
  // Conexión a Turso en la nube para Render
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log('☁️ Conectado a la base de datos de Turso en la nube.');
} else {
  // Respaldo local para desarrollo en tu PC
  const dbPath = path.join(__dirname, 'tienda.db');
  const localDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error al abrir la base de datos local:', err.message);
    else console.log('Conectado a la base de datos SQLite local.');
  });
  
  // Adaptador para mantener compatibilidad con la sintaxis de sqlite3 en local
  db = {
    query: (sql, params = []) => new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        localDb.all(sql, params, (err, rows) => err ? reject(err) : resolve({ rows }));
      } else {
        localDb.run(sql, params, function (err) {
          err ? reject(err) : resolve({ insertId: this.lastID, changes: this.changes });
        });
      }
    }),
    exec: (sql) => new Promise((resolve, reject) => {
      localDb.exec(sql, (err) => err ? reject(err) : resolve());
    })
  };
}

// Inicialización de tablas universales (Compatible con Turso / LibSQL)
async function inicializarTablas() {
  try {
    if (isProduction) {
      await db.execute(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT UNIQUE,
        password TEXT,
        rol TEXT DEFAULT 'cliente',
        ciudad TEXT,
        departamento TEXT
      )`);

      await db.execute(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT
      )`);

      await db.execute(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        precio REAL,
        stock INTEGER,
        categoria TEXT,
        imagen TEXT
      )`);

      await db.execute(`CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        paypal_order_id TEXT,
        monto REAL,
        items TEXT,
        direccion TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      await db.execute(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        user_email TEXT,
        product_id INTEGER,
        rating INTEGER,
        comment TEXT,
        media_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Verificar admin por defecto en la nube
      const adminCheck = await db.execute({ sql: "SELECT COUNT(*) as count FROM admins", args: [] });
      if (adminCheck.rows[0].count === 0) {
        await db.execute({ sql: `INSERT INTO admins (email, password) VALUES (?, ?)`, args: ['admin@tienda.com', '123456'] });
      }

      // Productos iniciales en la nube si está vacío
      const prodCheck = await db.execute({ sql: "SELECT COUNT(*) as count FROM productos", args: [] });
      if (prodCheck.rows[0].count === 0) {
        await db.execute({ sql: `INSERT INTO productos (nombre, precio, stock, categoria, imagen) VALUES ('Audífonos Inalámbricos Pro', 120.00, 15, 'Tecnología', 'https://picsum.photos/200?1')`, args: [] });
      }
      console.log('🚀 Tablas en Turso verificadas y listas.');
    }
  } catch (e) {
    console.error('Error inicializando tablas remotas:', e);
  }
}

inicializarTablas();

module.exports = db;