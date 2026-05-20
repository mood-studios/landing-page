import { API_BASE } from './config.js';

const TOKEN_KEY = 'mood_auth_token';

/** JWT for cross-origin production (cookies are not sent vercel.app → onrender.com). */
export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function apiHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: apiHeaders(options.headers || {}),
  });

  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid server response (${res.status})`);
  }

  if (!res.ok) {
    const msg = data.message || data.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

export const publicApi = {
  getCategories: () => apiFetch('/public/categories'),
  getAllServices: () => apiFetch('/public/services'),
  getServices: (categoryId) =>
    apiFetch(`/public/services${categoryId ? `?category=${categoryId}` : ''}`),
  getAvailability: (date, durationMinutes) => {
    const params = new URLSearchParams({ date });
    if (durationMinutes) params.set('durationMinutes', String(durationMinutes));
    return apiFetch(`/public/availability?${params}`);
  },
};

export const authApi = {
  me: () => apiFetch('/auth/me'),
  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  sendSignupOtp: (email) =>
    apiFetch('/auth/send-signup-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifySignupOtp: (email, otp) =>
    apiFetch('/auth/verify-signup-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),
  register: (body) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  resendOtp: (email) =>
    apiFetch('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyOtp: (email, otp) =>
    apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
};

export const bookingApi = {
  getMyBookings: () => apiFetch('/bookings/my'),
  getBooking: (id) => apiFetch(`/bookings/${id}`),
  create: (payload) =>
    apiFetch('/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  getAvailability: (date, durationMinutes) => {
    const params = new URLSearchParams({ date });
    if (durationMinutes) params.set('durationMinutes', String(durationMinutes));
    return apiFetch(`/bookings/availability?${params}`);
  },
};

export const paymentApi = {
  create: (bookingId) =>
    apiFetch('/payments', { method: 'POST', body: JSON.stringify({ bookingId }) }),
  createCombined: (bookingIds) =>
    apiFetch('/payments/combined', { method: 'POST', body: JSON.stringify({ bookingIds }) }),
  confirm: (paymentId, testConfirm = false) =>
    apiFetch(`/payments/${paymentId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ testConfirm }),
    }),
};

export const userApi = {
  updateProfile: (body) =>
    apiFetch('/users/profile', { method: 'PUT', body: JSON.stringify(body) }),
};

export const chatApi = {
  getStudio: () => apiFetch('/chat/studio'),
  getHistory: (receiverId) =>
    apiFetch(`/chat/history?${new URLSearchParams({ receiverId })}`),
};
