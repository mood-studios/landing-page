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
    cache: 'no-store',
    ...options,
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...apiHeaders(options.headers || {}),
    },
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
  getFeaturedPhotos: () => apiFetch('/public/featured-photos'),
  getAllServices: () => apiFetch('/public/services'),
  getServices: (categoryId) =>
    apiFetch(`/public/services${categoryId ? `?category=${categoryId}` : ''}`),
  getAvailability: (date, durationMinutes) => {
    const params = new URLSearchParams({ date });
    if (durationMinutes) params.set('durationMinutes', String(durationMinutes));
    return apiFetch(`/public/availability?${params}`);
  },
  getBlockedDays: () => apiFetch('/public/blocked-days'),
  getSchedule: () => apiFetch('/public/schedule'),
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
  sendForgotPasswordOtp: (email) =>
    apiFetch('/auth/forgot-password/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetForgotPassword: (email, otp, password) =>
    apiFetch('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, otp, password }),
    }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
};

export const bookingDraftApi = {
  get: () => apiFetch('/booking-drafts/me'),
  save: (body) =>
    apiFetch('/booking-drafts/me', { method: 'PUT', body: JSON.stringify(body) }),
  clear: () => apiFetch('/booking-drafts/me', { method: 'DELETE' }),
};

export const bookingApi = {
  getMyBookings: () => apiFetch(`/bookings/my?_=${Date.now()}`),
  getBooking: (id) => apiFetch(`/bookings/${id}?_=${Date.now()}`),
  cancel: (id) => apiFetch(`/bookings/${id}`, { method: 'DELETE' }),
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
  deleteAccount: (password) =>
    apiFetch('/users/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
};

export const galleryApi = {
  getByBooking: (bookingId) => apiFetch(`/gallery/booking/${bookingId}`),
  downloadAlbum: async (albumId, filename = 'album') => {
    const url = `${API_BASE}/gallery/${albumId}/download`;
    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: apiHeaders({ Accept: 'application/zip' }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = 'Download failed';
      try {
        const data = text ? JSON.parse(text) : {};
        message = data.message || message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    const safe = String(filename).replace(/[^\w\-]+/g, '_').slice(0, 80) || 'album';
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safe}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  },
};

export const chatApi = {
  getStudio: () => apiFetch('/chat/studio'),
  getHistory: (receiverId) =>
    apiFetch(`/chat/history?${new URLSearchParams({ receiverId })}`),
  sendMessage: (receiverId, message) =>
    apiFetch('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ receiverId, message }),
    }),
};
