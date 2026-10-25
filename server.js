// server.js - Servidor Express con SQLite, Mercado Pago (Tarjetas + Yape Automático), Google OAuth y WhatsApp Local
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { OAuth2Client } = require('google-auth-library');
const { conectarWhatsApp, enviarAlertaWhatsApp } = require('./whatsapp-bot');

const app = express();
const PORT = process.env.PORT || 3000;

conectarWhatsApp();

const GOOGLE_CLIENT_ID = '669620373732-8hbnn66m74as41kionmvrsb6440gma4i.apps.googleusercontent.com';
const clientGoogle = new OAuth2Client(GOOGLE_CLIENT_ID);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || 'APP_USR-5958010329830678-091523-57d5cabea7c332d13b1f3592154a5d9c-3677734344' 
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/producto.html', (req, res) => res.sendFile(path.join(__dirname, 'producto.html')));

app.post('/api/login', express.json(), (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM admins WHERE email = ? AND password = ?`, [email, password], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: "Error en el servidor" });
    if (row) res.json({ success: true, message: "Bienvenido al panel" });
    else res.status(401).json({ success: false, message: "Correo o contraseña incorrectos" });
  });
});

app.post('/api/admin/registrar', express.json(), (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "El correo y la contraseña son obligatorios" });

  db.run(`INSERT INTO admins (email, password) VALUES (?, ?)`, [email, password], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ success: false, message: "Este correo ya está registrado como administrador." });
      return res.status(500).json({ success: false, message: "Error al registrar el administrador" });
    }
    res.status(201).json({ success: true, message: "Administrador agregado correctamente", id: this.lastID });
  });
});

app.get(['/api/productos', '/api/admin/productos'], (req, res) => {
  db.all('SELECT * FROM productos', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener productos' });
    res.json(rows);
  });
});

app.post(['/api/productos', '/api/admin/productos'], upload.single('imagen'), (req, res) => {
  const body = req.body || {};
  const nombre = body.nombre || body.name || body.titulo || body.productName || 'Producto sin nombre';
  const precio = body.precio || body.price || body.costo || 0;
  const stock = body.stock || body.cantidad || body.quantity || 0;
  const categoria = body.categoria || body.category || 'General';
  const imagen = req.file ? `/uploads/${req.file.filename}` : (body.imagen || body.image || 'https://picsum.photos/150');

  const query = `INSERT INTO productos (nombre, precio, stock, categoria, imagen) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [nombre, Number(precio), Number(stock), categoria, imagen], function (err) {
    if (err) return res.status(500).json({ error: 'Error al registrar el producto en la base de datos' });
    res.status(201).json({ mensaje: 'Producto guardado correctamente', id: this.lastID });
  });
});

app.delete(['/api/productos/:id', '/api/admin/productos/:id'], (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM productos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar el producto' });
    if (this.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto eliminado correctamente', id });
  });
});

app.get(['/api/productos/:id', '/api/admin/productos/:id', '/api/products/:id'], (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM productos WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(row);
  });
});

app.put(['/api/productos/:id', '/api/admin/productos/:id'], upload.single('imagen'), (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const nombre = body.nombre || body.name;
  const precio = body.precio || body.price;
  const stock = body.stock || body.quantity;
  const categoria = body.categoria || body.category || 'General';

  let imagenNueva = req.file ? `/uploads/${req.file.filename}` : (body.imagen || body.image || null);
  const query = imagenNueva 
    ? `UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria = ?, imagen = ? WHERE id = ?`
    : `UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria = ? WHERE id = ?`;
  const params = imagenNueva ? [nombre, Number(precio), Number(stock), categoria, imagenNueva, id] : [nombre, Number(precio), Number(stock), categoria, id];

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: 'Error al actualizar el producto' });
    res.json({ mensaje: 'Producto actualizado correctamente' });
  });
});

app.get(['/api/categorias', '/api/admin/categorias'], (req, res) => {
  db.all('SELECT DISTINCT categoria FROM productos WHERE categoria IS NOT NULL AND categoria != ""', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener categorías' });
    res.json(rows.map(row => row.categoria));
  });
});

// Reseñas generales y por producto
app.get(['/api/reviews', '/api/reviews/product/:product_id', '/api/reviews/:product_id'], (req, res) => {
  const product_id = req.params.product_id || req.query.product_id;
  let query = 'SELECT * FROM reviews';
  let params = [];
  if (product_id) {
    query += ' WHERE product_id = ?';
    params.push(product_id);
  }
  query += ' ORDER BY created_at DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al cargar opiniones' });
    res.json(rows);
  });
});

// NUEVO: Ruta específica para obtener reseñas por usuario (soluciona el error en reseñas.html)
app.get('/api/reviews/user/:usuario_id', (req, res) => {
  const { usuario_id } = req.params;
  const query = `
    SELECT r.*, p.nombre as producto_nombre, p.imagen as producto_imagen 
    FROM reviews r 
    LEFT JOIN productos p ON r.product_id = p.id 
    WHERE r.usuario_id = ? 
    ORDER BY r.created_at DESC
  `;
  db.all(query, [usuario_id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener reseñas del usuario' });
    res.json(rows);
  });
});

app.post('/api/reviews', upload.single('media'), (req, res) => {
  const body = req.body || {};
  const { usuario_id, user_email, product_id, rating, comment } = body;
  const media_url = req.file ? `/uploads/${req.file.filename}` : (body.media_url || null);

  const query = `INSERT INTO reviews (usuario_id, user_email, product_id, rating, comment, media_url) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [usuario_id || 1, user_email || 'cliente@tienda.com', product_id || 1, rating || 5, comment || '', media_url], function(err) {
    if (err) return res.status(500).json({ error: 'Error al guardar la reseña' });
    res.status(201).json({ mensaje: 'Reseña publicada con éxito', id: this.lastID });
  });
});

app.post('/api/register', (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Todos los campos son obligatorios.' });

  const query = `INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)`;
  db.run(query, [nombre, email, password], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
      return res.status(500).json({ error: 'Error al registrar usuario.' });
    }
    res.status(201).json({ mensaje: 'Usuario registrado con éxito', usuarioId: this.lastID });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  db.get('SELECT * FROM usuarios WHERE email = ? AND password = ?', [email, password], (err, usuario) => {
    if (err || !usuario) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    res.json({
      token: `fake-jwt-token-${usuario.id}`,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, ciudad: usuario.ciudad || '', departamento: usuario.departamento || '' }
    });
  });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await clientGoogle.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const nombre = payload.name;

    db.get('SELECT * FROM usuarios WHERE email = ?', [email], (err, usuario) => {
      if (err) return res.status(500).json({ error: 'Error en la base de datos' });
      if (usuario) {
        return res.json({ token: `google-jwt-token-${usuario.id}`, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, ciudad: usuario.ciudad || '', departamento: usuario.departamento || '' } });
      } else {
        db.run(`INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)`, [nombre, email, 'GOOGLE_AUTH_SECURE'], function(err) {
          if (err) return res.status(500).json({ error: 'Error al registrar usuario de Google' });
          return res.json({ token: `google-jwt-token-${this.lastID}`, usuario: { id: this.lastID, nombre, email, rol: 'cliente', ciudad: '', departamento: '' } });
        });
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Token de Google inválido' });
  }
});

app.put('/api/actualizar-perfil', (req, res) => {
  const { id, nombre, ciudad, departamento } = req.body;
  db.run(`UPDATE usuarios SET nombre = ?, ciudad = ?, departamento = ? WHERE id = ?`, [nombre, ciudad, departamento, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Perfil actualizado correctamente' });
  });
});

app.put('/api/actualizar-password', (req, res) => {
  const { id, passwordActual, passwordNueva } = req.body;
  db.get('SELECT * FROM usuarios WHERE id = ?', [id], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (usuario.password !== passwordActual) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });

    db.run('UPDATE usuarios SET password = ? WHERE id = ?', [passwordNueva, id], function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar la contraseña' });
      res.json({ message: 'Contraseña actualizada correctamente' });
    });
  });
});

app.post('/api/pagar-yape', async (req, res) => {
  try {
    const { phoneNumber, otp, items, usuario_id, email } = req.body;
    if (!phoneNumber || !otp || !items || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos requeridos (número, código OTP o carrito).' });
    }

    const montoTotal = items.reduce((sum, i) => sum + (Number(i.precio || 0) * Number(i.cantidad || 1)), 0);

    const payment = new Payment(client);
    const result = await payment.create({
      body: {
        transaction_amount: Number(montoTotal.toFixed(2)),
        description: `Compra en Tienda RAIV - Usuario #${usuario_id}`,
        payment_method_id: 'yape',
        payer: {
          email: email || 'cliente@tienda.com',
        },
        token: otp,
      }
    });

    if (result.status === 'approved') {
      res.json({ success: true, payment_id: result.id, status: result.status });
    } else {
      res.status(400).json({ success: false, error: 'No se pudo procesar el pago con Yape. Revisa el saldo o el código ingresado.' });
    }

  } catch (error) {
    console.error('Error al procesar pago Yape:', error);
    res.status(500).json({ error: error.message || 'Error interno al procesar con Yape.' });
  }
});

app.post('/api/crear-preferencia', async (req, res) => {
  try {
    const body = req.body || {};
    const { items, usuario_id } = body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'El carrito está vacío' });

    const mpItems = items.map(item => {
      const precioBase = Number(item.precio || item.price || 0);
      const cantidad = Number(item.cantidad || item.quantity || 1);
      const precioAjustado = Number((precioBase * 1.0388 + (1.18 / cantidad)).toFixed(2));

      return {
        id: String(item.id),
        title: String(item.nombre || item.title || 'Producto'),
        quantity: cantidad,
        unit_price: precioAjustado,
        currency_id: 'PEN'
      };
    });

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: mpItems,
        external_reference: String(usuario_id || '1'),
        back_urls: {
          success: "https://tienda-online-cruz.onrender.com/historial.html?status=approved",
          failure: "https://tienda-online-cruz.onrender.com/index.html",
          pending: "https://tienda-online-cruz.onrender.com/index.html"
        }
      }
    });

    if (!result.init_point) return res.status(500).json({ error: 'No se pudo obtener la pasarela' });
    res.json({ id: result.id, init_point: result.init_point });

  } catch (error) {
    res.status(500).json({ error: error.message || 'Error en pasarela de pago' });
  }
});

app.get(['/api/pedidos/:usuario_id', '/api/admin/pedidos/:usuario_id', '/api/admin/pedidos'], (req, res) => {
  const { usuario_id } = req.params;
  const query = usuario_id 
    ? 'SELECT p.*, u.nombre as usuario_nombre, u.email FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id = u.id WHERE p.usuario_id = ? ORDER BY p.fecha DESC'
    : 'SELECT p.*, u.nombre as usuario_nombre, u.email FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id = u.id ORDER BY p.fecha DESC';
  
  db.all(query, usuario_id ? [usuario_id] : [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar historial' });
    res.json(rows);
  });
});

app.get('/api/pedido-detalle/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Pedido no encontrado' });
    try { if (typeof row.items === 'string') row.items = JSON.parse(row.items); } catch (e) { row.items = []; }
    res.json(row);
  });
});

app.post(['/api/pedidos', '/api/admin/pedidos'], (req, res) => {
  const body = req.body || {};
  const { usuario_id, paypal_order_id, monto, items, direccion } = body;
  const itemsJSON = typeof items === 'string' ? items : JSON.stringify(items || []);
  const direccionJSON = typeof direccion === 'string' ? direccion : JSON.stringify(direccion || {});

  let productosArray = [];
  try { productosArray = typeof items === 'string' ? JSON.parse(items) : (items || []); } catch (e) { productosArray = []; }

  let montoFinal = Number(monto || 0);
  if (montoFinal <= 0 && productosArray.length > 0) {
    montoFinal = productosArray.reduce((acc, prod) => acc + (Number(prod.precio || 0) * Number(prod.cantidad || 1)), 0);
  }

  const query = `INSERT INTO pedidos (usuario_id, paypal_order_id, monto, items, direccion) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [usuario_id || 1, paypal_order_id || 'MP-' + Date.now(), montoFinal, itemsJSON, direccionJSON], function (err) {
    if (err) return res.status(500).json({ error: 'Error al registrar el pedido' });

    const pedidoId = this.lastID;
    productosArray.forEach(prod => {
      if (prod.id) {
        db.run(`UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?`, [Number(prod.cantidad || 1), prod.id]);
      }
    });

    const numerosDestino = ["51929991971", "51987292038", "51949769145"];
    const detalleProductosText = productosArray.map(i => `• ${i.cantidad || 1}x ${i.nombre || 'Producto'}`).join('\n');
    const mensajeServidor = 
`🚨 *¡NUEVA VENTA REGISTRADA PARA EMPAQUETADO!* 🛒
───────────────────
💵 *Monto Total:* S/ ${Number(montoFinal).toFixed(2)}

📦 *Detalle del Pedido:*
${detalleProductosText}

📌 *Estado:* Pago confirmado automáticamente. ¡Listo para enviar!`;

    numerosDestino.forEach(async (num) => {
      try { await enviarAlertaWhatsApp(num, mensajeServidor); } catch (e) {}
    });

    res.status(201).json({ mensaje: 'Pedido registrado correctamente', pedidoId });
  });
});

app.post('/api/verificar-documento', async (req, res) => {
  const { tipo, numero, emailUsuario, nombreUsuario } = req.body;
  if (!tipo || !numero) return res.status(400).json({ valido: false, mensaje: "Faltan datos." });

  const docLimpio = String(numero).trim();
  if (tipo === 'DNI' && !/^\d{8}$/.test(docLimpio)) return res.status(400).json({ valido: false, mensaje: "El DNI debe tener 8 dígitos." });
  if (tipo === 'RUC' && !/^\d{11}$/.test(docLimpio)) return res.status(400).json({ valido: false, mensaje: "El RUC debe tener 11 dígitos." });

  try {
    db.get(`SELECT nombre FROM usuarios WHERE email = ?`, [emailUsuario], async (err, usuarioDB) => {
      const normalizar = (texto) => (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
      const nombreCuenta = normalizar(usuarioDB ? usuarioDB.nombre : (nombreUsuario || ""));

      const TOKEN_DECOLECTA = process.env.API_TOKEN_PERU || "sk_20486.C3Wm73CKbkdN7R1An76sPk8T8uh7VCQC"; 
      const url = tipo === 'DNI' ? `https://api.decolecta.com/v1/reniec/dni?numero=${docLimpio}` : `https://api.decolecta.com/v1/sunat/ruc?numero=${docLimpio}`;

      const respuestaExterna = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${TOKEN_DECOLECTA}` } });
      const data = await respuestaExterna.json();

      if (respuestaExterna.ok && data) {
        if (tipo === 'DNI' && nombreCuenta) {
          const apPat = normalizar(data.first_last_name || data.first_name);
          const apMat = normalizar(data.second_last_name);
          if (!((apPat && nombreCuenta.includes(apPat)) || (apMat && nombreCuenta.includes(apMat)))) {
            return res.status(403).json({ valido: false, mensaje: "El DNI no corresponde al titular de la cuenta." });
          }
        }
        return res.json({ valido: true, mensaje: "Verificado con éxito." });
      } else {
        return res.status(404).json({ valido: false, mensaje: "Documento no hallado en padrones." });
      }
    });
  } catch (error) {
    return res.status(500).json({ valido: false, mensaje: "Error en validación." });
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`));