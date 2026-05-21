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

/** Same loop pattern as the package ticker: one set of items, duplicated for seamless scroll. */
function renderGallery(photos) {
  const items = photos.map((src, i) => renderGalleryItem(src, i, { eager: true })).join('');
  if (photos.length <= 1) return items;
  return items + items;
}

function setGalleryContent(track, photos) {
  if (!track || !photos.length) return;
  track.innerHTML = renderGallery(photos);
  track.classList.toggle('featured-gallery-track--scroll', photos.length > 1);
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

function syncHeroPhoto(photos) {
  const heroMain = document.getElementById('hero-main-photo');
  if (!heroMain || !photos[0]) return;
  heroMain.src = photos[0];
  heroMain.alt = 'Mood Studios featured session';
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
  const track = document.getElementById('featuredGalleryTrack');
  if (!track) return;

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

  setGalleryContent(track, photos);
  await whenImagesReady(track);
  syncHeroPhoto(photos);

  const originals = photos.length;
  if (originals > 1 && window.anime) {
    const items = [...track.querySelectorAll('.featured-gallery-item')].slice(0, originals);
    anime({
      targets: items,
      opacity: [0, 1],
      duration: 500,
      delay: anime.stagger(60),
      easing: 'easeOutExpo',
    });
  }
}
