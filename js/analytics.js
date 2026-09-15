/**
 * Analytics shim — disabled by default (provider: 'none'), sends nothing.
 *
 * To enable when deploying, fill in CONFIG (pick one) and update the
 * analytics section of legal/privacy.html accordingly:
 *  - GA4:          { provider: 'ga4',   ga4Id: 'G-XXXXXXXXXX' }
 *  - self-hosted umami: { provider: 'umami', umamiSrc: 'https://umami.example/script.js', umamiId: '<website-id>' }
 *
 * Event vocabulary:
 *  - embed / extract / text_encode / text_decode / text_strip  core actions
 *  - download    single download
 *  - lang_change language switch
 */

const CONFIG = {
  provider: 'none', // 'none' | 'ga4' | 'umami'
  ga4Id: '',
  umamiSrc: '',
  umamiId: '',
};

let ready = false;

function injectGa4(id) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
}

function injectUmami(src, websiteId) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  s.setAttribute('data-website-id', websiteId);
  document.head.appendChild(s);
}

export function initAnalytics() {
  try {
    if (CONFIG.provider === 'ga4' && CONFIG.ga4Id) {
      injectGa4(CONFIG.ga4Id);
      ready = true;
    } else if (CONFIG.provider === 'umami' && CONFIG.umamiSrc && CONFIG.umamiId) {
      injectUmami(CONFIG.umamiSrc, CONFIG.umamiId);
      ready = true;
    }
  } catch (_) { /* analytics must never break the app */ }
}

export function track(name, params = {}) {
  if (!ready) return; // 'none' sends zero data out
  try {
    if (CONFIG.provider === 'ga4' && typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    } else if (CONFIG.provider === 'umami' && window.umami && typeof window.umami.track === 'function') {
      window.umami.track(name, params);
    }
  } catch (_) { /* analytics must never break the app */ }
}
