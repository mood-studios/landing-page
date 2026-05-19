let resolveDialog = null;

function ensureDialogDOM() {
  if (document.getElementById('appDialog')) return;

  const root = document.createElement('div');
  root.id = 'appDialog';
  root.className = 'app-dialog hidden';
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-labelledby', 'appDialogTitle');
  root.setAttribute('aria-describedby', 'appDialogMessage');
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="backdrop"></div>
    <div class="app-dialog-panel">
      <div class="app-dialog-icon" id="appDialogIcon" aria-hidden="true"></div>
      <h2 id="appDialogTitle" class="app-dialog-title">Notice</h2>
      <p id="appDialogMessage" class="app-dialog-message"></p>
      <div class="app-dialog-actions" id="appDialogActions">
        <button type="button" class="btn btn-ghost" id="appDialogCancel" data-dialog-action="cancel">Cancel</button>
        <button type="button" class="btn btn-purple" id="appDialogConfirm" data-dialog-action="confirm">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-dialog-action]')?.dataset.dialogAction;
    if (!action || !resolveDialog) return;
    if (action === 'backdrop') {
      finishDialog(root.dataset.mode !== 'confirm');
      return;
    }
    finishDialog(action === 'confirm');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.classList.contains('hidden')) return;
    if (root.dataset.mode === 'confirm') finishDialog(false);
    else finishDialog(true);
  });
}

function finishDialog(result) {
  const root = document.getElementById('appDialog');
  if (!root || !resolveDialog) return;

  const done = resolveDialog;
  resolveDialog = null;
  root.classList.add('hidden');
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('app-dialog-open');
  done(result);
}

function setIcon(variant) {
  const icon = document.getElementById('appDialogIcon');
  if (!icon) return;

  const icons = {
    error: '!',
    success: '✓',
    info: 'i',
  };
  icon.textContent = icons[variant] || icons.info;
  icon.className = `app-dialog-icon app-dialog-icon--${variant}`;
}

function openDialog({ title, message, mode, variant, confirmText, cancelText }) {
  ensureDialogDOM();
  const root = document.getElementById('appDialog');
  const titleEl = document.getElementById('appDialogTitle');
  const messageEl = document.getElementById('appDialogMessage');
  const cancelBtn = document.getElementById('appDialogCancel');
  const confirmBtn = document.getElementById('appDialogConfirm');

  root.dataset.mode = mode;
  titleEl.textContent = title;
  messageEl.textContent = message;
  messageEl.style.whiteSpace = 'pre-line';
  setIcon(variant);

  const isConfirm = mode === 'confirm';
  cancelBtn.classList.toggle('hidden', !isConfirm);
  cancelBtn.textContent = cancelText || 'Cancel';
  confirmBtn.textContent = isConfirm ? confirmText || 'Confirm' : confirmText || 'OK';

  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('app-dialog-open');
  confirmBtn.focus();
}

/**
 * @param {string} message
 * @param {{ title?: string, variant?: 'info'|'error'|'success', confirmText?: string }} [options]
 */
export function showAlert(message, options = {}) {
  const variant = options.variant || 'info';
  return new Promise((resolve) => {
    resolveDialog = () => resolve();
    openDialog({
      title:
        options.title ||
        (variant === 'error' ? 'Something went wrong' : variant === 'success' ? 'Success' : 'Notice'),
      message: String(message || ''),
      mode: 'alert',
      variant,
      confirmText: options.confirmText || 'OK',
    });
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, confirmText?: string, cancelText?: string, variant?: string }} [options]
 */
export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    resolveDialog = resolve;
    openDialog({
      title: options.title || 'Confirm',
      message: String(message || ''),
      mode: 'confirm',
      variant: options.variant || 'info',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
    });
  });
}

ensureDialogDOM();
