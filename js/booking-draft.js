import { bookingDraftApi } from './api.js';
import {
  getCart,
  saveCart,
  getSelectedIndices,
  setSelectedIndices,
  setCartStorageUserId,
  getCartStorageUserId,
  getDraftLocalTimestamp,
  countCartSessions,
  countScheduledSessions,
  setCartPersistHandler,
} from './cart.js';

const CHECKOUT_KEY = 'mood_checkout_payment';
const SESSION_KEY = 'mood_payment_session';

let saveTimer = null;
let currentUserId = null;
let sessionRestored = false;
let lastDraftSummary = null;

function readContactForm() {
  const fullName = document.getElementById('fullName')?.value?.trim() || '';
  const email = document.getElementById('email')?.value?.trim() || '';
  const phone = document.getElementById('phone')?.value?.trim() || '';
  const notes = document.getElementById('notes')?.value?.trim() || '';
  if (!fullName && !email && !phone && !notes) return {};
  return { fullName, email, phone, notes };
}

function readCheckoutPayment() {
  try {
    const stored = sessionStorage.getItem(CHECKOUT_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return {};
}

function readPaymentSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return null;
}

function writeCheckoutPayment(data) {
  if (!data?.bookingIds?.length) return;
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(data));
}

function writePaymentSession(data) {
  if (!data?.paymentId) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function hasDraftContent(draft) {
  if (!draft) return false;
  if (Array.isArray(draft.cart) && draft.cart.length > 0) return true;
  if (Array.isArray(draft.checkoutPayment?.bookingIds) && draft.checkoutPayment.bookingIds.length) {
    return true;
  }
  return false;
}

function summarizeDraft(draft) {
  const cartCount = countCartSessions(draft.cart || []);
  const scheduledCount = countScheduledSessions(draft.cart || []);
  const pendingPayment = draft.checkoutPayment?.bookingIds?.length || 0;
  return { cartCount, scheduledCount, pendingPayment, draft };
}

function applyDraft(draft) {
  if (Array.isArray(draft.cart)) {
    saveCart(draft.cart);
  }
  if (Array.isArray(draft.selectedIndices)) {
    setSelectedIndices(new Set(draft.selectedIndices));
  }
  if (draft.contactForm) {
    const { fullName, email, phone, notes } = draft.contactForm;
    const nameEl = document.getElementById('fullName');
    const emailEl = document.getElementById('email');
    const phoneEl = document.getElementById('phone');
    const notesEl = document.getElementById('notes');
    if (nameEl && fullName) nameEl.value = fullName;
    if (emailEl && email) emailEl.value = email;
    if (phoneEl && phone) phoneEl.value = phone;
    if (notesEl && notes) notesEl.value = notes;
  }
  if (draft.checkoutPayment?.bookingIds?.length) {
    writeCheckoutPayment(draft.checkoutPayment);
  }
  if (draft.paymentSession?.paymentId) {
    writePaymentSession(draft.paymentSession);
  }
}

export function collectDraftSnapshot() {
  return {
    cart: getCart(),
    selectedIndices: [...getSelectedIndices()],
    contactForm: readContactForm(),
    checkoutPayment: readCheckoutPayment(),
    paymentSession: readPaymentSession(),
  };
}

async function pushDraftToServer(snapshot = collectDraftSnapshot()) {
  return syncDraftToServer(snapshot);
}

export function refreshDraftSummary() {
  const snapshot = collectDraftSnapshot();
  if (!hasDraftContent(snapshot) && !snapshot.paymentSession) {
    lastDraftSummary = null;
    return null;
  }
  lastDraftSummary = summarizeDraft(snapshot);
  return lastDraftSummary;
}

export function scheduleBookingDraftSave() {
  if (!currentUserId) return;
  clearTimeout(saveTimer);
  const snapshot = collectDraftSnapshot();
  const isEmpty = !hasDraftContent(snapshot) && !snapshot.paymentSession;
  saveTimer = setTimeout(async () => {
    try {
      await syncDraftToServer();
    } catch {
      /* offline or server error — local copy still kept */
    }
  }, isEmpty ? 0 : 500);
}

export async function flushBookingDraftSave() {
  if (!currentUserId) return;
  clearTimeout(saveTimer);
  try {
    await syncDraftToServer();
  } catch {
    /* ignore */
  }
}

export async function clearBookingDraft() {
  if (!currentUserId) return;
  clearTimeout(saveTimer);
  lastDraftSummary = null;
  sessionStorage.removeItem(CHECKOUT_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  try {
    await bookingDraftApi.clear();
  } catch {
    /* ignore */
  }
}

async function syncDraftToServer(snapshot = collectDraftSnapshot()) {
  if (!currentUserId) return null;
  const hasContent = hasDraftContent(snapshot) || snapshot.paymentSession;
  if (!hasContent) {
    await clearBookingDraft();
    return null;
  }
  const res = await bookingDraftApi.save(snapshot);
  lastDraftSummary = summarizeDraft(res.data || snapshot);
  return res.data;
}

export function resetDraftSession() {
  sessionRestored = false;
  currentUserId = null;
  lastDraftSummary = null;
}

export function getLastDraftSummary() {
  return lastDraftSummary;
}

export async function restoreBookingDraft(user) {
  if (!user?._id) return null;
  if (currentUserId && currentUserId !== String(user._id)) {
    sessionRestored = false;
  }
  if (sessionRestored && getCartStorageUserId() === String(user._id)) {
    return lastDraftSummary;
  }

  currentUserId = String(user._id);
  setCartStorageUserId(currentUserId);
  sessionRestored = true;

  let serverDraft = null;
  try {
    const res = await bookingDraftApi.get();
    serverDraft = res.data;
  } catch {
    serverDraft = null;
  }

  const localTs = getDraftLocalTimestamp(currentUserId);
  const serverTs = serverDraft?.updatedAt ? new Date(serverDraft.updatedAt).getTime() : 0;
  const localCart = getCart();
  const localHasContent = localCart.length > 0 || readCheckoutPayment()?.bookingIds?.length;

  if (hasDraftContent(serverDraft)) {
    if (!localHasContent && localTs >= serverTs) {
      await clearBookingDraft();
      return null;
    }
    if (serverTs >= localTs || !localHasContent) {
      applyDraft(serverDraft);
      lastDraftSummary = summarizeDraft(serverDraft);
      return lastDraftSummary;
    }
  }

  if (localHasContent) {
    try {
      await syncDraftToServer();
    } catch {
      /* ignore */
    }
    return refreshDraftSummary();
  }

  lastDraftSummary = null;
  return null;
}

export function getResumeTarget(summary) {
  if (!summary) return null;
  if (summary.pendingPayment > 0) {
    return {
      href: '/payment.html',
      label: 'Continue payment',
      message: `You have ${summary.pendingPayment} unpaid booking${summary.pendingPayment !== 1 ? 's' : ''} waiting for payment.`,
    };
  }
  if (summary.cartCount > 0) {
    const detail =
      summary.scheduledCount > 0
        ? `${summary.scheduledCount} of ${summary.cartCount} session${summary.cartCount !== 1 ? 's' : ''} have dates and times picked.`
        : `${summary.cartCount} item${summary.cartCount !== 1 ? 's' : ''} in your cart.`;
    return {
      href: '/checkout.html',
      label: 'Continue checkout',
      message: `Pick up where you left off — ${detail}`,
    };
  }
  return null;
}

export function renderResumeBanner(containerId = 'resumeBanner') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const summary = container._draftSummary;
  const target = getResumeTarget(summary);
  if (!target) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="resume-banner">
      <div class="resume-banner__text">
        <strong>Continue where you left off</strong>
        <p>${target.message}</p>
      </div>
      <a href="${target.href}" class="btn btn-purple btn-sm">${target.label}</a>
    </div>
  `;
}

export function mountResumeBanner(containerId, summary) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container._draftSummary = summary;
  renderResumeBanner(containerId);
}

setCartPersistHandler(scheduleBookingDraftSave);

export async function saveCheckoutPaymentDraft(checkoutPayment, paymentSession = null) {
  if (checkoutPayment) writeCheckoutPayment(checkoutPayment);
  if (paymentSession) writePaymentSession(paymentSession);
  await flushBookingDraftSave();
}

export function bindCheckoutFormDraftSave() {
  const ids = ['fullName', 'email', 'phone', 'notes'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el || el.dataset.draftBound) continue;
    el.dataset.draftBound = '1';
    el.addEventListener('input', scheduleBookingDraftSave);
    el.addEventListener('change', scheduleBookingDraftSave);
  }
}

export function restorePaymentDraftFromServer() {
  return readCheckoutPayment();
}
