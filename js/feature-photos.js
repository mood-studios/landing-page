import { publicApi } from './api.js';
import { DEFAULT_SERVICE_IMAGE } from './config.js';
import { getSamplePhotos } from './package-samples.js';

const FALLBACK_PHOTOS = ['/img/frontImage.jpg'];
const MAX_FEATURED = 12;
const MARQUEE_SPEED = 42;

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Collect unique photo URLs from all visible services. */
export function collectFeaturedPhotos(services) {
  const seen = new Set();
  const photos = [];

  for (const service of services || []) {
    for (const url of getSamplePhotos(service)) {
      if (!url || url === DEFAULT_SERVICE_IMAGE || seen.has(url)) continue;
      seen.add(url);
      photos.push(url);
      if (photos.length >= MAX_FEATURED) return photos;
    }
  }

  return photos;
}

function renderGalleryItem(src, index, { eager = false } = {}) {
  const loading = eager && index < 4 ? 'eager' : 'lazy';
  const fetchpriority = eager && index < 2 ? ' fetchpriority="high"' : '';
  return `
    <figure class="featured-gallery-item">
      <img src="${esc(src)}" alt="Mood Studios session ${index + 1}" loading="${loading}"${fetchpriority} />
    </figure>
  `;
}

function renderGallery(photos) {
  return photos.map((src, i) => renderGalleryItem(src, i, { eager: true })).join('');
}

function setGalleryContent(viewport, photos) {
  const track = viewport.querySelector('.featured-gallery-track');
  if (!track || !photos.length) return;
  track.innerHTML = renderGallery(photos);
  viewport.classList.remove('featured-gallery-viewport--marquee');
  track.style.removeProperty('--marquee-duration');
  viewport.classList.add('featured-gallery--ready');
}

function whenImagesReady(track) {
  const imgs = [...track.querySelectorAll('img')];
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
    )
  );
}

function initMarquee(viewport) {
  const track = viewport.querySelector('.featured-gallery-track');
  if (!track || track.children.length <= 1) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  requestAnimationFrame(() => {
    const overflows = track.scrollWidth > viewport.clientWidth + 8;
    if (!overflows) return;

    [...track.children].forEach((item) => {
      track.appendChild(item.cloneNode(true));
    });

    const halfWidth = track.scrollWidth / 2;
    const duration = Math.max(18, halfWidth / MARQUEE_SPEED);
    track.style.setProperty('--marquee-duration', `${duration}s`);
    viewport.classList.add('featured-gallery-viewport--marquee');
  });
}

function urlsFromFeaturedResponse(data) {
  return (data || [])
    .filter((item) => {
      if (typeof item === 'string') return true;
      return item?.isVisible !== false;
    })
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter((url) => typeof url === 'string' && url.trim());
}

export async function initFeaturedPhotos() {
  const viewport = document.getElementById('featuredGallery');
  const heroMain = document.getElementById('hero-main-photo');
  if (!viewport) return;

  let photos = [...FALLBACK_PHOTOS];

  try {
    const featuredRes = await publicApi.getFeaturedPhotos();
    const fromFeatured = urlsFromFeaturedResponse(featuredRes.data);
    if (fromFeatured.length) {
      photos = fromFeatured.slice(0, MAX_FEATURED);
    } else {
      const res = await publicApi.getAllServices();
      const fromServices = collectFeaturedPhotos(res.data || []);
      if (fromServices.length) photos = fromServices;
    }
  } catch {
    /* keep fallbacks */
  }

  setGalleryContent(viewport, photos);

  const track = viewport.querySelector('.featured-gallery-track');
  if (track) await whenImagesReady(track);
  initMarquee(viewport);

  if (heroMain && photos[0]) {
    heroMain.src = photos[0];
    heroMain.alt = 'Mood Studios featured session';
  }

  const items = track?.children || [];
  if (items.length > 1 && window.anime) {
    anime({
      targets: items,
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 500,
      delay: anime.stagger(60),
      easing: 'easeOutExpo',
    });
  }
}
