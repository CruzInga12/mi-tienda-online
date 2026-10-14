// database.js - Configuración y conexión de SQLite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tienda.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    email TEXT UNIQUE,
    password TEXT,
    rol TEXT DEFAULT 'cliente',
    ciudad TEXT,
    departamento TEXT
  )`, (err) => {
    if (err) console.error('Error al crear tabla usuarios:', err);
    else console.log('👤 Tabla de usuarios verificada/creada correctamente.');
  });

  db.run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    precio REAL,
    stock INTEGER,
    categoria TEXT,
    imagen TEXT
  )`, (err) => {
    if (err) {
      console.error('Error al crear tabla productos:', err);
    } else {
      console.log('🛍️ Tabla de productos verificada/creada correctamente.');
      db.get("SELECT COUNT(*) as count FROM productos", (countErr, row) => {
        if (row && row.count === 0) {
          db.run(`INSERT INTO productos (nombre, precio, stock, categoria, imagen) VALUES 
            ('Audífonos Inalámbricos Pro', 120.00, 15, 'Tecnología', 'https://picsum.photos/200?1'),
            ('Teclado Mecánico RGB', 180.00, 10, 'Tecnología', 'https://picsum.photos/200?2'),
            ('Mouse Gamer Ergonómico', 85.50, 20, 'Tecnología', 'https://picsum.photos/200?3')`);
          console.log('✨ Productos iniciales insertados automáticamente.');
        }
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    paypal_order_id TEXT,
    monto REAL,
    items TEXT,
    direccion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error al crear tabla pedidos:', err);
    } else {
      db.run(`ALTER TABLE pedidos ADD COLUMN direccion TEXT`, (alterErr) => {});
      console.log('📦 Tabla de pedidos verificada/creada correctamente (con soporte de direcciones).');
    }
  });

  // Tabla de reseñas corregida para evitar el error en reseñas.html
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    user_email TEXT,
    product_id INTEGER,
    rating INTEGER,
    comment TEXT,
    media_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error al crear la tabla de reseñas:', err);
    else console.log('⭐ Tabla de reseñas verificada/creada correctamente.');
  });
});

module.exports = db;