const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'tienda.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('📦 Conectado a la base de datos SQLite.');
  }
});

db.serialize(() => {
  // Tabla Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT DEFAULT 'cliente'
    )
  `);

  // Tabla Pedidos
  db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      paypal_order_id TEXT,
      monto REAL NOT NULL,
      items TEXT NOT NULL,
      estado TEXT DEFAULT 'completado',
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  // Tabla Productos con Categoría
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      categoria TEXT DEFAULT 'General',
      imagen TEXT,
      stock INTEGER NOT NULL DEFAULT 10
    )
  `, () => {
    db.get(`SELECT COUNT(*) AS total FROM productos`, (err, row) => {
      if (row && row.total === 0) {
        const stmt = db.prepare(`INSERT INTO productos (nombre, precio, categoria, imagen, stock) VALUES (?, ?, ?, ?, ?)`);
        stmt.run('Audífonos Bluetooth', 85.00, 'Audio', 'https://via.placeholder.com/150', 15);
        stmt.run('Teclado Mecánico RGB', 150.00, 'Periféricos', 'https://via.placeholder.com/150', 8);
        stmt.run('Mouse Gamer', 60.00, 'Periféricos', 'https://via.placeholder.com/150', 20);
        stmt.run('Monitor 24 pulgadas', 450.00, 'Monitores', 'https://via.placeholder.com/150', 5);
        stmt.finalize(() => console.log('✅ Productos con categoría insertados en la BD.'));
      }
    });
  });
});

module.exports = db;