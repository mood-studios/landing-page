import { paymentApi } from './api.js';
import { requireAuth, logout, fetchSession } from './auth.js';
import { formatMoney, removeCheckedOutItems } from './cart.js';
import { showAlert } from './app-dialog.js';

const CHECKOUT_KEY = 'mood_checkout_payment';
const SESSION_KEY = 'mood_payment_session';

let bookingIds = [];
let session = null;
let busy = false;

function loadCheckoutPayment() {
  const params = new URLSearchParams(window.location.search);
  const singleId = params.get('bookingId');
  if (singleId) {
    return { bookingIds: [singleId] };
  }

  try {
    const stored = sessionStorage.getItem(CHECKOUT_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }

  try {
    const legacy = sessionStorage.getItem('mood_pending_payments');
    if (legacy) {
      const list = JSON.parse(legacy);
      if (Array.isArray(list) && list.length) {
        return { bookingIds: list.map((p) => p.bookingId) };
      }
    }
  } catch {
    /* ignore */
  }

  return { bookingIds: [] };
}

function bookingIdsMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].map(String).sort();
  const sb = [...b].map(String).sort();
  return sa.every((id, i) => id === sb[i]);
}

function loadPaymentSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (!session?.paymentId || !bookingIdsMatch(session.bookingIds, bookingIds)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function savePaymentSession() {
  if (!session) return;
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      paymentId: session.paymentId,
      checkoutUrl: session.checkoutUrl,
      amount: session.amount,
      isTestMode: session.isTestMode,
      linkError: session.linkError,
      bookingIds,
    })
  );
}

function friendlyError(message) {
  const raw = message || '';
  if (raw.includes('not completed')) {
    return 'PayMongo has not marked this as paid yet. Use "Continue to PayMongo" first, pay with a test card, then tap "I\'ve completed payment".';
  }
  return raw.replace(/^Error:\s*/i, '');
}

function renderSession() {
  const amountEl = document.getElementById('paymentAmount');
  const testBanner = document.getElementById('testModeBanner');
  const linkBanner = document.getElementById('linkErrorBanner');
  const openBtn = document.getElementById('openPaymongoBtn');
  const confirmBtn = document.getElementById('confirmPaidBtn');
  const testBtn = document.getElementById('testConfirmBtn');
  const steps = document.querySelector('.payment-steps');
  const hint = document.getElementById('paymentQueueHint');

  if (!session) return;

  const amount = session.amount ?? 0;
  if (amountEl) amountEl.textContent = formatMoney(amount);

  if (hint) {
    if (bookingIds.length > 1) {
      hint.textContent = `One payment for ${bookingIds.length} sessions`;
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  testBanner?.classList.toggle('hidden', !session.isTestMode);
  if (session.linkError) {
    linkBanner.textContent = `Checkout link unavailable: ${session.linkError}`;
    linkBanner.classList.remove('hidden');
  } else {
    linkBanner?.classList.add('hidden');
  }

  const hasUrl = Boolean(session.checkoutUrl);
  openBtn.disabled = busy || !hasUrl;
  openBtn.classList.toggle('hidden', !hasUrl);
  confirmBtn.disabled = busy;
  steps?.classList.toggle('hidden', !hasUrl);

  const canTestSkip = session.isTestMode || !hasUrl;
  testBtn?.classList.toggle('hidden', !canTestSkip);
  testBtn.disabled = busy;
}

async function startSession() {
  if (!bookingIds.length) {
    window.location.href = '/dashboard.html';
    return;
  }

  const cached = loadPaymentSession();
  if (cached) {
    session = cached;
    renderSession();
    return;
  }

  const res = await paymentApi.createCombined(bookingIds);
  const data = res.data || {};
  const payment = data.payment || {};

  session = {
    paymentId: payment._id,
    checkoutUrl: data.checkoutUrl,
    amount: data.amount ?? payment.amount ?? 0,
    isTestMode: Boolean(data.isTestMode),
    linkError: data.linkError || null,
  };

  savePaymentSession();
  renderSession();
}

function openPaymongo() {
  if (!session?.checkoutUrl) return;
  window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer');
}

async function confirmPaid(testConfirm = false) {
  if (!session?.paymentId || busy) return;

  busy = true;
  setBusyUi(true);

  try {
    await paymentApi.confirm(session.paymentId, testConfirm);

    const checkout = loadCheckoutPayment();
    if (checkout.selectedCartIndices?.length) {
      removeCheckedOutItems(new Set(checkout.selectedCartIndices));
    }

    sessionStorage.removeItem(CHECKOUT_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('mood_pending_payments');
    sessionStorage.removeItem('mood_payment_total');
    window.location.href = '/success.html';
  } catch (err) {
    await showAlert(friendlyError(err.message), { title: 'Payment', variant: 'error' });
  } finally {
    busy = false;
    setBusyUi(false);
    renderSession();
  }
}

function setBusyUi(on) {
  const openBtn = document.getElementById('openPaymongoBtn');
  const confirmBtn = document.getElementById('confirmPaidBtn');
  const testBtn = document.getElementById('testConfirmBtn');
  if (confirmBtn) confirmBtn.textContent = on ? 'Confirming…' : "I've completed payment";
  if (testBtn) testBtn.textContent = on ? 'Please wait…' : 'Skip — mark as paid (test only)';
  if (openBtn) openBtn.disabled = on || !session?.checkoutUrl;
  if (confirmBtn) confirmBtn.disabled = on;
  if (testBtn) testBtn.disabled = on;
}

async function init() {
  if (!(await requireAuth())) return;
  await fetchSession();

  const checkout = loadCheckoutPayment();
  bookingIds = checkout.bookingIds || [];

  if (!bookingIds.length) {
    window.location.href = '/dashboard.html';
    return;
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
  document.getElementById('openPaymongoBtn')?.addEventListener('click', openPaymongo);
  document.getElementById('confirmPaidBtn')?.addEventListener('click', () => confirmPaid(false));
  document.getElementById('testConfirmBtn')?.addEventListener('click', () => confirmPaid(true));

  try {
    await startSession();
  } catch (err) {
    await showAlert(friendlyError(err.message), { title: 'Payment', variant: 'error' });
    window.location.href = '/dashboard.html';
  }
}

init();
