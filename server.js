const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_tienda';

// CONFIGURACIÓN DE NODEMAILER (Transportador)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const tokenMP = process.env.MERCADOPAGO_ACCESS_TOKEN;
console.log('🔑 Token de Mercado Pago cargado:', tokenMP ? `${tokenMP.substring(0, 15)}...` : 'NO ENCONTRADO');

const client = new MercadoPagoConfig({ accessToken: tokenMP || '' });

app.use(cors());

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https://*.mercadopago.com https://*.mercadolibre.com; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.mercadopago.com https://*.mercadolibre.com; " +
    "connect-src 'self' https://*.mercadopago.com https://*.mercadolibre.com; " +
    "frame-src 'self' https://*.mercadopago.com https://*.mercadolibre.com; " +
    "style-src 'self' 'unsafe-inline' https://*.mercadopago.com;"
  );
  next();
});

app.use(express.json());
app.use(express.static('.'));

// --- RUTAS DE PRODUCTOS ---
app.get('/api/productos', (req, res) => {
  const { buscar, categoria } = req.query;
  let query = `SELECT * FROM productos WHERE 1=1`;
  let params = [];

  if (buscar && buscar.trim() !== '') {
    query += ` AND LOWER(nombre) LIKE LOWER(?)`;
    params.push(`%${buscar.trim()}%`);
  }

  if (categoria && categoria !== 'Todas') {
    query += ` AND LOWER(categoria) = LOWER(?)`;
    params.push(categoria.trim());
  }

  db.all(query, params, (err, filas) => {
    if (err) {
      console.error('Error al consultar productos:', err.message);
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(filas);
  });
});

// --- RUTAS DE USUARIOS Y AUTENTICACIÓN ---
app.post('/api/register', async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos incompletos.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)`, [nombre, email, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El correo ya existe.' });
        return res.status(500).json({ error: 'Error en la base de datos.' });
      }
      res.status(201).json({ message: 'Usuario registrado', userId: this.lastID });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Completa todos los campos.' });

  db.get(`SELECT * FROM usuarios WHERE email = ?`, [email], async (err, usuario) => {
    if (err || !usuario) return res.status(400).json({ error: 'Usuario no encontrado.' });

    const valida = await bcrypt.compare(password, usuario.password);
    if (!valida) return res.status(400).json({ error: 'Contraseña incorrecta.' });

    const token = jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ message: 'OK', token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } });
  });
});

// --- RUTAS DE PEDIDOS, PAGOS Y NOTIFICACIONES ---
app.post('/api/create-paypal-order', async (req, res) => {
  try {
    res.json({ approveUrl: 'http://localhost:3000/success.html' });
  } catch (error) {
    console.error('Error al generar la orden:', error);
    res.status(500).json({ error: 'Error al procesar la orden' });
  }
});

app.post('/api/pedidos', (req, res) => {
  const { usuario_id, paypal_order_id, monto, items, email_destino } = req.body;

  if (!monto || !items) {
    return res.status(400).json({ error: 'Datos de pedido incompletos.' });
  }

  const queryInsert = `
    INSERT INTO pedidos (usuario_id, paypal_order_id, monto, items)
    VALUES (?, ?, ?, ?)
  `;

  db.run(queryInsert, [usuario_id || null, paypal_order_id || 'MP-TEST', monto, JSON.stringify(items)], function(err) {
    if (err) {
      console.error('Error al guardar pedido:', err.message);
      return res.status(500).json({ error: 'No se pudo registrar la compra.' });
    }

    const pedidoId = this.lastID;

    // 1. Actualizar stock en BD
    items.forEach(item => {
      if (item.id) {
        const cantidadComprada = Number(item.quantity || item.cantidad || 1);
        db.run(
          `UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?`,
          [cantidadComprada, item.id, cantidadComprada],
          (err) => {
            if (err) console.error(`Error actualizando stock del producto ${item.id}:`, err.message);
          }
        );
      }
    });

    // 2. Enviar correo de confirmación (si hay un email de destino)
    if (email_destino) {
      const detalleProductos = items.map(i => `- ${i.name || i.nombre} x${i.quantity || i.cantidad} (S/ ${i.price || i.precio})`).join('\n');
      
      const mailOptions = {
        from: `"Mi Tienda Virtual" <${process.env.EMAIL_USER}>`,
        to: email_destino,
        subject: `Confirmación de Compra #${pedidoId} - Mi Tienda Virtual`,
        text: `¡Gracias por tu compra!\n\nDetalle de tu pedido #${pedidoId}:\n${detalleProductos}\n\nTotal Pagado: S/ ${Number(monto).toFixed(2)}\n\n¡Esperamos verte pronto!`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error enviando correo de confirmación:', error.message);
        } else {
          console.log('📧 Correo enviado con éxito:', info.response);
        }
      });
    }

    res.status(201).json({ message: 'Pedido guardado con éxito, stock actualizado y correo enviado', pedidoId });
  });
});

app.get('/api/pedidos/:usuario_id', (req, res) => {
  const usuario_id = req.params.usuario_id;
  const query = `SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY fecha DESC`;
  
  db.all(query, [usuario_id], (err, filas) => {
    if (err) {
      console.error('Error al consultar historial:', err.message);
      return res.status(500).json({ error: 'Error al obtener el historial.' });
    }
    res.json(filas);
  });
});

// --- RUTAS DE ADMINISTRACIÓN ---
app.post('/api/admin/productos', (req, res) => {
  const { nombre, precio, categoria, imagen, stock } = req.body;
  if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });

  const query = `INSERT INTO productos (nombre, precio, categoria, imagen, stock) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [nombre, precio, categoria || 'General', imagen || 'https://via.placeholder.com/150', stock || 10], function(err) {
    if (err) return res.status(500).json({ error: 'Error al crear producto.' });
    res.status(201).json({ message: 'Producto creado', id: this.lastID });
  });
});

app.delete('/api/admin/productos/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM productos WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar.' });
    res.json({ message: 'Producto eliminado.' });
  });
});

app.get('/api/admin/pedidos', (req, res) => {
  const query = `
    SELECT pedidos.*, usuarios.nombre AS usuario_nombre, usuarios.email 
    FROM pedidos 
    LEFT JOIN usuarios ON pedidos.usuario_id = usuarios.id 
    ORDER BY fecha DESC
  `;
  db.all(query, [], (err, filas) => {
    if (err) return res.status(500).json({ error: 'Error al obtener ventas.' });
    res.json(filas);
  });
});

app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));