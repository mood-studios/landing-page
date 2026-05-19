export const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

let loadPromise = null;
let widgetId = null;

function loadRecaptchaScript() {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(null);
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    window.__moodRecaptchaOnLoad = () => resolve(window.grecaptcha);
    const script = document.createElement('script');
    script.src =
      'https://www.google.com/recaptcha/api.js?onload=__moodRecaptchaOnLoad&render=explicit';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isRecaptchaEnabled() {
  return Boolean(RECAPTCHA_SITE_KEY);
}

export async function mountRegisterRecaptcha(containerId = 'registerRecaptcha') {
  const container = document.getElementById(containerId);
  if (!container) return null;

  if (!RECAPTCHA_SITE_KEY) {
    container.closest('.auth-recaptcha-wrap')?.classList.add('hidden');
    return null;
  }

  container.closest('.auth-recaptcha-wrap')?.classList.remove('hidden');
  container.innerHTML = '';

  const grecaptcha = await loadRecaptchaScript();
  if (!grecaptcha) return null;

  widgetId = grecaptcha.render(container, {
    sitekey: RECAPTCHA_SITE_KEY,
    theme: 'light',
  });

  return widgetId;
}

export function getRegisterRecaptchaToken() {
  if (!RECAPTCHA_SITE_KEY || widgetId == null || !window.grecaptcha) {
    return '';
  }
  return window.grecaptcha.getResponse(widgetId) || '';
}

export function resetRegisterRecaptcha() {
  if (widgetId != null && window.grecaptcha) {
    window.grecaptcha.reset(widgetId);
  }
}
