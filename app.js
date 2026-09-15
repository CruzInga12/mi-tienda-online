let carrito = JSON.parse(localStorage.getItem('carrito')) || [];
let categoriasCargadas = false;

document.addEventListener('DOMContentLoaded', () => {
  cargarProductos();
  verificarSesion();
  actualizarVistaCarrito();

  // Escuchadores para la búsqueda y categorías en tiempo real
  const inputBuscar = document.getElementById('input-buscar');
  const selectCategoria = document.getElementById('select-categoria');

  if (inputBuscar) {
    inputBuscar.addEventListener('input', () => cargarProductos());
  }

  if (selectCategoria) {
    selectCategoria.addEventListener('change', () => cargarProductos());
  }

  // Controles de la interfaz
  const btnCart = document.getElementById('btn-cart');
  const btnCloseCart = document.getElementById('btn-close-cart');
  const cartModal = document.getElementById('cart-modal');
  const btnCheckout = document.getElementById('btn-checkout');
  const btnLogout = document.getElementById('btn-logout');

  if (btnCart) btnCart.addEventListener('click', () => cartModal.classList.remove('hidden'));
  if (btnCloseCart) btnCloseCart.addEventListener('click', () => cartModal.classList.add('hidden'));
  if (btnCheckout) btnCheckout.addEventListener('click', procesarPago);
  
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('usuario');
      localStorage.removeItem('token');
      window.location.reload();
    });
  }
});

// Cargar productos dinámicamente aplicando filtros de búsqueda y categoría
async function cargarProductos() {
  const container = document.getElementById('product-list');
  const buscar = document.getElementById('input-buscar')?.value || '';
  const selectCategoria = document.getElementById('select-categoria');
  const categoria = selectCategoria?.value || 'Todas';

  if (!container) return;

  try {
    const res = await fetch(`/api/productos?buscar=${encodeURIComponent(buscar)}&categoria=${encodeURIComponent(categoria)}`);
    const productos = await res.json();

    // Generar opciones de categorías dinámicamente según la BD
    if (!categoriasCargadas && selectCategoria) {
      const resTodas = await fetch('/api/productos');
      const todosLosProductos = await resTodas.json();
      
      const categoriasUnicas = ['Todas', ...new Set(todosLosProductos.map(p => p.categoria || 'General'))];
      
      selectCategoria.innerHTML = categoriasUnicas
        .map(cat => `<option value="${cat}">${cat === 'Todas' ? 'Todas las categorías' : cat}</option>`)
        .join('');
        
      categoriasCargadas = true;
    }

    container.innerHTML = '';

    if (productos.length === 0) {
      container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #777;">No se encontraron productos en esta categoría.</p>';
      return;
    }

    productos.forEach(prod => {
      const sinStock = prod.stock <= 0;
      
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <img src="${prod.imagen || 'https://via.placeholder.com/150'}" alt="${prod.nombre}">
        <h3>${prod.nombre}</h3>
        <p><small style="color: #666;">Categoría: ${prod.categoria || 'General'}</small></p>
        <p>Precio: S/ ${Number(prod.precio).toFixed(2)}</p>
        <p><small>Stock disponible: <strong>${prod.stock}</strong></small></p>
        <button 
          onclick="agregarAlCarrito(${prod.id}, '${prod.nombre}', ${prod.precio}, ${prod.stock})"
          ${sinStock ? 'disabled style="background:#ccc; cursor:not-allowed;"' : ''}>
          ${sinStock ? 'Agotado' : 'Añadir al Carrito'}
        </button>
      `;
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Error cargando productos:', error);
  }
}

function agregarAlCarrito(id, nombre, precio, stockMax) {
  const itemExistente = carrito.find(item => item.id === id);

  if (itemExistente) {
    if (itemExistente.quantity + 1 > stockMax) {
      alert('Límite de stock disponible alcanzado.');
      return;
    }
    itemExistente.quantity += 1;
  } else {
    carrito.push({ id: id, name: nombre, price: precio, quantity: 1 });
  }

  guardarYActualizarCarrito();
}

function cambiarCantidad(id, cambio) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;

  item.quantity += cambio;
  if (item.quantity <= 0) {
    carrito = carrito.filter(i => i.id !== id);
  }

  guardarYActualizarCarrito();
}

function guardarYActualizarCarrito() {
  localStorage.setItem('carrito', JSON.stringify(carrito));
  actualizarVistaCarrito();
}

function actualizarVistaCarrito() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartCount = document.getElementById('cart-count');
  const cartTotalPrice = document.getElementById('cart-total-price');

  if (!cartItemsContainer) return;

  cartItemsContainer.innerHTML = '';
  let totalNum = 0;
  let totalCount = 0;

  carrito.forEach(item => {
    const subtotal = Number(item.price) * Number(item.quantity);
    totalNum += subtotal;
    totalCount += item.quantity;

    const div = document.createElement('div');
    div.className = 'cart-item';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.marginBottom = '10px';

    div.innerHTML = `
      <div>
        <strong>${item.name}</strong><br>
        <small>S/ ${Number(item.price).toFixed(2)} x ${item.quantity}</small>
      </div>
      <div>
        <button onclick="cambiarCantidad(${item.id}, -1)">-</button>
        <button onclick="cambiarCantidad(${item.id}, 1)">+</button>
      </div>
    `;
    cartItemsContainer.appendChild(div);
  });

  if (cartCount) cartCount.textContent = totalCount;
  if (cartTotalPrice) cartTotalPrice.textContent = totalNum.toFixed(2);
}

function verificarSesion() {
  const usuario = JSON.parse(localStorage.getItem('usuario'));
  const userGreeting = document.getElementById('user-greeting');
  const btnLoginLink = document.getElementById('btn-login-link');
  const btnLogout = document.getElementById('btn-logout');
  const btnHistorial = document.getElementById('btn-historial');

  if (usuario) {
    if (userGreeting) userGreeting.textContent = `Hola, ${usuario.nombre}`;
    if (btnLoginLink) btnLoginLink.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'inline-block';
    if (btnHistorial) btnHistorial.style.display = 'inline-block';
  } else {
    if (userGreeting) userGreeting.textContent = '';
    if (btnLoginLink) btnLoginLink.style.display = 'inline-block';
    if (btnLogout) btnLogout.style.display = 'none';
    if (btnHistorial) btnHistorial.style.display = 'none';
  }
}

async function procesarPago() {
  if (carrito.length === 0) {
    alert('El carrito está vacío.');
    return;
  }

  try {
    const res = await fetch('/api/create-paypal-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: carrito })
    });

    const data = await res.json();
    if (data.approveUrl) {
      window.location.href = data.approveUrl;
    } else {
      alert('Error iniciando la pasarela de pago.');
    }
  } catch (error) {
    console.error('Error al procesar el pago:', error);
    alert('Ocurrió un error al conectar con el servidor.');
  }
}