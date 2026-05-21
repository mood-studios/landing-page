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
import {
  bindFullNameInput,
  bindPhoneInput,
  validateFullName,
  validatePhone11,
  validateFields,
  sanitizePhoneDigits,
} from './form-validation.js';

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
  const key = schedKey(cartIndex, unitIndex);
  const select = document.querySelector(`select[data-sched="${key}"]`);
  if (!select) return;

  try {
    const res = await publicApi.getAvailability(date, duration);
    const slots = res.data?.slots || [];
    const available = slots.filter((s) => s.available);
    const cart = getCart();
    const sched = cart[cartIndex]?.schedules?.[unitIndex];

    if (!available.length) {
      select.innerHTML = '<option value="">No times available this day</option>';
      select.disabled = true;
      if (sched) {
        sched.time = '';
        sched.timeLabel = '';
        saveCart(cart);
      }
      return;
    }

    select.disabled = false;
    const current = sched?.time || '';
    select.innerHTML =
      '<option value="">Select time</option>' +
      available
        .map(
          (s) =>
            `<option value="${s.value}"${current === s.value ? ' selected' : ''}>${s.time}</option>`
        )
        .join('');

    if (current && !available.some((s) => s.value === current)) {
      sched.time = '';
      sched.timeLabel = '';
      delete availabilityCache[key];
      saveCart(cart);
      const area = select.closest('.schedule-row')?.querySelector('.availability-area');
      if (area) {
        area.innerHTML =
          '<span class="avail-msg error">Previously selected time is no longer available</span>';
      }
    }
  } catch {
    select.innerHTML = '<option value="">Could not load times</option>';
    select.disabled = true;
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
  const key = schedKey(cartIndex, unitIndex);
  const select = document.querySelector(`select[data-sched="${key}"]`);

  if (!schedule?.date) {
    showAlert('Please select a date first.', { variant: 'error' });
    return;
  }

  if (!value) {
    schedule.time = '';
    schedule.timeLabel = '';
    saveCart(cart);
    delete availabilityCache[key];
    if (select) showFieldStatus(select, 'idle');
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
    schedule.timeLabel = '';
    saveCart(cart);
    loadCheckoutCart();
    return;
  }

  schedule.time = value;
  schedule.timeLabel = valueToBookingTime(value);
  saveCart(cart);
  availabilityCache[key] = true;
  if (select) showFieldStatus(select, 'ok', 'Available');
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
          <label>Time <span class="schedule-hint">9:00 AM – 5:00 PM</span>
            <select data-sched="${key}" ${!sched.date ? 'disabled' : ''}
              onchange="updateTime(${index}, this.value, ${i})" required>
              <option value="">${sched.date ? 'Loading times…' : 'Select date first'}</option>
            </select>
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
  if (phoneEl && user.phone) phoneEl.value = sanitizePhoneDigits(user.phone);
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

  for (const { item } of entries) {
    const qty = item.qty || 1;
    for (let u = 0; u < qty; u++) {
      const sched = item.schedules[u];
      const res = await publicApi.getAvailability(sched.date, item.duration || 60);
      const slot = (res.data?.slots || []).find((s) => s.value === sched.time);
      if (!slot?.available) {
        await showAlert(
          'One or more selected times are no longer available. Please choose another time.',
          { variant: 'error' }
        );
        loadCheckoutCart();
        return;
      }
    }
  }

  const fullNameEl = document.getElementById('fullName');
  const phoneEl = document.getElementById('phone');
  const fullName = fullNameEl.value.trim();
  const email = document.getElementById('email').value.trim();
  const normalizedPhone = sanitizePhoneDigits(phoneEl.value);
  const notes = document.getElementById('notes')?.value.trim() || '';

  if (
    !validateFields([
      { input: fullNameEl, error: validateFullName(fullNameEl.value) },
      { input: phoneEl, error: validatePhone11(phoneEl.value) },
    ])
  ) {
    return;
  }

  if (!email) {
    await showAlert('Email is required.', { variant: 'error' });
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

    sessionStorage.setItem(
      'mood_checkout_payment',
      JSON.stringify({
        bookingIds,
        totalAmount,
        selectedCartIndices: [...selectedIndices],
      })
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
  bindFullNameInput('fullName');
  bindPhoneInput('phone');
  initNav();
  fillContactForm();
  loadCheckoutCart();

  document.getElementById('completeBookingBtn')?.addEventListener('click', completeBooking);
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    import('./auth.js').then(({ logout }) => logout());
  });
}

init();
