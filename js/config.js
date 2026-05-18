const envBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
export const API_BASE = envBase ? `${envBase}/api` : '/api';
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.replace(/\/$/, '') || envBase || '';
export const DASHBOARD_PATH = '/dashboard.html';
