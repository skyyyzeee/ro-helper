/**
 * What gives the app away as a web page in a window, taken out (skyze: «остаются стандартные браузерные темы»):
 * the browser's own menu on a right click, the browser's keys — reload, print, find, back — that would reset the
 * overlay if pressed by chance, and the system's yellowish tooltips, replaced by the app's own in its look.
 * Installed once per window, in the app only: the browser preview keeps its reload.
 */

/** Keys the browser would act on: reload, print, save, find, view source, history, caret browsing, back and forward. */
const BROWSER_KEYS: ((e: KeyboardEvent) => boolean)[] = [
  (e) => e.key === 'F5' || e.key === 'F3' || e.key === 'F7',
  (e) => (e.ctrlKey || e.metaKey) && ['KeyR', 'KeyP', 'KeyS', 'KeyU', 'KeyG', 'KeyJ', 'KeyH', 'KeyF'].includes(e.code),
  (e) => (e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code),
  (e) => e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'),
  (e) => e.key === 'BrowserBack' || e.key === 'BrowserForward' || e.key === 'BrowserRefresh',
];

export const isBrowserKey = (e: KeyboardEvent) => BROWSER_KEYS.some((test) => test(e));

/** Where the browser's menu is still of use: a field to cut, copy and paste in, or text the player selected. */
function menuIsUseful(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (element?.closest('input, textarea, [contenteditable="true"]')) return true;
  return !!document.getSelection()?.toString();
}

/** How long the pointer rests on something before its tooltip shows, in milliseconds. */
const TIP_DELAY = 450;

/**
 * The app's own tooltips in place of the system's: a `title` is taken off while the pointer is on its element (so the
 * system draws none) and given back when it leaves, so what reads the page — tests, screen readers — still finds it.
 */
function installTooltips(doc: Document): () => void {
  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  doc.body.appendChild(tip);
  let owner: HTMLElement | null = null;
  let timer: number | undefined;

  const hide = () => {
    window.clearTimeout(timer);
    tip.hidden = true;
    tip.classList.remove('tip--on');
    if (owner?.dataset.tip !== undefined) {
      owner.setAttribute('title', owner.dataset.tip);
      delete owner.dataset.tip;
    }
    owner = null;
  };
  const place = (element: HTMLElement) => {
    const box = element.getBoundingClientRect();
    const own = tip.getBoundingClientRect();
    const below = box.bottom + 8 + own.height <= window.innerHeight;
    const top = below ? box.bottom + 8 : box.top - 8 - own.height;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - own.width / 2), window.innerWidth - own.width - 8);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(8, top))}px)`;
  };
  const over = (e: PointerEvent) => {
    const element = (e.target as Element | null)?.closest<HTMLElement>('[title]');
    if (!element || element === owner) return;
    hide();
    const text = element.getAttribute('title') ?? '';
    if (!text.trim()) return;
    owner = element;
    element.dataset.tip = text;
    element.removeAttribute('title');
    timer = window.setTimeout(() => {
      tip.textContent = text;
      tip.hidden = false;
      place(element);
      tip.classList.add('tip--on');
    }, TIP_DELAY);
  };
  const out = (e: PointerEvent) => {
    if (owner && !owner.contains(e.relatedTarget as Node | null)) hide();
  };
  doc.addEventListener('pointerover', over);
  doc.addEventListener('pointerout', out);
  doc.addEventListener('pointerdown', hide, true);
  doc.addEventListener('keydown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
  return () => {
    hide();
    tip.remove();
    doc.removeEventListener('pointerover', over);
    doc.removeEventListener('pointerout', out);
    doc.removeEventListener('pointerdown', hide, true);
    doc.removeEventListener('keydown', hide, true);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('blur', hide);
  };
}

export function installNativeFeel(doc: Document = document): () => void {
  const menu = (e: MouseEvent) => {
    if (!menuIsUseful(e.target)) e.preventDefault();
  };
  const keys = (e: KeyboardEvent) => {
    if (isBrowserKey(e)) e.preventDefault();
  };
  // Ctrl and the wheel would zoom the page, as in a browser.
  const zoom = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  doc.addEventListener('contextmenu', menu);
  doc.addEventListener('keydown', keys);
  doc.addEventListener('wheel', zoom, { passive: false });
  const stopTips = installTooltips(doc);
  return () => {
    doc.removeEventListener('contextmenu', menu);
    doc.removeEventListener('keydown', keys);
    doc.removeEventListener('wheel', zoom);
    stopTips();
  };
}
