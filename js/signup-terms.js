/** Sign-up terms & conditions (SafeBite-style modal acceptance). */

const signupTermsState = {
  accepted: false,
};

export function isSignupTermsAccepted() {
  return signupTermsState.accepted;
}

export function resetSignupTerms() {
  signupTermsState.accepted = false;
  updateSignupTermsUi();
}

function getTermsRow() {
  return document.getElementById('signupTermsRow');
}

function getProgressEl() {
  return document.getElementById('signupTermsProgress');
}

function updateSignupTermsUi() {
  const row = getTermsRow();
  const textEl = document.getElementById('signupTermsText');
  const progress = getProgressEl();

  if (textEl) {
    if (signupTermsState.accepted) {
      textEl.innerHTML =
        '✓ I have read and agree to the <a href="#" id="openSignupTermsLink" class="auth-terms-link">Terms and Conditions</a>';
      textEl.classList.add('auth-terms-accepted');
    } else {
      textEl.innerHTML =
        'I agree to the <a href="#" id="openSignupTermsLink" class="auth-terms-link">Terms and Conditions</a>';
      textEl.classList.remove('auth-terms-accepted');
    }
  }

  const progressBar = document.getElementById('signupTermsProgressBar');
  if (progressBar) {
    progressBar.style.width = signupTermsState.accepted ? '100%' : '0%';
  }

  if (progress) {
    progress.textContent = signupTermsState.accepted
      ? '1/1 agreement accepted'
      : '0/1 agreement accepted';
    progress.classList.toggle('auth-terms-progress--done', signupTermsState.accepted);
  }

  if (row) {
    row.classList.toggle('auth-terms-row--accepted', signupTermsState.accepted);
  }
}

function lockBodyScroll(lock) {
  if (lock) {
    document.body.classList.add('auth-terms-modal-open');
  } else {
    document.body.classList.remove('auth-terms-modal-open');
    const authOpen = document.getElementById('authModal') && !document.getElementById('authModal').classList.contains('hidden');
    if (!authOpen) document.body.classList.remove('auth-modal-open');
  }
}

export function openSignupTermsModal() {
  const modal = document.getElementById('signupTermsModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  lockBodyScroll(true);
  const content = modal.querySelector('.auth-terms-modal__body');
  if (content) content.scrollTop = 0;
  modal.querySelector('.auth-terms-understand-btn')?.focus();
}

export function closeSignupTermsModal() {
  const modal = document.getElementById('signupTermsModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  const authOpen = document.getElementById('authModal') && !document.getElementById('authModal').classList.contains('hidden');
  lockBodyScroll(authOpen);
  if (authOpen) document.body.classList.add('auth-modal-open');
}

export function acceptSignupTerms() {
  signupTermsState.accepted = true;
  updateSignupTermsUi();
  closeSignupTermsModal();
}

export function initSignupTerms() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('#openSignupTermsLink');
    if (!link) return;
    e.preventDefault();
    openSignupTermsModal();
  });

  document.querySelectorAll('[data-signup-terms-close]').forEach((el) => {
    el.addEventListener('click', () => closeSignupTermsModal());
  });

  document.getElementById('signupTermsAcceptBtn')?.addEventListener('click', () => {
    acceptSignupTerms();
  });

  updateSignupTermsUi();
}
