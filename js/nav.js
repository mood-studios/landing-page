import { getUser } from './auth.js';

export function initNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  }
  window.toggleMenu = () => mobileMenu?.classList.toggle('open');

  const user = getUser();
  const loginBtn = document.getElementById('nav-login-btn');
  const accountBtn = document.getElementById('nav-account-btn');

  if (user && loginBtn && accountBtn) {
    loginBtn.classList.add('hidden');
    accountBtn.classList.remove('hidden');
    const label = accountBtn.querySelector('[data-user-name]');
    if (label) label.textContent = user.name?.split(' ')[0] || 'Account';
  }
}
