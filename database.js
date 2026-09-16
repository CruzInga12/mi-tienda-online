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
  // Tabla Usuarios (Con campos de ciudad y departamento añadidos)
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT DEFAULT 'cliente',
      ciudad TEXT DEFAULT '',
      departamento TEXT DEFAULT ''
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
        
        // Productos con imágenes estables y funcionales
        stmt.run('Audífonos Bluetooth', 85.00, 'Audio', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300', 15);
        stmt.run('Teclado Mecánico RGB', 150.00, 'Periféricos', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300', 8);
        stmt.run('Mouse Gamer', 60.00, 'Periféricos', 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=300', 20);
        stmt.run('Monitor 24 pulgadas', 450.00, 'Monitores', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=300', 5);
        
        stmt.finalize(() => console.log('✅ Productos con categoría e imágenes estables insertados en la BD.'));
      }
    });
  });
});

module.exports = db;