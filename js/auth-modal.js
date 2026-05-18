import { DASHBOARD_PATH } from './config.js';
import { login, register, verifyOtp, getUser, isAuthenticated, logout, fetchSession } from './auth.js';

let onSuccessCallback = null;

function showPanel(id) {
  document.querySelectorAll('[data-auth-panel]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.authPanel !== id);
  });
  const title = document.getElementById('authModalTitle');
  if (title) {
    const titles = { login: 'Log in', register: 'Create account', otp: 'Verify email' };
    title.textContent = titles[id] || 'Welcome';
  }
}

export function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-modal-open');
}

export async function openAuthModal({ panel = 'login', onSuccess } = {}) {
  const modal = document.getElementById('authModal');
  if (!modal) return;

  if (await isAuthenticated()) {
    if (onSuccess) onSuccess();
    else window.location.href = DASHBOARD_PATH;
    return;
  }

  onSuccessCallback = onSuccess || null;
  showPanel(panel);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-modal-open');
  document.getElementById('loginEmail')?.focus();
}

export function updateAuthNav() {
  const loggedIn = Boolean(getUser());
  const user = getUser();

  document.querySelectorAll('.auth-open-login').forEach((el) => {
    el.classList.toggle('hidden', loggedIn);
  });
  document.querySelectorAll('.auth-open-logout').forEach((el) => {
    el.classList.toggle('hidden', !loggedIn);
  });
  document.querySelectorAll('.nav-dashboard').forEach((el) => {
    el.classList.toggle('hidden', !loggedIn);
  });

  document.querySelectorAll('[data-user-greeting]').forEach((el) => {
    if (loggedIn && user?.name) {
      el.textContent = `Hi, ${user.name.split(' ')[0]}`;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function finishAuth() {
  closeAuthModal();
  updateAuthNav();
  if (onSuccessCallback) {
    const cb = onSuccessCallback;
    onSuccessCallback = null;
    cb();
    return;
  }
  window.location.href = DASHBOARD_PATH;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const data = await login(email, password);
    if (!data.isVerified) {
      showPanel('otp');
      document.getElementById('otpEmail').value = email;
    } else {
      finishAuth();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await register({ name, email, password, phone });
    showPanel('otp');
    document.getElementById('otpEmail').value = email;
    alert('Account created. Enter the OTP sent to your email (check server logs in dev).');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleOtp(e) {
  e.preventDefault();
  const email = document.getElementById('otpEmail').value.trim();
  const otp = document.getElementById('otpCode').value.trim();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    await verifyOtp(email, otp);
    finishAuth();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

export function initAuthModal() {
  document.querySelectorAll('[data-auth-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('mobile-menu')?.classList.remove('open');
      const panel = el.dataset.authOpen === 'register' ? 'register' : 'login';
      openAuthModal({ panel });
    });
  });

  document.querySelectorAll('[data-auth-close]').forEach((el) => {
    el.addEventListener('click', closeAuthModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('authModal') && !document.getElementById('authModal').classList.contains('hidden')) {
      closeAuthModal();
    }
  });

  document.querySelectorAll('.auth-open-logout').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });

  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
  document.getElementById('otpForm')?.addEventListener('submit', handleOtp);

  document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('register');
  });
  document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('login');
  });
}

export async function initAuthSession() {
  await fetchSession();
  updateAuthNav();
}
