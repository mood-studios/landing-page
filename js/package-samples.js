import { DEFAULT_SERVICE_IMAGE } from './config.js';

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Photo samples for a package (samplePhotos, else service image, else mood logo). */
export function getSamplePhotos(service) {
  const samples = (service?.samplePhotos || []).filter(Boolean);
  if (samples.length) return samples;
  if (service?.image) return [service.image];
  return [DEFAULT_SERVICE_IMAGE];
}

export function renderPackageMedia(service, options = {}) {
  const alt = esc(options.alt || service?.name || 'Package');
  const photos = getSamplePhotos(service);

  if (photos.length === 1) {
    const isDefault = photos[0] === DEFAULT_SERVICE_IMAGE;
    return `
      <div class="package-media package-media--single${isDefault ? ' package-media--default' : ''}">
        <img src="${esc(photos[0])}" alt="${alt}" loading="lazy" />
      </div>
    `;
  }

  if (photos.length === 2) {
    return `
      <div class="package-media package-media--duo">
        ${photos
          .map(
            (src) =>
              `<img src="${esc(src)}" alt="${alt}" loading="lazy" />`
          )
          .join('')}
      </div>
    `;
  }

  const slides = photos
    .map(
      (src, i) =>
        `<div class="package-carousel-slide"><img src="${esc(src)}" alt="${alt} — photo ${i + 1}" loading="lazy" /></div>`
    )
    .join('');

  const dots = photos
    .map((_, i) => `<button type="button" class="package-carousel-dot${i === 0 ? ' active' : ''}" aria-label="Photo ${i + 1}" data-index="${i}"></button>`)
    .join('');

  return `
    <div class="package-media package-media--carousel" data-package-carousel>
      <div class="package-carousel-viewport">
        <div class="package-carousel-track">${slides}</div>
      </div>
      <button type="button" class="package-carousel-btn package-carousel-prev" aria-label="Previous photo">‹</button>
      <button type="button" class="package-carousel-btn package-carousel-next" aria-label="Next photo">›</button>
      <div class="package-carousel-dots">${dots}</div>
    </div>
  `;
}

export function initPackageCarousels(root = document) {
  root.querySelectorAll('[data-package-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.package-carousel-track');
    const slides = carousel.querySelectorAll('.package-carousel-slide');
    const dots = carousel.querySelectorAll('.package-carousel-dot');
    if (!track || slides.length < 3) return;

    let index = 0;

    const goTo = (next) => {
      index = (next + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    };

    carousel.querySelector('.package-carousel-prev')?.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(index - 1);
    });
    carousel.querySelector('.package-carousel-next')?.addEventListener('click', (e) => {
      e.stopPropagation();
      goTo(index + 1);
    });

    dots.forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo(Number(dot.dataset.index));
      });
    });

    let touchStartX = 0;
    carousel.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    carousel.addEventListener(
      'touchend',
      (e) => {
        const delta = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(delta) < 40) return;
        goTo(delta < 0 ? index + 1 : index - 1);
      },
      { passive: true }
    );
  });
}
