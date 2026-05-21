/**
 * Discourages casual view-source / devtools shortcuts (not real security).
 * Determined users can still access assets via Network tab or saved files.
 */
export function initSourceGuard() {
  const blockCombo = (e) => {
    const key = e.key?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (key === 'f12') {
      e.preventDefault();
      return;
    }
    if (ctrl && shift && (key === 'i' || key === 'j' || key === 'c')) {
      e.preventDefault();
      return;
    }
    if (ctrl && key === 'u') {
      e.preventDefault();
      return;
    }
  };

  document.addEventListener('keydown', blockCombo);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
