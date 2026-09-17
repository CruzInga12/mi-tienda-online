// server.js - Servidor Express con SQLite y Mercado Pago integrado al 100%

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // <- 1. Importado para manejar subida de archivos
const db = require('./database'); // Importa la conexión SQLite proporcionada
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// Asegurar que exista la carpeta 'uploads' físicamente
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de Multer para guardar imágenes y videos en la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Carpeta física de destino
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // Nombre único para evitar conflictos
  }
});
const upload = multer({ storage: storage });

// Configuración de Mercado Pago SDK v3+
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || 'APP_USR-2662506915333584-091523-2da72870661de58e6154a968b3beacad-3678396727' 
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Permite leer formularios HTML clásicos
app.use(express.static(__dirname)); // Sirve archivos estáticos
app.use('/uploads', express.static(uploadDir)); // Hace pública la carpeta local

// ==========================================
// INICIALIZACIÓN DE TABLAS EN LA BASE DE DATOS
// ==========================================
db.serialize(() => {
  // Tabla de Usuarios
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

  // Tabla de Productos
  db.run(`CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    precio REAL,
    stock INTEGER,
    categoria TEXT,
    imagen TEXT
  )`, (err) => {
    if (err) console.error('Error al crear tabla productos:', err);
    else console.log('🛍️ Tabla de productos verificada/creada correctamente.');
  });

  // Tabla de Pedidos
  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    paypal_order_id TEXT,
    monto REAL,
    items TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('Error al crear tabla pedidos:', err);
    else console.log('📦 Tabla de pedidos verificada/creada correctamente.');
  });

  // Tabla de Reseñas
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
    if (err) {
      console.error('Error al crear la tabla de reseñas:', err);
    } else {
      console.log('⭐ Tabla de reseñas verificada/creada correctamente.');
    }
  });
});

// ==========================================
// RUTAS DE LA API Y VISTAS HTML
// ==========================================

// Ruta explícita para el detalle del producto (Soluciona el error Cannot GET /producto.html)
app.get('/producto.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'producto.html'));
});

// 1. Obtener catálogo de productos
app.get(['/api/productos', '/api/admin/productos'], (req, res) => {
  db.all('SELECT * FROM productos', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(rows);
  });
});

// 1.1. Crear / Guardar un nuevo producto
app.post(['/api/productos', '/api/admin/productos'], upload.single('imagen'), (req, res) => {
  const body = req.body || {};
  
  const nombre = body.nombre || body.name || body.titulo || body.productName || 'Producto sin nombre';
  const precio = body.precio || body.price || body.costo || 0;
  const stock = body.stock || body.cantidad || body.quantity || 0;
  const categoria = body.categoria || body.category || 'General';

  const imagen = req.file 
    ? `/uploads/${req.file.filename}` 
    : (body.imagen || body.image || 'https://picsum.photos/150');

  const query = `INSERT INTO productos (nombre, precio, stock, categoria, imagen) VALUES (?, ?, ?, ?, ?)`;
  const params = [nombre, Number(precio), Number(stock), categoria, imagen];

  db.run(query, params, function (err) {
    if (err) {
      console.error('Error al guardar producto en BD:', err);
      return res.status(500).json({ error: 'Error al registrar el producto en la base de datos' });
    }
    res.status(201).json({ 
      mensaje: 'Producto guardado correctamente', 
      id: this.lastID 
    });
  });
});

// 1.2. Eliminar un producto por ID
app.delete(['/api/productos/:id', '/api/admin/productos/:id'], (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM productos WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Error al eliminar producto:', err);
      return res.status(500).json({ error: 'Error al eliminar el producto de la base de datos' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto eliminado correctamente', id });
  });
});

// 1.3. Obtener un solo producto por ID
app.get(['/api/productos/:id', '/api/admin/productos/:id', '/api/products/:id'], (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(row);
  });
});

// 1.4. Actualizar un producto existente
app.put(['/api/productos/:id', '/api/admin/productos/:id'], upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  
  const nombre = body.nombre || body.name;
  const precio = body.precio || body.price;
  const stock = body.stock || body.quantity;
  const categoria = body.categoria || body.category || 'General';

  let imagenNueva = null;
  if (req.file) {
    imagenNueva = `/uploads/${req.file.filename}`;
  } else if (body.imagen || body.image) {
    imagenNueva = body.imagen || body.image;
  }

  const query = imagenNueva 
    ? `UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria = ?, imagen = ? WHERE id = ?`
    : `UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria = ? WHERE id = ?`;
  
  const params = imagenNueva ? [nombre, Number(precio), Number(stock), categoria, imagenNueva, id] : [nombre, Number(precio), Number(stock), categoria, id];

  db.run(query, params, function (err) {
    if (err) {
      console.error('Error al actualizar producto:', err);
      return res.status(500).json({ error: 'Error al actualizar el producto' });
    }
    res.json({ mensaje: 'Producto actualizado correctamente' });
  });
});

// 1.5. Obtener la lista de categorías únicas
app.get(['/api/categorias', '/api/admin/categorias'], (req, res) => {
  db.all('SELECT DISTINCT categoria FROM productos WHERE categoria IS NOT NULL AND categoria != ""', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener categorías' });
    }
    const categorias = rows.map(row => row.categoria);
    res.json(categorias);
  });
});

// 2. Registrar nuevo usuario
app.post('/api/register', (req, res) => {
  const body = req.body || {};
  const { nombre, email, password } = body;
  
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const query = `INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)`;
  db.run(query, [nombre, email, password], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
      }
      return res.status(500).json({ error: 'Error al registrar usuario.' });
    }
    res.status(201).json({ mensaje: 'Usuario registrado con éxito', usuarioId: this.lastID });
  });
});

// 3. Inicio de sesión
app.post('/api/login', (req, res) => {
  const body = req.body || {};
  const { email, password } = body;
  
  db.get('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password], (err, usuario) => {
    if (err || !usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    
    res.json({
      token: `fake-jwt-token-${usuario.id}`,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        ciudad: usuario.ciudad || '',
        departamento: usuario.departamento || ''
      }
    });
  });
});

// 3.1. Actualizar perfil de usuario
app.put('/api/actualizar-perfil', (req, res) => {
  const { id, nombre, ciudad, departamento } = req.body;

  const query = `UPDATE usuarios SET nombre = ?, ciudad = ?, departamento = ? WHERE id = ?`;
  db.run(query, [nombre, ciudad, departamento, id], function(err) {
    if (err) {
      console.error('Error al actualizar perfil:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Perfil actualizado correctamente' });
  });
});

// 3.2. Actualizar contraseña de usuario
app.put('/api/actualizar-password', (req, res) => {
  const { id, passwordActual, passwordNueva } = req.body;

  db.get('SELECT * FROM usuarios WHERE id = ?', [id], (err, usuario) => {
    if (err || !usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (usuario.password !== passwordActual) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    }

    db.run('UPDATE usuarios SET password = ? WHERE id = ?', [passwordNueva, id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar la contraseña' });
      }
      res.json({ message: 'Contraseña actualizada correctamente' });
    });
  });
});

// 4. Crear preferencia de pago con Mercado Pago
app.post('/api/crear-preferencia', async (req, res) => {
  try {
    const body = req.body || {};
    const { items, usuario_id } = body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    const mpItems = items.map(item => ({
      id: String(item.id),
      title: String(item.nombre || item.title || 'Producto'),
      quantity: Number(item.cantidad || item.quantity || 1),
      unit_price: Number(item.precio || item.price || 0),
      currency_id: 'PEN'
    }));

    const preference = new Preference(client);
    
    const result = await preference.create({
      body: {
        items: mpItems,
        external_reference: String(usuario_id || '1'),
        back_urls: {
          success: "http://localhost:3000/historial.html?status=approved",
          failure: "http://localhost:3000/index.html",
          pending: "http://localhost:3000/index.html"
        }
      }
    });

    if (!result.init_point) {
      return res.status(500).json({ error: 'No se pudo obtener el punto de inicio de Mercado Pago' });
    }

    res.json({ 
      id: result.id, 
      init_point: result.init_point 
    });

  } catch (error) {
    console.error('Error detallado en Mercado Pago:', error);
    res.status(500).json({ error: error.message || 'No se pudo generar la pasarela de pago' });
  }
});

// 5. Obtener historial de pedidos de un usuario
app.get(['/api/pedidos/:usuario_id', '/api/admin/pedidos/:usuario_id', '/api/admin/pedidos'], (req, res) => {
  const { usuario_id } = req.params;
  
  const query = usuario_id 
    ? 'SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY fecha DESC'
    : 'SELECT * FROM pedidos ORDER BY fecha DESC';
  
  const params = usuario_id ? [usuario_id] : [];

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al consultar historial' });
    }
    res.json(rows);
  });
});

// 5.1 Obtener detalle completo de un pedido por ID
app.get('/api/pedido-detalle/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    try {
      if (typeof row.items === 'string') {
        row.items = JSON.parse(row.items);
      }
    } catch (e) {
      row.items = [];
    }
    res.json(row);
  });
});

// 6. Registrar un pedido completado en la base de datos
app.post(['/api/pedidos', '/api/admin/pedidos'], (req, res) => {
  const body = req.body || {};
  const { usuario_id, paypal_order_id, monto, items } = body;

  const itemsJSON = typeof items === 'string' ? items : JSON.stringify(items || []);
  const query = `INSERT INTO pedidos (usuario_id, paypal_order_id, monto, items) VALUES (?, ?, ?, ?)`;

  db.run(query, [usuario_id || 1, paypal_order_id || 'MP-' + Date.now(), monto || 0, itemsJSON], function (err) {
    if (err) {
      console.error('Error al registrar pedido:', err);
      return res.status(500).json({ error: 'Error al registrar el pedido' });
    }
    res.status(201).json({ mensaje: 'Pedido registrado correctamente', pedidoId: this.lastID });
  });
});

// ==========================================
// RUTAS DE RESEÑAS Y VIDEOS
// ==========================================

// 7. Crear una reseña con foto o video opcional
app.post('/api/reviews', upload.single('media'), (req, res) => {
  const { usuario_id, user_email, product_id, rating, comment } = req.body;
  const media_url = req.file ? `/uploads/${req.file.filename}` : null;

  const query = `INSERT INTO reviews (usuario_id, user_email, product_id, rating, comment, media_url) VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [usuario_id || 1, user_email || 'Anónimo', product_id, rating || 5, comment || '', media_url];

  db.run(query, params, function (err) {
    if (err) {
      console.error('Error al guardar reseña:', err);
      return res.status(500).json({ error: 'Error al guardar la reseña' });
    }
    res.status(201).json({ mensaje: 'Reseña agregada con éxito', reviewId: this.lastID, media_url });
  });
});

// 8. Obtener reseñas de un producto específico
app.get('/api/reviews/product/:product_id', (req, res) => {
  const { product_id } = req.params;
  db.all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [product_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener reseñas' });
    }
    res.json(rows);
  });
});

// 9. Obtener las reseñas hechas por un usuario (Para la sección "Tus reseñas")
app.get('/api/reviews/user/:usuario_id', (req, res) => {
  const { usuario_id } = req.params;
  db.all(`
    SELECT reviews.*, productos.nombre AS producto_nombre, productos.imagen AS producto_imagen 
    FROM reviews 
    LEFT JOIN productos ON reviews.product_id = productos.id 
    WHERE reviews.usuario_id = ? 
    ORDER BY reviews.created_at DESC
  `, [usuario_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener las reseñas del usuario' });
    }
    res.json(rows);
  });
});

// Servidor escuchando
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});