import { publicApi } from './api.js';
import { DEFAULT_SERVICE_IMAGE } from './config.js';
import {
  addToCart,
  getCart,
  getSelectedIndices,
  setSelectedIndices,
  saveCart,
  syncSelection,
  removeFromCart,
  formatMoney,
} from './cart.js';
import { initNav } from './nav.js';
import { renderPackageMedia, initPackageCarousels } from './package-samples.js';

let categories = [];
let activeCategoryId = null;

function showToast(message, type = 'success') {
  const box = document.getElementById('cartMessage');
  if (!box) return;
  box.textContent = message;
  box.className = `cart-toast ${type}`;
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 2500);
}

function parseDescription(desc) {
  if (!desc) return [];
  return desc.split('\n').map((l) => l.trim()).filter(Boolean);
}

function renderPackageCard(service) {
  const lines = parseDescription(service.description);
  const card = document.createElement('article');
  card.className = 'package-card';

  card.innerHTML = `
    ${renderPackageMedia(service, { alt: service.name })}
    <div class="package-body">
      <h3>${service.name}</h3>
      <p class="package-price">${formatMoney(service.price)}</p>
      <p class="package-duration">${service.duration} min session</p>
      <div class="package-desc">${lines.slice(0, 4).map((l) => `<span>${l}</span>`).join('')}</div>
      <button type="button" class="btn-add-cart" data-id="${service._id}">
        <img src="/icons/cart.svg" alt="" width="16" height="16">
        Add to cart
      </button>
    </div>
  `;

  initPackageCarousels(card);

  card.querySelector('.btn-add-cart').addEventListener('click', () => {
    addToCart(service);
    showToast('Added to cart!', 'success');
    loadCartUI();
  });

  return card;
}

async function loadPackages() {
  const container = document.getElementById('packageContainer');
  if (!container || !activeCategoryId) return;

  container.innerHTML = '<p class="loading-text">Loading packages…</p>';

  try {
    const res = await publicApi.getServices(activeCategoryId);
    const services = res.data || [];

    if (!services.length) {
      container.innerHTML = '<p class="loading-text">No packages in this category yet.</p>';
      return;
    }

    container.innerHTML = '';
    services.forEach((s) => container.appendChild(renderPackageCard(s)));
  } catch (err) {
    container.innerHTML = `<p class="loading-text error">${err.message}</p>`;
  }
}

function renderTabs() {
  const tabsEl = document.getElementById('categoryTabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = categories
    .map(
      (cat, i) => `
    <button type="button" class="category-tab ${cat._id === activeCategoryId ? 'active' : ''}" data-id="${cat._id}">
      ${cat.name}
    </button>
  `
    )
    .join('');

  tabsEl.querySelectorAll('.category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategoryId = btn.dataset.id;
      renderTabs();
      loadPackages();
    });
  });
}

window.toggleCart = function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('overlay');
  const open = sidebar?.classList.contains('open');
  sidebar?.classList.toggle('open', !open);
  overlay?.classList.toggle('hidden', open);
  if (!open) loadCartUI();
};

window.toggleCartSelection = function toggleCartSelection(index) {
  const selected = getSelectedIndices();
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  setSelectedIndices(selected);
  loadCartUI();
};

window.toggleSelectAll = function toggleSelectAll() {
  const cart = getCart();
  const selected = getSelectedIndices();
  const all = cart.length > 0 && cart.every((_, i) => selected.has(i));
  setSelectedIndices(all ? new Set() : new Set(cart.map((_, i) => i)));
  loadCartUI();
};

window.removeFromCart = function removeFromCartHandler(index) {
  removeFromCart(index);
  loadCartUI();
};

window.increaseQty = function increaseQty(index) {
  const cart = getCart();
  cart[index].qty += 1;
  cart[index].schedules.push({ date: '', time: '' });
  saveCart(cart);
  loadCartUI();
};

window.decreaseQty = function decreaseQty(index) {
  const cart = getCart();
  if (cart[index].qty > 1) {
    cart[index].qty -= 1;
    cart[index].schedules.pop();
    saveCart(cart);
    loadCartUI();
  }
};

function loadCartUI() {
  const container = document.getElementById('cartContainer');
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const cartCountEl = document.getElementById('cartCount');
  const selectAllChk = document.getElementById('selectAllChk');
  const selectedCountEl = document.getElementById('selectedCount');

  const cart = getCart();
  const selected = getSelectedIndices();

  if (cartCountEl) {
    const totalItems = cart.reduce((s, it) => s + (it.qty || 1), 0);
    cartCountEl.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  }

  if (selectAllChk) {
    const allSelected = cart.length > 0 && cart.every((_, i) => selected.has(i));
    const someSelected = cart.some((_, i) => selected.has(i));
    selectAllChk.checked = allSelected;
    selectAllChk.indeterminate = !allSelected && someSelected;
  }

  if (selectedCountEl) {
    const n = [...selected].filter((i) => i < cart.length).length;
    selectedCountEl.textContent = n > 0 ? `${n} selected for checkout` : '';
  }

  if (!container) return;
  container.innerHTML = '';

  let subtotal = 0;

  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Cart is empty</p>';
    if (subtotalEl) subtotalEl.textContent = formatMoney(0);
    if (totalEl) totalEl.textContent = formatMoney(0);
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  cart.forEach((item, index) => {
    const price = Number(item.price) || 0;
    const qty = item.qty || 1;
    const isSelected = selected.has(index);
    if (isSelected) subtotal += price * qty;

    const card = document.createElement('div');
    card.className = `cart-item ${isSelected ? 'selected' : ''}`;
    card.onclick = (e) => {
      if (e.target.closest('button, input')) return;
      toggleCartSelection(index);
    };

    card.innerHTML = `
      <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleCartSelection(${index})" onclick="event.stopPropagation()">
      <div class="cart-item-thumb"><img src="${item.image || DEFAULT_SERVICE_IMAGE}" alt=""></div>
      <div class="cart-item-info">
        <strong>${item.name}</strong>
        <span>${item.duration} min</span>
        <span class="cart-item-price">${formatMoney(price)}</span>
      </div>
      <div class="cart-item-actions">
        <button type="button" class="icon-btn" onclick="event.stopPropagation(); removeFromCart(${index})" aria-label="Remove">
          <img src="/icons/trash.png" alt="" width="20" height="20">
        </button>
        <div class="qty-control">
          <button type="button" onclick="event.stopPropagation(); increaseQty(${index})">+</button>
          <span>${qty}</span>
          <button type="button" onclick="event.stopPropagation(); decreaseQty(${index})">−</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (totalEl) totalEl.textContent = formatMoney(subtotal);
  if (checkoutBtn) {
    checkoutBtn.disabled = [...selected].filter((i) => i < cart.length).length === 0;
    checkoutBtn.onclick = async () => {
      if (checkoutBtn.disabled) return;
      const { isAuthenticated } = await import('./auth.js');
      if (!(await isAuthenticated())) {
        window.location.href = '/?auth=login&next=' + encodeURIComponent('/checkout.html');
        return;
      }
      window.location.href = '/checkout.html';
    };
  }
}

async function init() {
  initNav();
  syncSelection();
  loadCartUI();

  const scrollTopBtn = document.getElementById('scrollTopBtn');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      const show = window.scrollY > 300;
      scrollTopBtn.classList.toggle('visible', show);
    });
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  try {
    const res = await publicApi.getCategories();
    categories = res.data || [];
    if (!categories.length) {
      document.getElementById('packageContainer').innerHTML =
        '<p class="loading-text">No categories found. Run <code>npm run seed</code> on the backend.</p>';
      return;
    }
    activeCategoryId = categories[0]._id;
    renderTabs();
    await loadPackages();
  } catch (err) {
    document.getElementById('packageContainer').innerHTML =
      `<p class="loading-text error">${err.message}. Is the API running on port 5000?</p>`;
  }
}

init();
