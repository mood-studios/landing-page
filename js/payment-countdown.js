/** Client countdown for unpaid booking payment window (15 minutes). */

export function bookingNeedsPaymentCountdown(booking) {
  const pay = booking?.paymentStatus || 'unpaid';
  const status = booking?.bookingStatus || 'pending';
  return pay !== 'paid' && status !== 'declined' && Boolean(booking?.paymentDeadlineAt);
}

export function formatCountdownMs(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {HTMLElement} el
 * @param {string} deadlineIso
 * @param {{ onExpired?: () => void, prefix?: string, compact?: boolean }} options
 * @returns {() => void} cleanup
 */
export function mountPaymentCountdown(el, deadlineIso, options = {}) {
  if (!el || !deadlineIso) return () => {};

  const deadline = new Date(deadlineIso).getTime();
  const prefix = options.prefix ?? (options.compact ? '⏱ ' : 'Complete payment within ');

  el.classList.remove('hidden', 'is-expired');
  if (options.compact) el.classList.add('payment-countdown--compact');

  const tick = () => {
    const left = deadline - Date.now();
    if (left <= 0) {
      el.textContent = options.compact ? 'Expired' : 'Payment time expired — this booking may be cancelled.';
      el.classList.add('is-expired');
      options.onExpired?.();
      return false;
    }
    el.textContent = `${prefix}${formatCountdownMs(left)}`;
    el.classList.remove('is-expired');
    return true;
  };

  if (!tick()) return () => {};

  const id = setInterval(() => {
    if (!tick()) clearInterval(id);
  }, 1000);

  return () => clearInterval(id);
}
