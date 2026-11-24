import { getLocale, setLocale, translateDOM, t } from './shared/i18n.js';
const locale = document.getElementById('locale');
locale.value = getLocale();
translateDOM();
locale.addEventListener('change', () => { setLocale(locale.value); translateDOM(); });
let releases = {};
try { releases = await fetch('/releases.json').then(r => r.json()); } catch {}
document.querySelectorAll('[data-release]').forEach(button => button.addEventListener('click', () => {
  const link = releases[button.dataset.release];
  if (link && link.startsWith('https://')) window.open(link, '_blank', 'noopener,noreferrer');
  else { const toast = document.getElementById('toast'); toast.textContent = t('preparing'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 6000); }
}));
