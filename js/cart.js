import { getSamplePhotos } from './package-samples.js';

const CART_KEY = 'mood_cart';
const SELECTED_KEY = 'mood_cart_selected';
const DRAFT_TS_PREFIX = 'mood_draft_ts_';

/** @typedef {{ serviceId: string, name: string, price: number, duration: number, image?: string, description?: string, qty: number, schedules: { date: string, time: string, timeLabel?: string }[] }} CartItem */

let cartUserId = null;
let onCartPersist = null;

export function setCartStorageUserId(userId) {
  cartUserId = userId ? String(userId) : null;
}

export function getCartStorageUserId() {
  return cartUserId;
}

function cartKey() {
  return cartUserId ? `${CART_KEY}_${cartUserId}` : CART_KEY;
}

function selectedKey() {
  return cartUserId ? `${SELECTED_KEY}_${cartUserId}` : SELECTED_KEY;
}

function selectedStorage() {
  return cartUserId ? localStorage : sessionStorage;
}

export function setCartPersistHandler(fn) {
  onCartPersist = typeof fn === 'function' ? fn : null;
}

function touchDraftTimestamp() {
  if (!cartUserId) return;
  localStorage.setItem(`${DRAFT_TS_PREFIX}${cartUserId}`, String(Date.now()));
}

function notifyPersist() {
  touchDraftTimestamp();
  onCartPersist?.();
}

export function getDraftLocalTimestamp(userId = cartUserId) {
  if (!userId) return 0;
  return Number(localStorage.getItem(`${DRAFT_TS_PREFIX}${userId}`) || 0);
}

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey()) || '[]');
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(cartKey(), JSON.stringify(cart));
  notifyPersist();
}

export function getSelectedIndices() {
  try {
    return new Set(JSON.parse(selectedStorage().getItem(selectedKey()) || '[]'));
  } catch {
    return new Set();
  }
}

export function setSelectedIndices(set) {
  selectedStorage().setItem(selectedKey(), JSON.stringify([...set]));
  notifyPersist();
}

export function syncSelection() {
  const cart = getCart();
  const selected = getSelectedIndices();
  for (const idx of [...selected]) {
    if (idx >= cart.length) selected.delete(idx);
  }
  if (cart.length > 0) selected.add(cart.length - 1);
  setSelectedIndices(selected);
}

export function addToCart(service) {
  const cart = getCart();
  const existing = cart.find((i) => i.serviceId === service._id);

  if (existing) {
    existing.qty += 1;
    existing.schedules.push({ date: '', time: '' });
  } else {
    cart.push({
      serviceId: service._id,
      name: service.name,
      price: service.price,
      duration: service.duration,
      image: getSamplePhotos(service)[0],
      description: service.description,
      qty: 1,
      schedules: [{ date: '', time: '' }],
    });
  }

  saveCart(cart);
  syncSelection();
}

export function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);

  const selected = getSelectedIndices();
  const next = new Set();
  for (const idx of selected) {
    if (idx < index) next.add(idx);
    else if (idx > index) next.add(idx - 1);
  }
  setSelectedIndices(next);
}

export function formatMoney(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getSelectedCartItems() {
  const cart = getCart();
  const selected = getSelectedIndices();
  return cart.map((item, index) => ({ item, index })).filter(({ index }) => selected.has(index));
}

export function removeCheckedOutItems(selectedIndices) {
  const cart = getCart().filter((_, i) => !selectedIndices.has(i));
  saveCart(cart);
  setSelectedIndices(new Set());
}

export function countCartSessions(cart = getCart()) {
  return cart.reduce((sum, item) => sum + (item.qty || 1), 0);
}

export function countScheduledSessions(cart = getCart()) {
  let count = 0;
  for (const item of cart) {
    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) {
      const s = item.schedules?.[i];
      if (s?.date && s?.time) count += 1;
    }
  }
  return count;
}
