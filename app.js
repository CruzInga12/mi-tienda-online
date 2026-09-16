// app.js - Lógica interactiva del cliente (Actualizado con menú flotante de usuario)

let carrito = JSON.parse(localStorage.getItem('carrito')) || [];
let productosGlobales = [];
let categoriaActualSeleccionada = 'Todas'; // Variable para recordar el filtro activo

document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
  cargarProductos();
  actualizarContadorCarrito();

  // Eventos de interfaz
  document.getElementById('btn-cart')?.addEventListener('click', toggleCarritoModal);
  document.getElementById('btn-close-cart')?.addEventListener('click', toggleCarritoModal);
  document.getElementById('input-buscar')?.addEventListener('input', filtrarProductos);
  document.getElementById('btn-checkout')?.addEventListener('click', procesarPago);
});

// Gestión de Sesión según LocalStorage y Menú Flotante por Hover
function verificarSesion() {
  const usuario = JSON.parse(localStorage.getItem('usuario'));
  const btnLogin = document.getElementById('btn-login-link');
  const userMenuWrapper = document.getElementById('user-menu-wrapper');
  
  const userDisplayName = document.getElementById('user-display-name');
  const dropdownUsername = document.getElementById('dropdown-username');
  const dropdownEmail = document.getElementById('dropdown-email');
  const userInitial = document.getElementById('user-initial');
  const userInitialLarge = document.getElementById('user-initial-large');

  if (usuario && usuario.nombre) {
    if (btnLogin) btnLogin.style.display = 'none';
    if (userMenuWrapper) userMenuWrapper.style.display = 'inline-block';

    // Rellenar datos dinámicos en el menú flotante
    const inicial = usuario.nombre.charAt(0).toUpperCase();
    if (userDisplayName) userDisplayName.textContent = usuario.nombre;
    if (dropdownUsername) dropdownUsername.textContent = usuario.nombre;
    if (dropdownEmail) dropdownEmail.textContent = usuario.email || 'usuario@raiv.com';
    if (userInitial) userInitial.textContent = inicial;
    if (userInitialLarge) userInitialLarge.textContent = inicial;

    // Vincular evento de cierre de sesión del menú flotante
    document.getElementById('btn-logout-dropdown')?.addEventListener('click', cerrarSesion);
  } else {
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (userMenuWrapper) userMenuWrapper.style.display = 'none';
  }
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.reload();
}

// Carga e impresión del catálogo de productos
async function cargarProductos() {
  try {
    const res = await fetch('/api/productos');
    productosGlobales = await res.json();
    renderizarProductos(productosGlobales);
  } catch (error) {
    console.error('Error cargando catálogo:', error);
  }
}

function renderizarProductos(productos) {
  const container = document.getElementById('product-list');
  if (!container) return;

  if (productos.length === 0) {
    container.innerHTML = '<p>No se encontraron productos.</p>';
    return;
  }

  container.innerHTML = productos.map(prod => `
    <div class="product-card" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; background: white;">
      <img src="${prod.imagen || 'https://via.placeholder.com/150'}" alt="${prod.nombre}" style="width: 100%; height: 160px; object-fit: contain; background: #f9fafb; border-radius: 4px; padding: 5px;">
      <h3 style="font-size: 16px; margin: 10px 0 5px 0;">${prod.nombre}</h3>
      <p style="color: #6b7280; font-size: 13px; margin: 0 0 5px 0;">${prod.categoria}</p>
      
      <!-- Indicador dinámico de Stock y Alerta de Pocas Unidades (<= 3) -->
      <div style="margin-bottom: 8px; font-size: 12px;">
        ${prod.stock <= 0 
          ? '<span style="color: #dc2626; font-weight: 600;">Agotado</span>' 
          : prod.stock <= 3 
            ? `<span style="color: #d97706; font-weight: bold;">⚠️ ¡Últimas unidades! (${prod.stock} disponibles)</span>` 
            : `<span style="color: #059669; font-weight: 600;">Stock disponible: ${prod.stock}</span>`
        }
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: bold; color: #1f2937;">S/ ${Number(prod.precio).toFixed(2)}</span>
        <button onclick="agregarAlCarrito(${prod.id})" style="background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;" ${prod.stock <= 0 ? 'disabled style="background: #9ca3af; cursor: not-allowed;"' : ''}>
          ${prod.stock > 0 ? 'Agregar' : 'No disponible'}
        </button>
      </div>
    </div>
  `).join('');
}

// Filtro seguro por búsqueda y categoría (Conectado al menú lateral)
function filtrarProductos() {
  const inputBusc = document.getElementById('input-buscar');
  const termino = inputBusc ? inputBusc.value.toLowerCase().trim() : '';

  const filtrados = productosGlobales.filter(prod => {
    const coincideCategoria = (categoriaActualSeleccionada === 'Todas' || prod.categoria === categoriaActualSeleccionada);
    const coincideBusqueda = prod.nombre.toLowerCase().includes(termino);
    return coincideCategoria && coincideBusqueda;
  });

  renderizarProductos(filtrados);
}

// Función global llamada al hacer clic en el menú lateral estilo Oechsle
window.filtrarPorCategoriaExterna = function(categoria) {
  categoriaActualSeleccionada = categoria;
  filtrarProductos();
};

// Lógica de Carrito de Compras
function agregarAlCarrito(idProducto) {
  const prod = productosGlobales.find(p => p.id === idProducto);
  if (!prod) return;

  const existe = carrito.find(item => item.id === idProducto);
  if (existe) {
    existe.cantidad += 1;
  } else {
    carrito.push({
      id: prod.id,
      nombre: prod.nombre,
      precio: prod.precio,
      imagen: prod.imagen,
      cantidad: 1
    });
  }

  guardarCarrito();
  renderizarCarrito();
}

function guardarCarrito() {
  localStorage.setItem('carrito', JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function actualizarContadorCarrito() {
  const countBadge = document.getElementById('cart-count');
  const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
  if (countBadge) countBadge.textContent = totalItems;
}

function toggleCarritoModal() {
  const modal = document.getElementById('cart-modal');
  if (modal) {
    modal.classList.toggle('hidden');
    renderizarCarrito();
  }
}

function renderizarCarrito() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalPrice = document.getElementById('cart-total-price');
  if (!cartItemsContainer) return;

  if (carrito.length === 0) {
    cartItemsContainer.innerHTML = '<p style="padding: 10px 0;">Tu carrito está vacío.</p>';
    if (cartTotalPrice) cartTotalPrice.textContent = '0.00';
    return;
  }

  let total = 0;
  cartItemsContainer.innerHTML = carrito.map(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
        <div>
          <strong>${item.nombre}</strong> (x${item.cantidad})
          <div style="font-size: 12px; color: #666;">S/ ${Number(item.precio).toFixed(2)} c/u</div>
        </div>
        <div>
          <span style="font-weight: bold; margin-right: 10px;">S/ ${subtotal.toFixed(2)}</span>
          <button onclick="eliminarDelCarrito(${item.id})" style="background:#ef4444; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">X</button>
        </div>
      </div>
    `;
  }).join('');

  if (cartTotalPrice) cartTotalPrice.textContent = total.toFixed(2);
}

function eliminarDelCarrito(idProducto) {
  carrito = carrito.filter(item => item.id !== idProducto);
  guardarCarrito();
  renderizarCarrito();
}

// Procesar Checkout
async function procesarPago() {
  const usuario = JSON.parse(localStorage.getItem('usuario'));

  if (!usuario) {
    alert('Debes iniciar sesión para finalizar tu compra.');
    window.location.href = '/auth.html';
    return;
  }

  if (carrito.length === 0) {
    alert('Tu carrito está vacío.');
    return;
  }

  try {
    const res = await fetch('/api/crear-preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: carrito,
        usuario_id: usuario.id
      })
    });

    const data = await res.json();

    if (data.init_point) {
      window.location.href = data.init_point;
    } else {
      alert('Error al generar el enlace de pago.');
    }
  } catch (error) {
    console.error('Error procesando la transacción:', error);
    alert('Ocurrió un error al conectar con la pasarela de pagos.');
  }
}