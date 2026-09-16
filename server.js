// server.js - Servidor Express con SQLite y Mercado Pago integrado al 100%

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer'); // <- 1. Importado para manejar subida de archivos
const db = require('./database'); // Importa la conexión SQLite proporcionada
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Multer para guardar imágenes en la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, __dirname + '/uploads'); // Carpeta física de destino
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // <- 2. Hace pública la carpeta de imágenes locales

// ==========================================
// RUTAS DE LA API
// ==========================================

// 1. Obtener catálogo de productos
app.get(['/api/productos', '/api/admin/productos'], (req, res) => {
  db.all('SELECT * FROM productos', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(rows);
  });
});

// 1.1. Crear / Guardar un nuevo producto (Actualizado con upload.single para recibir archivos)
app.post(['/api/productos', '/api/admin/productos'], upload.single('imagen'), (req, res) => {
  console.log('Datos recibidos en el servidor:', req.body);
  console.log('Archivo de imagen recibido:', req.file);

  const body = req.body || {};
  
  const nombre = body.nombre || body.name || body.titulo || body.productName || 'Producto sin nombre';
  const precio = body.precio || body.price || body.costo || 0;
  const stock = body.stock || body.cantidad || body.quantity || 0;
  const categoria = body.categoria || body.category || 'General';

  // Si adjuntó archivo desde la PC usa esa ruta local, de lo contrario revisa si mandó texto o usa una por defecto
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

// 1.3. Obtener un solo producto por ID (Para rellenar el modal de edición)
app.get(['/api/productos/:id', '/api/admin/productos/:id'], (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(row);
  });
});

// 1.4. Actualizar un producto existente (Actualizado con upload.single para permitir cambiar la foto localmente)
app.put(['/api/productos/:id', '/api/admin/productos/:id'], upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  
  const nombre = body.nombre || body.name;
  const precio = body.precio || body.price;
  const stock = body.stock || body.quantity;
  const categoria = body.categoria || body.category || 'General';

  // Determinamos si subió un archivo nuevo o si mandó un texto de imagen, o si conserva la anterior
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

// 1.5. Obtener la lista de categorías únicas para la tienda
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

// 3.2. Actualizar contraseña de usuario (AÑADIDO POR SEGURIDAD)
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
      title: String(item.nombre),
      quantity: Number(item.cantidad),
      unit_price: Number(item.precio),
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

// Servidor escuchando
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});