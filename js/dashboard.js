import { bookingApi, galleryApi } from './api.js';
import { getUser, requireAuth, logout, fetchSession, syncProfileFields } from './auth.js';
import { initHomePackages } from './home-packages.js';
import { initChatWidget } from './chat-widget.js';
import { showAlert, showConfirm } from './app-dialog.js';
import { formatMoney } from './cart.js';

const PANEL_COPY = {
  book: 'Browse packages and book your next session.',
  bookings: 'View and track your scheduled sessions.',
  gallery: 'View photos from your completed sessions.',
  profile: 'Your account details.',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusLabel(booking) {
  const pay = booking.paymentStatus || 'unpaid';
  const book = booking.bookingStatus || 'pending';
  if (pay === 'paid' && book === 'confirmed') return { text: 'Confirmed', class: 'ok' };
  if (pay === 'paid' && book === 'completed') return { text: 'Completed', class: 'ok' };
  if (book === 'declined' || pay === 'failed') return { text: 'Declined', class: 'error' };
  if (pay === 'pending') return { text: 'Payment pending', class: 'warn' };
  if (book === 'pending') return { text: 'Pending', class: 'warn' };
  return { text: book, class: 'warn' };
}

function needsPayment(booking) {
  const pay = booking.paymentStatus || 'unpaid';
  return pay !== 'paid' && booking.bookingStatus !== 'declined';
}

function canCancelBooking(booking) {
  const status = booking.bookingStatus || 'pending';
  return status === 'pending';
}

function serviceNames(booking) {
  const services = booking.services || [];
  if (!services.length) return 'Session';
  return services.map((s) => s.name).filter(Boolean).join(', ');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStatusText(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

let bookingsById = new Map();

function renderServiceBlock(service) {
  const lines = (service.description || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const descHtml = lines.length
    ? `<ul class="booking-service-desc">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
    : '<p class="booking-service-desc-empty">No package description.</p>';

  return `
    <div class="booking-service-block">
      <div class="booking-service-head">
        <strong>${escapeHtml(service.name)}</strong>
        <span>${formatMoney(service.price)} · ${service.duration || '—'} min</span>
      </div>
      ${descHtml}
    </div>
  `;
}

function renderBookingDetailHtml(booking) {
  const services = booking.services || [];
  const st = statusLabel(booking);
  const special = booking.specialRequest?.trim();

  return `
    <dl class="booking-detail-grid">
      <div><dt>Session date</dt><dd>${escapeHtml(formatDate(booking.bookingDate))}</dd></div>
      <div><dt>Session time</dt><dd>${escapeHtml(booking.bookingTime || '—')}</dd></div>
      <div><dt>Booking status</dt><dd>${escapeHtml(formatStatusText(booking.bookingStatus))}</dd></div>
      <div><dt>Payment</dt><dd><span class="booking-status booking-status--${st.class}">${st.text}</span> (${escapeHtml(formatStatusText(booking.paymentStatus))})</dd></div>
      <div><dt>Total</dt><dd class="booking-detail-total">${escapeHtml(formatMoney(booking.totalAmount))}</dd></div>
      ${special ? `<div class="booking-detail-full"><dt>Special request</dt><dd>${escapeHtml(special)}</dd></div>` : ''}
    </dl>
    <h4 class="booking-detail-services-title">Package details</h4>
    ${services.length ? services.map(renderServiceBlock).join('') : '<p class="booking-service-desc-empty">No services listed.</p>'}
    <div class="booking-detail-actions">
      ${needsPayment(booking) ? `<a href="/payment.html?bookingId=${booking._id}" class="btn btn-purple btn-sm">Pay now</a>` : ''}
      ${canCancelBooking(booking) ? `<button type="button" class="btn btn-ghost btn-sm booking-cancel-btn" data-booking-id="${escapeHtml(String(booking._id))}">Cancel booking</button>` : ''}
    </div>
  `;
}

function bindBookingDetailActions(detail, bookingId) {
  const id = String(bookingId);
  const btn = detail.querySelector('.booking-cancel-btn');
  if (!btn || btn.dataset.cancelBound) return;
  btn.dataset.cancelBound = '1';

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !(await showConfirm('Cancel this booking? This cannot be undone.', {
        title: 'Cancel booking',
        confirmText: 'Yes, cancel',
        cancelText: 'Keep booking',
        variant: 'error',
      }))
    ) {
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Cancelling…';

    try {
      await bookingApi.cancel(id);
      bookingsById.delete(id);

      const item = btn.closest('.booking-item');
      item?.classList.remove('is-open');
      item?.querySelector('.booking-row-toggle')?.setAttribute('aria-expanded', 'false');
      detail.classList.add('hidden');
      detail.innerHTML = '';

      showPanel('bookings');
      await loadBookings();
      await showAlert('Booking cancelled.', { title: 'Cancelled', variant: 'success' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Cancel booking';
      await showAlert(err.message || 'Could not cancel booking.', {
        title: 'Cancel failed',
        variant: 'error',
      });
    }
  });
}

function bindBookingToggles(list) {
  list.querySelectorAll('.booking-row-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.booking-item');
      const detail = item?.querySelector('.booking-detail');
      if (!detail) return;

      const isOpen = item.classList.contains('is-open');
      list.querySelectorAll('.booking-item.is-open').forEach((el) => {
        el.classList.remove('is-open');
        el.querySelector('.booking-row-toggle')?.setAttribute('aria-expanded', 'false');
        el.querySelector('.booking-detail')?.classList.add('hidden');
      });

      if (isOpen) return;

      const id = btn.dataset.bookingId;
      item.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      detail.classList.remove('hidden');
      detail.innerHTML = '<p class="bookings-loading">Loading details…</p>';

      try {
        let booking = bookingsById.get(id);
        const res = await bookingApi.getBooking(id);
        booking = res.data;
        bookingsById.set(id, booking);
        detail.innerHTML = renderBookingDetailHtml(booking);
        bindBookingDetailActions(detail, id);
      } catch (err) {
        detail.innerHTML = `<p class="bookings-empty error">${escapeHtml(err.message)}</p>`;
      }
    });
  });
}

function renderBookings(bookings) {
  const list = document.getElementById('bookingsList');
  if (!list) return;

  if (!bookings.length) {
    list.innerHTML = `
      <p class="bookings-empty">No bookings yet.</p>
      <button type="button" class="btn btn-purple" style="margin-top:1rem" data-go-panel="book">Book your first session</button>
    `;
    list.querySelector('[data-go-panel]')?.addEventListener('click', () => showPanel('book'));
    return;
  }

  list.innerHTML = bookings
    .map((b) => {
      const st = statusLabel(b);
      const amount = typeof b.totalAmount === 'number' ? formatMoney(b.totalAmount) : '';
      const id = String(b._id);
      return `
        <article class="booking-item">
          <button type="button" class="booking-row booking-row-toggle" data-booking-id="${id}" aria-expanded="false">
            <div class="booking-row-main">
              <h3>${escapeHtml(serviceNames(b))}</h3>
              <p class="booking-meta">${escapeHtml(formatDate(b.bookingDate))} · ${escapeHtml(b.bookingTime || '—')}</p>
            </div>
            <div class="booking-row-end">
              <span class="booking-status booking-status--${st.class}">${st.text}</span>
              ${amount ? `<span class="booking-amount">${amount}</span>` : ''}
              <span class="booking-chevron" aria-hidden="true">›</span>
            </div>
          </button>
          <div class="booking-detail hidden" id="booking-detail-${id}"></div>
        </article>
      `;
    })
    .join('');

  bindBookingToggles(list);
}

let profileEditing = false;

function fillProfile(user) {
  const first = user?.name?.split(' ')[0] || 'there';
  const greet = document.getElementById('dashboardGreeting');
  if (greet) greet.textContent = `Hello, ${first}`;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };
  set('profileName', user?.name);
  set('profileEmail', user?.email);
  set('profilePhone', user?.phone);

  const nameInput = document.getElementById('profileNameInput');
  const phoneInput = document.getElementById('profilePhoneInput');
  if (nameInput) nameInput.value = user?.name || '';
  if (phoneInput) phoneInput.value = user?.phone || '';
}

function setProfileError(message) {
  const el = document.getElementById('profileError');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function setProfileEditing(editing) {
  profileEditing = editing;
  const panel = document.querySelector('.dashboard-profile');
  panel?.classList.toggle('is-editing', editing);

  document.getElementById('profileEditBtn')?.classList.toggle('hidden', editing);
  document.getElementById('profileEditActions')?.classList.toggle('hidden', !editing);

  document.querySelectorAll('.profile-value').forEach((el) => {
    if (el.id === 'profileEmail') return;
    el.classList.toggle('hidden', editing);
  });

  document.getElementById('profileNameInput')?.classList.toggle('hidden', !editing);
  document.getElementById('profilePhoneInput')?.classList.toggle('hidden', !editing);

  const saveBtn = document.getElementById('profileSaveBtn');
  const cancelBtn = document.getElementById('profileCancelBtn');
  if (saveBtn) saveBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;

  if (!editing) setProfileError('');
}

function enterProfileEdit() {
  const user = getUser();
  fillProfile(user);
  setProfileEditing(true);
  document.getElementById('profileNameInput')?.focus();
}

function cancelProfileEdit() {
  fillProfile(getUser());
  setProfileEditing(false);
}

function normalizePhone(phone) {
  return phone.replace(/[\s\-().]/g, '');
}

async function saveProfile() {
  const name = document.getElementById('profileNameInput')?.value.trim();
  const phoneRaw = document.getElementById('profilePhoneInput')?.value.trim();

  if (!name) {
    setProfileError('Name is required.');
    return;
  }

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    setProfileError('Phone number is required.');
    return;
  }
  if (!/^(\+?63|0)9\d{9}$/.test(phone)) {
    setProfileError('Enter a valid Philippine mobile number (e.g. 09171234567).');
    return;
  }

  const saveBtn = document.getElementById('profileSaveBtn');
  const cancelBtn = document.getElementById('profileCancelBtn');
  if (saveBtn) saveBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  setProfileError('');

  try {
    await syncProfileFields({ name, phone });
    fillProfile(getUser());
    setProfileEditing(false);
  } catch (err) {
    setProfileError(err.message || 'Could not save profile.');
    if (saveBtn) saveBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }
}

function initProfileEdit() {
  document.getElementById('profileEditBtn')?.addEventListener('click', enterProfileEdit);
  document.getElementById('profileCancelBtn')?.addEventListener('click', cancelProfileEdit);
  document.getElementById('profileSaveBtn')?.addEventListener('click', saveProfile);
}

function showPanel(id, { updateHash = true } = {}) {
  document.querySelectorAll('.dash-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.panel === id);
  });
  document.querySelectorAll('.dash-panel').forEach((panel) => {
    const on = panel.dataset.panel === id;
    panel.classList.toggle('active', on);
    panel.hidden = !on;
  });

  const sub = document.getElementById('dashboardSubtext');
  if (sub) sub.textContent = PANEL_COPY[id] || PANEL_COPY.book;

  if (id === 'bookings') loadBookings();
  if (id === 'gallery') loadGalleryHub();
  if (id !== 'profile' && profileEditing) cancelProfileEdit();
  if (updateHash) history.replaceState(null, '', `#${id}`);
}

function initTabs() {
  document.querySelectorAll('.dash-tab').forEach((tab) => {
    tab.addEventListener('click', () => showPanel(tab.dataset.panel));
  });
  document.querySelectorAll('[data-go-panel]').forEach((el) => {
    el.addEventListener('click', () => showPanel(el.dataset.goPanel));
  });
}

function renderGalleryAlbums(albums) {
  if (!albums?.length) {
    return '<p class="gallery-empty">No photos uploaded for this session yet. Check back after your shoot.</p>';
  }

  return albums
    .map(
      (album) => `
      <div class="gallery-album">
        <h4 class="gallery-album-title">${escapeHtml(album.albumName || 'Album')}</h4>
        ${
          album.photos?.length
            ? `<div class="gallery-photo-grid">${album.photos
                .map(
                  (photo) => `
                <a href="${escapeHtml(photo.url)}" class="gallery-photo" target="_blank" rel="noopener noreferrer">
                  <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || 'Session photo')}" loading="lazy" />
                </a>
              `
                )
                .join('')}</div>`
            : '<p class="gallery-empty">This album is empty.</p>'
        }
      </div>
    `
    )
    .join('');
}

function bindGalleryToggles(hub) {
  hub.querySelectorAll('.gallery-row-toggle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.gallery-item');
      const detail = item?.querySelector('.gallery-detail');
      if (!detail) return;

      const isOpen = item.classList.contains('is-open');
      hub.querySelectorAll('.gallery-item.is-open').forEach((el) => {
        el.classList.remove('is-open');
        el.querySelector('.gallery-row-toggle')?.setAttribute('aria-expanded', 'false');
        el.querySelector('.gallery-detail')?.classList.add('hidden');
      });

      if (isOpen) return;

      const id = btn.dataset.bookingId;
      item.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      detail.classList.remove('hidden');
      detail.innerHTML = '<p class="bookings-loading">Loading photos…</p>';

      try {
        const res = await galleryApi.getByBooking(id);
        detail.innerHTML = renderGalleryAlbums(res.data || []);
      } catch (err) {
        detail.innerHTML = `<p class="bookings-empty error">${escapeHtml(err.message)}</p>`;
      }
    });
  });
}

function renderGalleryHub(bookings) {
  const hub = document.getElementById('galleryHub');
  if (!hub) return;

  const eligible = bookings.filter((b) => {
    const status = b.bookingStatus || '';
    return status === 'completed' || status === 'confirmed';
  });

  const list = eligible.length ? eligible : bookings;

  if (!list.length) {
    hub.innerHTML = `
      <p class="bookings-empty">No sessions yet.</p>
      <button type="button" class="btn btn-purple" style="margin-top:1rem" data-go-panel="book">Book a session</button>
    `;
    hub.querySelector('[data-go-panel]')?.addEventListener('click', () => showPanel('book'));
    return;
  }

  hub.innerHTML = list
    .map((b) => {
      const id = String(b._id);
      const st = statusLabel(b);
      return `
        <article class="gallery-item booking-item">
          <button type="button" class="booking-row gallery-row-toggle" data-booking-id="${id}" aria-expanded="false">
            <div class="booking-row-main">
              <h3>${escapeHtml(serviceNames(b))}</h3>
              <p class="booking-meta">${escapeHtml(formatDate(b.bookingDate))} · ${escapeHtml(b.bookingTime || '—')}</p>
            </div>
            <div class="booking-row-end">
              <span class="booking-status booking-status--${st.class}">${st.text}</span>
              <span class="booking-chevron" aria-hidden="true">›</span>
            </div>
          </button>
          <div class="gallery-detail booking-detail hidden" id="gallery-detail-${id}"></div>
        </article>
      `;
    })
    .join('');

  bindGalleryToggles(hub);
}

async function loadGalleryHub() {
  const hub = document.getElementById('galleryHub');
  if (!hub) return;
  hub.innerHTML = '<p class="bookings-loading">Loading…</p>';

  try {
    const res = await bookingApi.getMyBookings();
    renderGalleryHub(res.data || []);
  } catch (err) {
    hub.innerHTML = `<p class="bookings-empty error">${escapeHtml(err.message)}</p>`;
  }
}

async function loadBookings() {
  const list = document.getElementById('bookingsList');
  if (!list) return;
  list.innerHTML = '<p class="bookings-loading">Loading…</p>';

  try {
    const res = await bookingApi.getMyBookings();
    const data = res.data || [];
    bookingsById = new Map(data.map((b) => [String(b._id), b]));
    renderBookings(data);
  } catch (err) {
    list.innerHTML = `<p class="bookings-empty error">${escapeHtml(err.message)}</p>`;
  }
}

async function init() {
  if (!(await requireAuth())) return;

  await fetchSession();
  fillProfile(getUser());
  initProfileEdit();
  initChatWidget();
  initTabs();
  const hash = location.hash.replace('#', '');
  showPanel(['book', 'bookings', 'gallery', 'profile'].includes(hash) ? hash : 'book', {
    updateHash: false,
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());

  await initHomePackages({
    onCheckout: () => {
      window.location.href = '/checkout.html';
    },
  });

  loadBookings();
}

init();
