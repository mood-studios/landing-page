import { publicApi } from './api.js';
import { DEFAULT_SERVICE_IMAGE } from './config.js';
import { openAuthModal } from './auth-modal.js';
import { isAuthenticated } from './auth.js';
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
  if (!desc) return '';
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, 3).join(' · ');
}

function showPackageCards() {
  const cards = document.querySelectorAll('.package-offer-card');
  if (!cards.length) return;

  cards.forEach((card) => {
    card.style.opacity = '1';
    card.style.transform = 'none';
  });

  if (window.anime) {
    anime({
      targets: cards,
      opacity: [0, 1],
      translateY: [24, 0],
      duration: 550,
      delay: anime.stagger(70),
      easing: 'easeOutExpo',
    });
  }
}

function renderPackageCard(service) {
  const card = document.createElement('article');
  card.className = 's-card package-offer-card';
  const desc = parseDescription(service.description) || `${service.duration} min session`;

  card.innerHTML = `
    ${renderPackageMedia(service, { alt: service.name })}
    <div class="package-card-body">
      <h3>${service.name}</h3>
      <p class="package-price">${formatMoney(service.price)}</p>
      <p class="package-desc">${desc}</p>
      <button type="button" class="btn-add-package">Add to cart</button>
    </div>
  `;

  initPackageCarousels(card);

  card.querySelector('.btn-add-package').addEventListener('click', () => {
    addToCart(service);
    showToast('Added to cart!', 'success');
    loadCartUI();
    toggleCart(true);
  });

  return card;
}

async function loadPackages() {
  const container = document.getElementById('packageContainer');
  if (!container || !activeCategoryId) return;

  container.innerHTML = '<p class="packages-loading">Loading packages…</p>';

  try {
    const res = await publicApi.getServices(activeCategoryId);
    const services = res.data || [];

    if (!services.length) {
      container.innerHTML = '<p class="packages-loading">No packages in this category.</p>';
      return;
    }

    container.innerHTML = '';
    services.forEach((s) => container.appendChild(renderPackageCard(s)));
    requestAnimationFrame(() => showPackageCards());
  } catch (err) {
    container.innerHTML = `<p class="packages-loading error">${err.message}</p>`;
  }
}

function renderTabs() {
  const tabsEl = document.getElementById('categoryTabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = categories
    .map(
      (cat) => `
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

window.toggleCart = function toggleCart(forceOpen) {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('overlay');
  const open = typeof forceOpen === 'boolean' ? forceOpen : sidebar?.classList.contains('open');
  const show = typeof forceOpen === 'boolean' ? forceOpen : !open;
  sidebar?.classList.toggle('open', show);
  overlay?.classList.toggle('hidden', !show);
  if (show) loadCartUI();
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
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const cartCountEl = document.getElementById('cartCount');
  const fabCounts = document.querySelectorAll('[data-cart-count]');
  const selectAllChk = document.getElementById('selectAllChk');
  const selectedCountEl = document.getElementById('selectedCount');

  const cart = getCart();
  const selected = getSelectedIndices();
  const totalItems = cart.reduce((s, it) => s + (it.qty || 1), 0);

  if (cartCountEl) cartCountEl.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  fabCounts.forEach((el) => {
    el.textContent = String(totalItems);
    el.classList.toggle('hidden', totalItems === 0);
  });

  if (selectAllChk) {
    selectAllChk.checked = cart.length > 0 && cart.every((_, i) => selected.has(i));
    selectAllChk.indeterminate =
      cart.some((_, i) => selected.has(i)) && !selectAllChk.checked;
  }

  if (selectedCountEl) {
    const n = [...selected].filter((i) => i < cart.length).length;
    selectedCountEl.textContent = n > 0 ? `${n} selected` : '';
  }

  if (!container) return;
  container.innerHTML = '';
  let subtotal = 0;

  if (!cart.length) {
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
        <button type="button" class="icon-btn" onclick="event.stopPropagation(); removeFromCart(${index})">×</button>
        <div class="qty-control">
          <button type="button" onclick="event.stopPropagation(); decreaseQty(${index})">−</button>
          <span>${qty}</span>
          <button type="button" onclick="event.stopPropagation(); increaseQty(${index})">+</button>
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
      if (checkoutHandler) {
        checkoutHandler();
        return;
      }
      if (!(await isAuthenticated())) {
        openAuthModal({
          panel: 'login',
          onSuccess: () => {
            window.location.href = '/checkout.html';
          },
        });
        return;
      }
      window.location.href = '/checkout.html';
    };
  }
}

let checkoutHandler = null;

export async function initHomePackages(options = {}) {
  checkoutHandler = options.onCheckout || null;
  syncSelection();
  loadCartUI();

  document.getElementById('cartFab')?.addEventListener('click', () => toggleCart());
  document.getElementById('headerCartBtn')?.addEventListener('click', () => toggleCart(true));

  try {
    const res = await publicApi.getCategories();
    categories = (res.data || []).filter((c) =>
      ['Self-Portrait Digital', 'Self-Portrait Pro', 'Photographer Session'].includes(c.name)
    );
    if (!categories.length) categories = res.data || [];

    if (!categories.length) {
      document.getElementById('packageContainer').innerHTML =
        '<p class="packages-loading">No categories found.</p>';
      return;
    }
    activeCategoryId = categories[0]._id;
    renderTabs();
    await loadPackages();
  } catch (err) {
    const el = document.getElementById('packageContainer');
    if (el) el.innerHTML = `<p class="packages-loading error">${err.message}</p>`;
  }
}
