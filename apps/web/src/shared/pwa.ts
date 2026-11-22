/**
 * PR 357: installing the site on a phone's home screen. The service worker (`public/sw.js`) caches only a notice page;
 * this file registers it (production over HTTPS only) and keeps the browser's "install" offer until the hint can show it.
 */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const dismissedKey = 'lms.installHint.dismissed';
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function registerServiceWorker(env: { prod: boolean } = { prod: import.meta.env.PROD }) {
  if (!env.prod || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || window.location.protocol !== 'https:') return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

/** Android and desktop Chromium fire this once the site is installable; it can arrive before any screen is shown, so keep it here. */
export function listenForInstallOffer() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferred = event as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; rememberDismissed(); notify(); });
}

export const installOffer = () => deferred;
export function onInstallOfferChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

/** Safari on an iPhone or iPad has no install event: the person must use "Share, Add to Home Screen". */
export function isIosBrowser(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1);
}

export function wasDismissed(): boolean {
  try { return window.localStorage.getItem(dismissedKey) === '1'; } catch { return false; }
}
export function rememberDismissed() {
  try { window.localStorage.setItem(dismissedKey, '1'); } catch { /* the hint simply shows again next time */ }
}

export async function runInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const offer = deferred;
  if (!offer) return 'unavailable';
  deferred = null;
  notify();
  await offer.prompt();
  return (await offer.userChoice).outcome;
}
