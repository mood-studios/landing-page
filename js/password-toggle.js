/** Show/hide toggle for password fields inside `.password-input-wrap`. */
export function initPasswordToggles(root = document) {
  root.querySelectorAll('[data-password-toggle]').forEach((btn) => {
    if (btn.dataset.passwordBound) return;
    btn.dataset.passwordBound = '1';

    const wrap = btn.closest('.password-input-wrap');
    const input = wrap?.querySelector('input');
    if (!input) return;

    const setVisible = (visible) => {
      input.type = visible ? 'text' : 'password';
      btn.textContent = visible ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    };

    setVisible(false);
    btn.addEventListener('click', () => setVisible(input.type === 'password'));
  });
}
