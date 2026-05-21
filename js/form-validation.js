const NAME_LETTERS_ONLY = /^[\p{L}\s'.-]+$/u;

export function sanitizeFullName(value) {
  return value.replace(/[0-9]/g, '');
}

export function sanitizePhoneDigits(value) {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function validateFullName(value) {
  const v = value.trim();
  if (!v) return 'Full name is required.';
  if (/[0-9]/.test(v)) return 'Full name cannot contain numbers.';
  if (!NAME_LETTERS_ONLY.test(v)) return 'Use letters and spaces only.';
  if (v.length < 2) return 'Enter your full name.';
  return null;
}

export function validatePhone11(value) {
  const v = sanitizePhoneDigits(value);
  if (!v) return 'Phone number is required.';
  if (v.length !== 11) return 'Phone number must be exactly 11 digits.';
  return null;
}

function ensureFieldError(wrap) {
  let err = wrap.querySelector('.form-field-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'form-field-error';
    err.setAttribute('role', 'alert');
    wrap.appendChild(err);
  }
  return err;
}

export function markFieldInvalid(input, message) {
  const wrap = input?.closest('.form-field');
  if (!wrap) return;

  wrap.classList.remove('form-field--shake');
  wrap.classList.add('form-field--invalid');
  input.setAttribute('aria-invalid', 'true');

  const err = ensureFieldError(wrap);
  err.textContent = message;
  err.hidden = false;

  void wrap.offsetWidth;
  wrap.classList.add('form-field--shake');
  wrap.addEventListener(
    'animationend',
    () => wrap.classList.remove('form-field--shake'),
    { once: true }
  );
}

export function clearFieldInvalid(input) {
  const wrap = input?.closest('.form-field');
  if (!wrap) return;

  wrap.classList.remove('form-field--invalid', 'form-field--shake');
  input.removeAttribute('aria-invalid');

  const err = wrap.querySelector('.form-field-error');
  if (err) {
    err.textContent = '';
    err.hidden = true;
  }
}

export function bindFullNameInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.nameBound) return;
  input.dataset.nameBound = '1';

  input.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && /[0-9]/.test(e.key)) e.preventDefault();
  });

  input.addEventListener('input', () => {
    const cleaned = sanitizeFullName(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    if (input.value.trim()) clearFieldInvalid(input);
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '').replace(/[0-9]/g, '');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + pasted + input.value.slice(end);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function bindPhoneInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.phoneBound) return;
  input.dataset.phoneBound = '1';

  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('maxlength', '11');
  input.setAttribute('autocomplete', 'tel');

  input.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const allowed = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(e.key)) return;
    if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
  });

  input.addEventListener('input', () => {
    const cleaned = sanitizePhoneDigits(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    if (input.value.length) clearFieldInvalid(input);
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = sanitizePhoneDigits(e.clipboardData?.getData('text') || '');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const merged = sanitizePhoneDigits(
      input.value.slice(0, start) + pasted + input.value.slice(end)
    );
    input.value = merged;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** @returns {boolean} true if all fields valid */
export function validateFields(pairs) {
  let ok = true;
  for (const { input, error } of pairs) {
    if (error) {
      markFieldInvalid(input, error);
      ok = false;
    } else {
      clearFieldInvalid(input);
    }
  }
  if (!ok) pairs.find((p) => p.error)?.input?.focus();
  return ok;
}
