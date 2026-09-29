import { api } from './api';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

let regPromise = null;
export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) regPromise = navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => null);
  return regPromise;
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** 'unsupported' | 'denied' | 'default' | 'subscribed' | 'granted' (granted but this device not subscribed) */
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registerSW();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) return 'subscribed';
  return Notification.permission; // 'default' | 'granted'
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? 'On iPhone, first tap Share → “Add to Home Screen”, open the CRM from the home screen, then enable notifications.' : 'This browser does not support push notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were blocked. Allow them in your browser’s site settings and try again.');
  const reg = await registerSW();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api('/notifications/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
  const json = sub.toJSON();
  await api('/notifications/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
  return true;
}

export async function disablePush() {
  const reg = await registerSW();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await api('/notifications/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}

/** Re-send this device's subscription after login (keeps the server list fresh). */
export async function syncPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await registerSW();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    const json = sub.toJSON();
    await api('/notifications/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } }).catch(() => {});
  }
}
