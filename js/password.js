/** At least 8 chars, one uppercase letter, one non-alphanumeric character. */
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter and a special character (e.g. ! @ #).';

export function isValidPassword(password) {
  return PASSWORD_REGEX.test(password);
}

export function bindPasswordInputValidation(inputId = 'regPassword') {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.passwordBound) return;
  input.dataset.passwordBound = '1';

  const validate = () => {
    const value = input.value;
    if (!value) {
      input.setCustomValidity('');
      return;
    }
    input.setCustomValidity(isValidPassword(value) ? '' : PASSWORD_REQUIREMENTS_MESSAGE);
  };

  input.addEventListener('input', validate);
  input.addEventListener('blur', validate);
}
