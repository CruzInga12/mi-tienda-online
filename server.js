// server.js - Servidor Express con SQLite, Mercado Pago, Google OAuth, Validación DNI/RUC y WhatsApp Local
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { OAuth2Client } = require('google-auth-library');
const { conectarWhatsApp, enviarAlertaWhatsApp } = require('./whatsapp-bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Iniciar la conexión del bot de WhatsApp local al arrancar el servidor
conectarWhatsApp();

// Configuración de Google OAuth Client
const GOOGLE_CLIENT_ID = '669620373732-8hbnn66m74as41kionmvrsb6440gma4i.apps.googleusercontent.com';
const clientGoogle = new OAuth2Client(GOOGLE_CLIENT_ID);

// Asegurar que exista la carpeta 'uploads' físicamente
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de Multer para guardar imágenes y videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// ==========================================
// RUTAS DE LA API Y VISTAS HTML
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/producto.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'producto.html'));
});

// Ruta para procesar el Login del Administrador
app.post('/api/login', express.json(), (req, res) => {
  const { email, password } = req.body;
  
  db.get(`SELECT * FROM admins WHERE email = ? AND password = ?`, [email, password], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Error en el servidor" });
    }
    if (row) {
      res.json({ success: true, message: "Bienvenido al panel" });
    } else {
      res.status(401).json({ success: false, message: "Correo o contraseña incorrectos" });
    }
  });
});

// Ruta para registrar un nuevo administrador (Opción B)
app.post('/api/admin/registrar', express.json(), (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "El correo y la contraseña son obligatorios" });
  }

  db.run(`INSERT INTO admins (email, password) VALUES (?, ?)`, [email, password], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ success: false, message: "Este correo ya está registrado como administrador." });
      }
      return res.status(500).json({ success: false, message: "Error al registrar el administrador" });
    }
    res.status(201).json({ success: true, message: "Administrador agregado correctamente", id: this.lastID });
  });
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

// ==========================================
// RUTAS DE RESEÑAS (REVIEWS)
// ==========================================

app.get([
  '/api/reviews', 
  '/api/reviews/product/:product_id', 
  '/api/reviews/:product_id',
  '/api/reviews/usuario/:usuario_id',
  '/api/reviews/user/:usuario_id'
], (req, res) => {
  const product_id = req.params.product_id || req.query.product_id;
  const usuario_id = req.params.usuario_id || req.query.usuario_id;

  let query = 'SELECT * FROM reviews';
  let params = [];

  if (product_id) {
    query += ' WHERE product_id = ?';
    params.push(product_id);
  } else if (usuario_id) {
    query += ' WHERE usuario_id = ?';
    params.push(usuario_id);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error al obtener reseñas:', err);
      return res.status(500).json({ error: 'Error al cargar las opiniones del servidor.' });
    }
    res.json(rows);
  });
});

app.post('/api/reviews', upload.single('media'), (req, res) => {
  const body = req.body || {};
  const { usuario_id, user_email, product_id, rating, comment } = body;
  const media_url = req.file ? `/uploads/${req.file.filename}` : (body.media_url || null);

  const query = `INSERT INTO reviews (usuario_id, user_email, product_id, rating, comment, media_url) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [usuario_id || 1, user_email || 'cliente@tienda.com', product_id || 1, rating || 5, comment || '', media_url], function(err) {
    if (err) {
      console.error('Error al guardar reseña:', err);
      return res.status(500).json({ error: 'Error al guardar la reseña' });
    }
    res.status(201).json({ mensaje: 'Reseña publicada con éxito', id: this.lastID });
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

// 3.0. Autenticación Real con Google OAuth
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;

  try {
    const ticket = await clientGoogle.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const email = payload.email;
    const nombre = payload.name;

    db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, usuario) => {
      if (err) {
        return res.status(500).json({ error: 'Error en la base de datos' });
      }

      if (usuario) {
        return res.json({
          token: `google-jwt-token-${usuario.id}`,
          usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            email: usuario.email,
            rol: usuario.rol,
            ciudad: usuario.ciudad || '',
            departamento: usuario.departamento || ''
          }
        });
      } else {
        const query = `INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)`;
        db.run(query, [nombre, email, 'GOOGLE_AUTH_SECURE'], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error al registrar usuario de Google' });
          }
          
          const nuevoUsuarioId = this.lastID;
          return res.json({
            token: `google-jwt-token-${nuevoUsuarioId}`,
            usuario: {
              id: nuevoUsuarioId,
              nombre: nombre,
              email: email,
              rol: 'cliente',
              ciudad: '',
              departamento: ''
            }
          });
        });
      }
    });

  } catch (error) {
    console.error('Error al verificar token de Google:', error);
    res.status(401).json({ error: 'Token de Google inválido' });
  }
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

// 5. Obtener historial de pedidos
app.get(['/api/pedidos/:usuario_id', '/api/admin/pedidos/:usuario_id', '/api/admin/pedidos'], (req, res) => {
  const { usuario_id } = req.params;
  const query = usuario_id 
    ? 'SELECT p.*, u.nombre as usuario_nombre, u.email FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id = u.id WHERE p.usuario_id = ? ORDER BY p.fecha DESC'
    : 'SELECT p.*, u.nombre as usuario_nombre, u.email FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id = u.id ORDER BY p.fecha DESC';
  const params = usuario_id ? [usuario_id] : [];

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Error al consultar pedidos:", err);
      return res.status(500).json({ error: 'Error al consultar historial' });
    }
    res.json(rows);
  });
});

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

// 6. Registrar un pedido completado, descontar stock y enviar alertas automatizadas por WhatsApp local
app.post(['/api/pedidos', '/api/admin/pedidos'], (req, res) => {
  const body = req.body || {};
  const { usuario_id, paypal_order_id, monto, items, direccion } = body;

  const itemsJSON = typeof items === 'string' ? items : JSON.stringify(items || []);
  const direccionJSON = typeof direccion === 'string' ? direccion : JSON.stringify(direccion || {});

  let productosArray = [];
  try {
    productosArray = typeof items === 'string' ? JSON.parse(items) : (items || []);
  } catch (e) {
    productosArray = [];
  }

  let montoFinal = Number(monto || 0);
  if (montoFinal <= 0 && productosArray.length > 0) {
    montoFinal = productosArray.reduce((acc, prod) => {
      const precio = Number(prod.precio || prod.price || 0);
      const cantidad = Number(prod.cantidad || prod.quantity || 1);
      return acc + (precio * cantidad);
    }, 0);
  }

  const query = `INSERT INTO pedidos (usuario_id, paypal_order_id, monto, items, direccion) VALUES (?, ?, ?, ?, ?)`;

  db.run(query, [usuario_id || 1, paypal_order_id || 'MP-' + Date.now(), montoFinal, itemsJSON, direccionJSON], function (err) {
    if (err) {
      console.error('Error al registrar pedido:', err);
      return res.status(500).json({ error: 'Error al registrar el pedido' });
    }

    const pedidoId = this.lastID;

    productosArray.forEach(prod => {
      const prodId = prod.id;
      const cantidadComprada = Number(prod.cantidad || prod.quantity || 1);
      if (prodId) {
        db.run(`UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?`, [cantidadComprada, prodId], (updateErr) => {
          if (updateErr) console.error(`Error al actualizar stock para producto ID ${prodId}:`, updateErr);
        });
      }
    });

    // 📱 LISTA DE NÚMEROS DE LOS TRABAJADORES (Agrega o quita los que necesites)
    const numerosDestino = ["51929991971", "51987292038", "51949769145"];
    
    const detalleProductosText = productosArray.map(i => `• ${i.cantidad || i.quantity || 1}x ${i.nombre || i.title || 'Producto'}`).join('\n');

    const mensajeServidor = 
`🚨 *¡NUEVA VENTA REGISTRADA PARA EMPAQUETADO!* 🛒
───────────────────
💵 *Monto Total:* S/ ${Number(montoFinal).toFixed(2)}

📦 *Detalle del Pedido:*
${detalleProductosText}

📌 *Estado:* Pedido guardado y stock descontado. ¡Listo para empaquetar y enviar!
───────────────────
👉 _Revisa el panel de administración._`;

    // Enviar alerta de WhatsApp a cada número de la lista automáticamente
    numerosDestino.forEach(async (num) => {
        try {
            await enviarAlertaWhatsApp(num, mensajeServidor);
        } catch (err) {
            console.error(`Error al enviar WhatsApp al número ${num}:`, err);
        }
    });

    res.status(201).json({ mensaje: 'Pedido registrado correctamente, stock actualizado y alertas enviadas', pedidoId });
  });
});

// Validación DNI/RUC
app.post('/api/verificar-documento', async (req, res) => {
    const { tipo, numero, emailUsuario, nombreUsuario } = req.body;
    
    if (!tipo || !numero) {
        return res.status(400).json({ valido: false, mensaje: "Faltan datos para la verificación." });
    }

    const docLimpio = String(numero).trim();

    if (tipo === 'DNI' && !/^\d{8}$/.test(docLimpio)) {
        return res.status(400).json({ valido: false, mensaje: "El DNI debe contener exactamente 8 dígitos numéricos." });
    }
    if (tipo === 'RUC' && !/^\d{11}$/.test(docLimpio)) {
        return res.status(400).json({ valido: false, mensaje: "El RUC debe tener 11 dígitos." });
    }

    try {
        db.get(`SELECT nombre FROM usuarios WHERE email = ?`, [emailUsuario], async (err, usuarioDB) => {
            const normalizar = (texto) => {
                return (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            };

            const nombreCuenta = normalizar(usuarioDB ? usuarioDB.nombre : (nombreUsuario || ""));

            const TOKEN_DECOLECTA = process.env.API_TOKEN_PERU || "sk_20486.C3Wm73CKbkdN7R1An76sPk8T8uh7VCQC"; 
            const url = tipo === 'DNI' 
                ? `https://api.decolecta.com/v1/reniec/dni?numero=${docLimpio}`
                : `https://api.decolecta.com/v1/sunat/ruc?numero=${docLimpio}`;

            const respuestaExterna = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${TOKEN_DECOLECTA}`
                }
            });

            const data = await respuestaExterna.json();

            if (respuestaExterna.ok && data) {
                if (tipo === 'DNI') {
                    const apellidoPaternoReniec = normalizar(data.first_last_name || data.first_name);
                    const apellidoMaternoReniec = normalizar(data.second_last_name);

                    if (nombreCuenta) {
                        const coincide = (apellidoPaternoReniec && nombreCuenta.includes(apellidoPaternoReniec)) || 
                                         (apellidoMaternoReniec && nombreCuenta.includes(apellidoMaternoReniec));

                        if (!coincide) {
                            return res.status(403).json({ 
                                valido: false, 
                                mensaje: "✖ El DNI ingresado no corresponde a los apellidos de tu cuenta." 
                            });
                        }
                    }
                }

                return res.json({ 
                    valido: true, 
                    mensaje: `✔ Verificado con éxito. El documento coincide con el titular de la cuenta.` 
                });
            } else {
                return res.status(404).json({ 
                    valido: false, 
                    mensaje: "El número ingresado no registra datos activos en los patrones oficiales." 
                });
            }
        });

    } catch (error) {
        console.error("Error al comunicar con Decolecta:", error);
        return res.status(500).json({ 
            valido: false, 
            mensaje: "Error de comunicación con el servicio de validación." 
        });
    }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});