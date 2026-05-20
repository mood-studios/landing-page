import { publicApi, bookingApi } from './api.js';
import { DEFAULT_SERVICE_IMAGE } from './config.js';
import {
  getCart,
  getSelectedIndices,
  getSelectedCartItems,
  removeCheckedOutItems,
  formatMoney,
  saveCart,
} from './cart.js';
import { getUser, requireAuth, syncProfileFields } from './auth.js';
import { initNav } from './nav.js';
import { showAlert, showConfirm } from './app-dialog.js';

const availabilityCache = {};

function schedKey(cartIndex, unitIndex) {
  return `${cartIndex}_${unitIndex}`;
}

function valueToBookingTime(value) {
  const [h, m] = value.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function showFieldStatus(inputEl, state, message = '') {
  const area = inputEl?.closest('.schedule-row')?.querySelector('.availability-area');
  if (!area) return;
  area.innerHTML = '';
  if (state === 'idle') return;
  const cls = { checking: 'checking', ok: 'ok', error: 'error' }[state] || '';
  area.innerHTML = `<span class="avail-msg ${cls}">${message}</span>`;
}

async function fetchSlots(cartIndex, date, unitIndex, duration) {
  try {
    const res = await publicApi.getAvailability(date, duration);
    const listId = `slots-${cartIndex}-${unitIndex}`;
    const datalist = document.getElementById(listId);
    if (!datalist) return;

    const available = (res.data?.slots || []).filter((s) => s.available);
    datalist.innerHTML = available.map((s) => `<option value="${s.value}">${s.time}</option>`).join('');
  } catch {
    /* ignore */
  }
}

window.updateDate = function updateDate(cartIndex, value, unitIndex = 0) {
  const cart = getCart();
  const today = new Date().toISOString().split('T')[0];
  const maxObj = new Date();
  maxObj.setMonth(maxObj.getMonth() + 3);
  const maxDate = maxObj.toISOString().split('T')[0];

  if (value < today) {
    showAlert('You cannot select a past date.', { variant: 'error' });
    loadCheckoutCart();
    return;
  }
  if (value > maxDate) {
    showAlert('Please select a date within the next 3 months.', { variant: 'error' });
    loadCheckoutCart();
    return;
  }

  cart[cartIndex].schedules = cart[cartIndex].schedules || [];
  cart[cartIndex].schedules[unitIndex] = { date: value, time: '', timeLabel: '' };
  delete availabilityCache[schedKey(cartIndex, unitIndex)];
  saveCart(cart);

  const duration = cart[cartIndex].duration || 60;
  fetchSlots(cartIndex, value, unitIndex, duration);
  loadCheckoutCart();
};

window.updateTime = function updateTime(cartIndex, value, unitIndex = 0) {
  const cart = getCart();
  const item = cart[cartIndex];
  const schedule = item?.schedules?.[unitIndex];

  if (!schedule?.date) {
    showAlert('Please select a date first.', { variant: 'error' });
    return;
  }

  const duplicate = cart.some((other, otherIdx) =>
    (other.schedules || []).some((s, otherUnit) => {
      if (otherIdx === cartIndex && otherUnit === unitIndex) return false;
      return s.date === schedule.date && s.time === value;
    })
  );

  if (duplicate) {
    showAlert('This date and time is already used by another item in your cart.', { variant: 'error' });
    schedule.time = '';
    saveCart(cart);
    loadCheckoutCart();
    return;
  }

  schedule.time = value;
  schedule.timeLabel = valueToBookingTime(value);
  saveCart(cart);
  delete availabilityCache[schedKey(cartIndex, unitIndex)];

  const input = document.querySelector(`[data-sched="${schedKey(cartIndex, unitIndex)}"]`);
  if (input) showFieldStatus(input, 'checking', 'Checking…');

  publicApi
    .getAvailability(schedule.date, item.duration || 60)
    .then((res) => {
      const slot = (res.data?.slots || []).find((s) => s.value === value);
      availabilityCache[schedKey(cartIndex, unitIndex)] = Boolean(slot?.available);
      if (input) {
        showFieldStatus(
          input,
          slot?.available ? 'ok' : 'error',
          slot?.available ? 'Available' : 'Slot taken'
        );
      }
    })
    .catch(() => {
      if (input) showFieldStatus(input, 'error', 'Could not verify');
    });
};

window.removeCheckoutFromCart = async function removeCheckoutFromCart(index, unitIndex = null) {
  if (!(await showConfirm('Remove this item from checkout?', { confirmText: 'Remove', variant: 'error' }))) return;
  const cart = getCart();
  if (unitIndex === null) {
    cart.splice(index, 1);
  } else if (cart[index]) {
    cart[index].schedules?.splice(unitIndex, 1);
    if (cart[index].qty > 1) cart[index].qty -= 1;
    else cart.splice(index, 1);
  }
  saveCart(cart);
  loadCheckoutCart();
};

function validateCart(items) {
  for (const { item } of items) {
    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) {
      const s = item.schedules?.[i];
      if (!s?.date || !s?.time) return false;
    }
  }
  return true;
}

function loadCheckoutCart() {
  const container = document.getElementById('checkOutCartContainer');
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  const entries = getSelectedCartItems();

  if (!container) return;
  container.innerHTML = '';

  let subtotal = 0;
  const now = new Date();
  const minDate = now.toISOString().split('T')[0];
  const maxDateObj = new Date(now);
  maxDateObj.setMonth(maxDateObj.getMonth() + 3);
  const maxDate = maxDateObj.toISOString().split('T')[0];
  const minTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!entries.length) {
    container.innerHTML =
      '<p class="cart-empty">No items selected. <a href="/dashboard.html#book">Go back to packages</a>.</p>';
    if (subtotalEl) subtotalEl.textContent = formatMoney(0);
    if (totalEl) totalEl.textContent = formatMoney(0);
    return;
  }

  entries.forEach(({ item, index }) => {
    const price = Number(item.price) || 0;
    const qty = item.qty || 1;
    item.schedules = item.schedules || [];
    while (item.schedules.length < qty) item.schedules.push({ date: '', time: '' });

    for (let i = 0; i < qty; i++) {
      const sched = item.schedules[i] || { date: '', time: '' };
      const key = schedKey(index, i);
      const listId = `slots-${index}-${i}`;
      subtotal += price;

      const row = document.createElement('div');
      row.className = 'checkout-item';
      row.innerHTML = `
        <div class="checkout-item-head">
          <img src="${item.image || DEFAULT_SERVICE_IMAGE}" alt="">
          <div class="checkout-item-info">
            <h3>${item.name}</h3>
            <p>${item.duration} min · ${formatMoney(price)}</p>
          </div>
          <button type="button" class="checkout-remove-btn" onclick="removeCheckoutFromCart(${index}, ${i})" aria-label="Remove">
            <img src="/icons/remove.svg" alt="" width="18" height="18">
          </button>
        </div>
        <div class="schedule-row">
          <label>Date
            <input type="date" value="${sched.date || ''}" min="${minDate}" max="${maxDate}"
              onchange="updateDate(${index}, this.value, ${i})" required>
          </label>
          <label>Time
            <datalist id="${listId}"></datalist>
            <input type="time" value="${sched.time || ''}" list="${listId}"
              min="${sched.date === minDate ? minTime : '09:00'}" max="18:00"
              data-sched="${key}" ${!sched.date ? 'disabled' : ''}
              onchange="updateTime(${index}, this.value, ${i})" required>
            <div class="availability-area"></div>
          </label>
        </div>
      `;
      container.appendChild(row);
      if (sched.date) fetchSlots(index, sched.date, i, item.duration);
    }
  });

  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (totalEl) totalEl.textContent = formatMoney(subtotal);
}

function fillContactForm() {
  const user = getUser();
  if (!user) return;
  const nameEl = document.getElementById('fullName');
  const emailEl = document.getElementById('email');
  const phoneEl = document.getElementById('phone');
  if (nameEl && user.name) nameEl.value = user.name;
  if (emailEl && user.email) emailEl.value = user.email;
  if (phoneEl && user.phone) phoneEl.value = user.phone;
}

async function completeBooking() {
  const entries = getSelectedCartItems();
  if (!entries.length) {
    await showAlert('No items selected for checkout.', { variant: 'error' });
    return;
  }
  if (!validateCart(entries)) {
    await showAlert('Please select a date and time for every session.', { variant: 'error' });
    return;
  }

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const notes = document.getElementById('notes')?.value.trim() || '';

  if (!fullName || !email || !phone) {
    await showAlert('Please complete contact information.', { variant: 'error' });
    return;
  }

  const normalizedPhone = phone.replace(/[\s\-().]/g, '');
  if (!/^(\+?63|0)9\d{9}$/.test(normalizedPhone)) {
    await showAlert('Enter a valid Philippine mobile number (e.g. 09171234567).', { variant: 'error' });
    return;
  }

  const btn = document.getElementById('completeBookingBtn');
  btn.disabled = true;
  btn.textContent = 'Processing…';

  try {
    await syncProfileFields({ name: fullName, phone: normalizedPhone });

    const bookingIds = [];
    let totalAmount = 0;

    for (const { item } of entries) {
      const qty = item.qty || 1;
      for (let u = 0; u < qty; u++) {
        const sched = item.schedules[u];
        const bookingDate = new Date(`${sched.date}T00:00:00.000Z`).toISOString();
        const bookingTime = sched.timeLabel || valueToBookingTime(sched.time);

        const bookingRes = await bookingApi.create({
          services: [item.serviceId],
          bookingDate,
          bookingTime,
          specialRequest: notes || undefined,
        });

        const booking = bookingRes.data;
        bookingIds.push(booking._id);
        totalAmount += Number(booking.totalAmount) || 0;
      }
    }

    const selectedIndices = getSelectedIndices();
    removeCheckedOutItems(selectedIndices);

    sessionStorage.setItem(
      'mood_checkout_payment',
      JSON.stringify({ bookingIds, totalAmount })
    );
    sessionStorage.removeItem('mood_pending_payments');
    sessionStorage.removeItem('mood_payment_total');
    window.location.href = '/payment.html';
  } catch (err) {
    await showAlert(err.message || 'Booking failed. Please try again.', {
      title: 'Booking failed',
      variant: 'error',
    });
    btn.disabled = false;
    btn.textContent = 'Confirm booking';
  }
}

async function init() {
  if (!(await requireAuth())) return;
  initNav();
  fillContactForm();
  loadCheckoutCart();

  document.getElementById('completeBookingBtn')?.addEventListener('click', completeBooking);
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    import('./auth.js').then(({ logout }) => logout());
  });
}

init();
