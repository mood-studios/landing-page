import { authApi, userApi, setAuthToken } from './api.js';
import { showConfirm } from './app-dialog.js';

let currentUser = null;
let sessionPromise = null;

async function syncBookingDraft(user) {
  if (!user?._id) return null;
  const { restoreBookingDraft } = await import('./booking-draft.js');
  return restoreBookingDraft(user);
}

function userFromAuthData(data) {
  if (!data) return null;
  const { token, ...user } = data;
  if (token) setAuthToken(token);
  return user;
}

export function getUser() {
  return currentUser;
}

export async function fetchSession() {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    try {
      const res = await authApi.me();
      currentUser = res.data || null;
      if (currentUser) await syncBookingDraft(currentUser);
    } catch {
      currentUser = null;
      setAuthToken(null);
    }
    return currentUser;
  })();

  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

export async function isAuthenticated() {
  if (currentUser) return true;
  const user = await fetchSession();
  return Boolean(user);
}

export async function requireAuth() {
  const ok = await isAuthenticated();
  if (!ok) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/?auth=login&next=${next}`;
    return false;
  }
  return true;
}

export async function login(email, password) {
  const res = await authApi.login(email, password);
  currentUser = userFromAuthData(res.data);
  if (currentUser) await syncBookingDraft(currentUser);
  return currentUser;
}

export async function sendSignupOtp(email) {
  await authApi.sendSignupOtp(email);
}

export async function verifySignupOtp(email, otp) {
  await authApi.verifySignupOtp(email, otp);
}

export async function register({ name, email, password, phone, recaptchaToken }) {
  const res = await authApi.register({
    name,
    email,
    password,
    phone,
    recaptchaToken,
  });
  currentUser = userFromAuthData(res.data);
  if (currentUser) await syncBookingDraft(currentUser);
  return currentUser;
}

export async function resendOtp(email) {
  await authApi.resendOtp(email);
}

export async function verifyOtp(email, otp) {
  const res = await authApi.verifyOtp(email, otp);
  currentUser = userFromAuthData(res.data);
  if (currentUser) await syncBookingDraft(currentUser);
  return currentUser;
}

export async function sendForgotPasswordOtp(email) {
  await authApi.sendForgotPasswordOtp(email);
}

export async function resetForgotPassword(email, otp, password) {
  await authApi.resetForgotPassword(email, otp, password);
}

export async function syncProfileFields({ name, phone }) {
  if (!name && !phone) return;
  await userApi.updateProfile({ name, phone });
  await fetchSession();
}

/**
 * @param {{ skipConfirm?: boolean }} [options]
 */
export async function logout(options = {}) {
  if (!options.skipConfirm) {
    const ok = await showConfirm('Are you sure you want to log out?', {
      title: 'Log out',
      confirmText: 'Log out',
    });
    if (!ok) return;
  }

  try {
    await authApi.logout();
  } catch {
    /* session cleared or already expired */
  }
  setAuthToken(null);
  currentUser = null;
  const { resetDraftSession } = await import('./booking-draft.js');
  resetDraftSession();
  window.location.href = '/';
}
