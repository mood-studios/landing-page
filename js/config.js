const envBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
/** Default image for packages/cart when no photo samples or service image. */
export const DEFAULT_SERVICE_IMAGE = '/img/mood_logo.png';
export const API_BASE = envBase ? `${envBase}/api` : '/api';
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.replace(/\/$/, '') || envBase || '';
export const DASHBOARD_PATH = '/dashboard.html';
export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
