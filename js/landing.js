import { initHomePackages } from './home-packages.js';
import { initFeaturedPhotos } from './feature-photos.js';
import { DASHBOARD_PATH } from './config.js';
import { initAuthModal, initAuthSession, openAuthModal } from './auth-modal.js';

const SECTIONS = ['home', 'packages', 'how-it-works', 'contact'];

function initNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  const closeMobile = () => mobileMenu?.classList.remove('open');

  hamburger?.addEventListener('click', () => {
    mobileMenu?.classList.toggle('open');
  });

  document.querySelectorAll('.mobile-menu a[href^="#"]').forEach((link) => {
    link.addEventListener('click', closeMobile);
  });

  document.querySelectorAll('a[data-section]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.dataset.section;
      if (!id || !SECTIONS.includes(id)) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
      setActiveNav(id);
    });
  });

  window.addEventListener('scroll', updateActiveNavOnScroll, { passive: true });
  updateActiveNavOnScroll();

  if (location.hash && SECTIONS.includes(location.hash.slice(1))) {
    setTimeout(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      setActiveNav(location.hash.slice(1));
    }, 100);
  } else {
    setActiveNav('home');
  }
}

function setActiveNav(sectionId) {
  document.querySelectorAll('[data-section]').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });
}

function updateActiveNavOnScroll() {
  const offset = 120;
  let current = 'home';

  for (const id of SECTIONS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= offset) current = id;
  }

  setActiveNav(current);
}

function initHeroAnimations() {
  if (!window.anime) return;

  anime({ targets: '#nav', translateY: ['-100%', '0%'], duration: 700, delay: 100, easing: 'easeOutExpo' });
  anime({ targets: '#hero-badge', opacity: [0, 1], translateY: [18, 0], duration: 700, delay: 250, easing: 'easeOutExpo' });
  anime({ targets: '#hero-h1', opacity: [0, 1], translateY: [30, 0], duration: 800, delay: 400, easing: 'easeOutExpo' });
  anime({ targets: '#hero-sub', opacity: [0, 1], translateY: [20, 0], duration: 700, delay: 550, easing: 'easeOutExpo' });
  anime({ targets: '#hero-ctas', opacity: [0, 1], translateY: [20, 0], duration: 700, delay: 680, easing: 'easeOutExpo' });
  anime({ targets: '#hero-visual', opacity: [0, 1], translateX: [50, 0], duration: 900, delay: 450, easing: 'easeOutExpo' });
  const featured = document.getElementById('featured-photos');
  if (featured) featured.style.opacity = '0';
  anime({ targets: '#featured-photos', opacity: [0, 1], translateY: [24, 0], duration: 700, delay: 720, easing: 'easeOutExpo' });

  anime({ targets: '.blob-1', translateX: [0, 35, -20, 0], translateY: [0, -25, 20, 0], duration: 10000, loop: true, easing: 'easeInOutSine' });
  anime({ targets: '.blob-2', translateX: [0, -30, 18, 0], translateY: [0, 22, -16, 0], duration: 12000, loop: true, easing: 'easeInOutSine' });
  anime({ targets: '.blob-3', scale: [1, 1.18, 0.92, 1], duration: 8000, loop: true, easing: 'easeInOutSine' });
  anime({ targets: '.pill-star', translateY: [0, -9, 0], duration: 3400, loop: true, easing: 'easeInOutSine', delay: 400 });
  anime({ targets: '.pill-check', translateY: [0, 9, 0], duration: 3000, loop: true, easing: 'easeInOutSine' });
}

function initScrollReveal() {
  function onScroll() {
    if (!window.anime) return;
    document.querySelectorAll('.reveal:not(.done)').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight - 60) {
        el.classList.add('done');
        anime({
          targets: el,
          opacity: [0, 1],
          translateY: [36, 0],
          duration: 650,
          delay: (i % 4) * 90,
          easing: 'easeOutExpo',
        });
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 300);
}

async function bootstrap() {
  initNav();
  initAuthModal();
  initHeroAnimations();
  initScrollReveal();
  initFeaturedPhotos();
  initHomePackages();
  await initAuthSession();

  const authParams = new URLSearchParams(window.location.search);
  if (authParams.get('auth') === 'login') {
    const next = authParams.get('next');
    openAuthModal({
      panel: 'login',
      onSuccess: () => {
        window.location.href = next ? decodeURIComponent(next) : DASHBOARD_PATH;
      },
    });
  }
}

bootstrap();
