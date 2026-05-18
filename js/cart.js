const CART_KEY = 'mood_cart';
const SELECTED_KEY = 'mood_cart_selected';

/** @typedef {{ serviceId: string, name: string, price: number, duration: number, image?: string, description?: string, qty: number, schedules: { date: string, time: string, timeLabel?: string }[] }} CartItem */

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function getSelectedIndices() {
  return new Set(JSON.parse(sessionStorage.getItem(SELECTED_KEY) || '[]'));
}

export function setSelectedIndices(set) {
  sessionStorage.setItem(SELECTED_KEY, JSON.stringify([...set]));
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
      image: service.image,
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
