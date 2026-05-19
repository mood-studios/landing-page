import { authApi, userApi } from './api.js';

let currentUser = null;
let sessionPromise = null;

function userFromAuthData(data) {
  if (!data) return null;
  const { token: _token, ...user } = data;
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
    } catch {
      currentUser = null;
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
  return currentUser;
}

export async function resendOtp(email) {
  await authApi.resendOtp(email);
}

export async function verifyOtp(email, otp) {
  const res = await authApi.verifyOtp(email, otp);
  currentUser = userFromAuthData(res.data);
  return currentUser;
}

export async function syncProfileFields({ name, phone }) {
  if (!name && !phone) return;
  await userApi.updateProfile({ name, phone });
  await fetchSession();
}

export async function logout() {
  try {
    await authApi.logout();
  } catch {
    /* cookie cleared or session already expired */
  }
  currentUser = null;
  window.location.href = '/';
}
