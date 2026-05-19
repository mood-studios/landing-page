import { DASHBOARD_PATH } from './config.js';
import {
  login,
  register,
  verifyOtp,
  resendOtp,
  getUser,
  isAuthenticated,
  logout,
  fetchSession,
} from './auth.js';
import { showAlert } from './app-dialog.js';
import {
  mountRegisterRecaptcha,
  getRegisterRecaptchaToken,
  resetRegisterRecaptcha,
  isRecaptchaEnabled,
} from './recaptcha.js';

let onSuccessCallback = null;
let resendCooldownTimer = null;

const OTP_SPAM_NOTE =
  "If you don't see it within a minute, check your Spam or Promotions folder. Mark the email as Not spam so the next code goes to your inbox.";

const emailSentAlertMessage = (email) =>
  `We sent a 6-digit code to ${email}.\n\n${OTP_SPAM_NOTE}`;

function showPanel(id) {
  document.querySelectorAll('[data-auth-panel]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.authPanel !== id);
  });
  const title = document.getElementById('authModalTitle');
  const sub = document.querySelector('.auth-modal-sub');
  if (title) {
    const titles = { login: 'Log in', register: 'Create account', otp: 'Verify email' };
    title.textContent = titles[id] || 'Welcome';
  }
  if (sub) {
    const subs = {
      login: 'Sign in to book and manage your sessions',
      register: 'Create your account to book sessions',
      otp: 'Check your inbox — and Spam if needed',
    };
    sub.textContent = subs[id] || subs.login;
  }

  if (id === 'register') {
    requestAnimationFrame(() => mountRegisterRecaptcha());
  }
}

function updateOtpHint(email) {
  const hint = document.getElementById('otpHint');
  if (hint && email) {
    hint.textContent = `Enter the 6-digit code we sent to ${email}.`;
  }
  const spamNote = document.getElementById('otpSpamNote');
  if (spamNote) spamNote.classList.remove('hidden');
}

function setResendCooldown(seconds) {
  const btn = document.getElementById('resendOtpBtn');
  if (!btn) return;

  clearInterval(resendCooldownTimer);
  if (seconds <= 0) {
    btn.disabled = false;
    btn.textContent = 'Resend';
    return;
  }

  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Resend (${left}s)`;

  resendCooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendCooldownTimer);
      btn.disabled = false;
      btn.textContent = 'Resend';
      return;
    }
    btn.textContent = `Resend (${left}s)`;
  }, 1000);
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
    if (!data.isVerified || data.requiresVerification) {
      showPanel('otp');
      document.getElementById('otpEmail').value = email;
      updateOtpHint(email);
      setResendCooldown(60);
      if (data.requiresVerification) {
        await showAlert(emailSentAlertMessage(email), {
          title: 'Check your email',
          variant: 'success',
        });
      }
    } else {
      finishAuth();
    }
  } catch (err) {
    await showAlert(err.message, { title: 'Log in failed', variant: 'error' });
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
  const recaptchaToken = getRegisterRecaptchaToken();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  if (isRecaptchaEnabled() && !recaptchaToken) {
    await showAlert('Please complete the reCAPTCHA check.', { variant: 'error' });
    btn.disabled = false;
    return;
  }

  try {
    await register({ name, email, password, phone, recaptchaToken });
    showPanel('otp');
    document.getElementById('otpEmail').value = email;
    updateOtpHint(email);
    setResendCooldown(60);
    await showAlert(emailSentAlertMessage(email), {
      title: 'Check your email',
      variant: 'success',
    });
  } catch (err) {
    resetRegisterRecaptcha();
    await showAlert(err.message, { title: 'Sign up failed', variant: 'error' });
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
    await showAlert(err.message, { title: 'Verification failed', variant: 'error' });
  } finally {
    btn.disabled = false;
  }
}

async function handleResendOtp() {
  const email = document.getElementById('otpEmail')?.value.trim();
  if (!email) return;

  const btn = document.getElementById('resendOtpBtn');
  if (btn?.disabled) return;

  try {
    await resendOtp(email);
    setResendCooldown(60);
    await showAlert(emailSentAlertMessage(email), {
      title: 'Code resent',
      variant: 'success',
    });
  } catch (err) {
    await showAlert(err.message, { title: 'Could not resend', variant: 'error' });
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
  document.getElementById('resendOtpBtn')?.addEventListener('click', handleResendOtp);

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
