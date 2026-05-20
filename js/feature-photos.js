import { publicApi } from './api.js';
import { DEFAULT_SERVICE_IMAGE } from './config.js';
import { getSamplePhotos } from './package-samples.js';

const FALLBACK_PHOTOS = ['/img/frontImage.jpg'];
const MAX_FEATURED = 12;

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

function setGalleryContent(gallery, photos) {
  if (!gallery || !photos.length) return;
  gallery.innerHTML = renderGallery(photos);
  gallery.classList.add('featured-gallery--ready');
}

function urlsFromFeaturedResponse(data) {
  return (data || [])
    .map((item) => (typeof item === 'string' ? item : item?.url))
    .filter((url) => typeof url === 'string' && url.trim());
}

export async function initFeaturedPhotos() {
  const gallery = document.getElementById('featuredGallery');
  const heroMain = document.getElementById('hero-main-photo');
  if (!gallery) return;

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

  setGalleryContent(gallery, photos);

  if (heroMain && photos[0]) {
    heroMain.src = photos[0];
    heroMain.alt = 'Mood Studios featured session';
  }

  if (photos.length > 1 && window.anime) {
    const items = gallery.querySelectorAll('.featured-gallery-item');
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
