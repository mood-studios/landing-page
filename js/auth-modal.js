import { DASHBOARD_PATH } from './config.js';
import {
  login,
  register,
  sendSignupOtp,
  verifySignupOtp,
  verifyOtp,
  resendOtp,
  sendForgotPasswordOtp,
  resetForgotPassword,
  getUser,
  isAuthenticated,
  logout,
  fetchSession,
} from './auth.js';
import { showAlert } from './app-dialog.js';
import { initPasswordToggles } from './password-toggle.js';
import {
  mountRegisterRecaptcha,
  getRegisterRecaptchaToken,
  resetRegisterRecaptcha,
  isRecaptchaEnabled,
} from './recaptcha.js';
import {
  bindPasswordInputValidation,
  isValidPassword,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from './password.js';
import {
  bindFullNameInput,
  bindPhoneInput,
  validateFullName,
  validatePhone11,
  validateFields,
  sanitizePhoneDigits,
} from './form-validation.js';

let onSuccessCallback = null;
let resendCooldownTimer = null;
let forgotSendCooldownTimer = null;
let isSignupEmailVerified = false;

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
    const titles = {
      login: 'Log in',
      register: 'Create account',
      otp: 'Verify email',
      forgot: 'Reset password',
    };
    title.textContent = titles[id] || 'Welcome';
  }
  if (sub) {
    const subs = {
      login: 'Sign in to book and manage your sessions',
      register: 'Create your account to book sessions',
      otp: 'Check your inbox — and Spam if needed',
      forgot: 'We’ll email you a code to choose a new password',
    };
    sub.textContent = subs[id] || subs.login;
  }

  if (id === 'register') {
    isSignupEmailVerified = false;
    const status = document.getElementById('signupEmailVerifyStatus');
    if (status) status.textContent = '';
    requestAnimationFrame(() => mountRegisterRecaptcha());
  }
}

function setSignupVerifyStatus(text, color) {
  const el = document.getElementById('signupEmailVerifyStatus');
  if (!el) return;
  el.textContent = text;
  if (color) el.style.color = color;
}

async function handleSendSignupOtp() {
  const email = document.getElementById('regEmail')?.value.trim();
  if (!email || !email.includes('@')) {
    await showAlert('Enter a valid email first.', { variant: 'error' });
    return;
  }

  isSignupEmailVerified = false;
  setSignupVerifyStatus('Sending code…', '#7a0cd4');

  try {
    await sendSignupOtp(email);
    setSignupVerifyStatus('Code sent. Check your email.', '#2e7d32');
    document.getElementById('regEmailOtp')?.focus();
  } catch (err) {
    setSignupVerifyStatus(err.message || 'Could not send code', '#c62828');
  }
}

async function handleVerifySignupOtp() {
  const email = document.getElementById('regEmail')?.value.trim();
  const otp = document.getElementById('regEmailOtp')?.value.trim().replace(/\D/g, '');
  if (!email || !email.includes('@')) {
    await showAlert('Enter a valid email first.', { variant: 'error' });
    return;
  }
  if (!/^\d{6}$/.test(otp)) {
    await showAlert('Enter the 6-digit code from your email.', { variant: 'error' });
    return;
  }

  setSignupVerifyStatus('Verifying…', '#7a0cd4');

  try {
    await verifySignupOtp(email, otp);
    isSignupEmailVerified = true;
    setSignupVerifyStatus('Email verified ✓', '#2e7d32');
    document.getElementById('sendSignupOtpBtn')?.setAttribute('disabled', 'true');
    document.getElementById('verifySignupOtpBtn')?.setAttribute('disabled', 'true');
    document.getElementById('regEmailOtp')?.setAttribute('disabled', 'true');
  } catch (err) {
    isSignupEmailVerified = false;
    setSignupVerifyStatus(err.message || 'Invalid code', '#c62828');
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
  const nameEl = document.getElementById('regName');
  const phoneEl = document.getElementById('regPhone');
  const name = nameEl.value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = sanitizePhoneDigits(phoneEl.value);
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  if (
    !validateFields([
      { input: nameEl, error: validateFullName(nameEl.value) },
      { input: phoneEl, error: validatePhone11(phoneEl.value) },
    ])
  ) {
    btn.disabled = false;
    return;
  }

  if (password !== confirmPassword) {
    await showAlert('Passwords do not match. Please check both fields and try again.', {
      title: 'Passwords do not match',
      variant: 'error',
    });
    btn.disabled = false;
    return;
  }

  if (!isValidPassword(password)) {
    await showAlert(PASSWORD_REQUIREMENTS_MESSAGE, {
      title: 'Password requirements',
      variant: 'error',
    });
    document.getElementById('regPassword')?.focus();
    btn.disabled = false;
    return;
  }

  const recaptchaToken = getRegisterRecaptchaToken();

  if (!isSignupEmailVerified) {
    await showAlert('Please verify your email with the code we sent before creating your account.', {
      title: 'Email not verified',
      variant: 'error',
    });
    btn.disabled = false;
    return;
  }

  if (isRecaptchaEnabled() && !recaptchaToken) {
    await showAlert('Please complete the reCAPTCHA check.', { variant: 'error' });
    btn.disabled = false;
    return;
  }

  try {
    await register({ name, email, password, phone, recaptchaToken });
    finishAuth();
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

function setForgotOtpStatus(text, color) {
  const el = document.getElementById('forgotOtpStatus');
  if (!el) return;
  el.textContent = text;
  if (color) el.style.color = color;
}

function setForgotSendCooldown(seconds) {
  const btn = document.getElementById('sendForgotOtpBtn');
  if (!btn) return;

  clearInterval(forgotSendCooldownTimer);
  if (seconds <= 0) {
    btn.disabled = false;
    btn.textContent = 'Send code';
    return;
  }

  let left = seconds;
  btn.disabled = true;
  btn.textContent = `Send code (${left}s)`;

  forgotSendCooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(forgotSendCooldownTimer);
      btn.disabled = false;
      btn.textContent = 'Send code';
      return;
    }
    btn.textContent = `Send code (${left}s)`;
  }, 1000);
}

async function handleSendForgotOtp() {
  const email = document.getElementById('forgotEmail')?.value.trim();
  if (!email || !email.includes('@')) {
    await showAlert('Enter a valid email first.', { variant: 'error' });
    return;
  }

  setForgotOtpStatus('Sending code…', '#7a0cd4');

  try {
    await sendForgotPasswordOtp(email);
    setForgotOtpStatus('If this email is registered, a code was sent. Check your inbox.', '#2e7d32');
    document.getElementById('forgotOtp')?.focus();
    setForgotSendCooldown(60);
  } catch (err) {
    setForgotOtpStatus(err.message || 'Could not send code', '#c62828');
  }
}

async function handleForgotReset(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail')?.value.trim();
  const otp = document.getElementById('forgotOtp')?.value.trim().replace(/\D/g, '');
  const password = document.getElementById('forgotPassword')?.value;
  const confirmPassword = document.getElementById('forgotConfirmPassword')?.value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  if (!email || !email.includes('@')) {
    await showAlert('Enter a valid email.', { variant: 'error' });
    btn.disabled = false;
    return;
  }

  if (!/^\d{6}$/.test(otp)) {
    await showAlert('Enter the 6-digit code from your email.', { variant: 'error' });
    btn.disabled = false;
    return;
  }

  if (password !== confirmPassword) {
    await showAlert('Passwords do not match.', { variant: 'error' });
    btn.disabled = false;
    return;
  }

  if (!isValidPassword(password)) {
    await showAlert(PASSWORD_REQUIREMENTS_MESSAGE, {
      title: 'Password requirements',
      variant: 'error',
    });
    btn.disabled = false;
    return;
  }

  try {
    await resetForgotPassword(email, otp, password);
    await showAlert('Your password was updated. You can log in now.', {
      title: 'Password reset',
      variant: 'success',
    });
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = '';
    showPanel('login');
  } catch (err) {
    await showAlert(err.message, { title: 'Reset failed', variant: 'error' });
  } finally {
    btn.disabled = false;
  }
}

function openForgotPanel() {
  const loginEmail = document.getElementById('loginEmail')?.value.trim();
  if (loginEmail) {
    document.getElementById('forgotEmail').value = loginEmail;
  }
  setForgotOtpStatus('');
  showPanel('forgot');
  document.getElementById('forgotEmail')?.focus();
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
  bindPasswordInputValidation('regPassword');
  bindFullNameInput('regName');
  bindPhoneInput('regPhone');
  document.getElementById('sendSignupOtpBtn')?.addEventListener('click', handleSendSignupOtp);
  document.getElementById('verifySignupOtpBtn')?.addEventListener('click', handleVerifySignupOtp);
  document.getElementById('otpForm')?.addEventListener('submit', handleOtp);
  document.getElementById('resendOtpBtn')?.addEventListener('click', handleResendOtp);
  document.getElementById('forgotForm')?.addEventListener('submit', handleForgotReset);
  document.getElementById('sendForgotOtpBtn')?.addEventListener('click', handleSendForgotOtp);
  bindPasswordInputValidation('forgotPassword');

  document.getElementById('showForgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPanel();
  });
  document.getElementById('showLoginFromForgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('login');
  });

  document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('register');
  });
  document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPanel('login');
  });

  initPasswordToggles(document.getElementById('authModal'));
}

export async function initAuthSession() {
  await fetchSession();
  updateAuthNav();
}
