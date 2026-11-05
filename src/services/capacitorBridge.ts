import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

export function isNativeCapacitorApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatformName(): 'WEB_PWA' | 'ANDROID_APK' | 'IOS_WEB' {
  try {
    if (!isNativeCapacitorApp()) return 'WEB_PWA';
    const platform = Capacitor.getPlatform();
    if (platform === 'android') return 'ANDROID_APK';
    if (platform === 'ios') return 'IOS_WEB';
    return 'WEB_PWA';
  } catch {
    return 'WEB_PWA';
  }
}

export function getApiBaseUrl(): string {
  const configured = String((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (isNativeCapacitorApp() && configured) {
    return configured;
  }

  if (configured && /^https?:\/\//i.test(configured) && typeof window !== 'undefined') {
    const isLocalCapacitorOrigin =
      window.location.protocol === 'capacitor:' ||
      (window.location.hostname === 'localhost' && !window.location.port);
    if (isLocalCapacitorOrigin) {
      return configured;
    }
  }

  return '';
}

export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function resolveWebSocketUrl(path = '/ws'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (base) {
    const wsBase = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsBase}${normalizedPath}`;
  }
  if (typeof window === 'undefined') {
    return `ws://localhost:3000${normalizedPath}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${normalizedPath}`;
}

export function registerAndroidHardwareBackButton(onBackIntercept: () => boolean): () => void {
  if (!isNativeCapacitorApp()) {
    return () => {};
  }

  let removeHandle: (() => void) | null = null;
  let disposed = false;

  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    const handledByUi = onBackIntercept();
    if (handledByUi) return;
    if (canGoBack && typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    CapacitorApp.minimizeApp().catch(() => {});
  })
    .then((handle) => {
      if (disposed) {
        handle.remove().catch(() => {});
      } else {
        removeHandle = () => {
          handle.remove().catch(() => {});
        };
      }
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (removeHandle) {
      removeHandle();
    }
  };
}

export function openSafeExternalActionUrl(rawUrl: string): boolean {
  if (typeof window === 'undefined' || !rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (/^(tel|sms|smsto|mailto):/i.test(trimmed)) {
    window.location.href = trimmed;
    return true;
  }
  if (/^https:\/\//i.test(trimmed)) {
    const anchor = document.createElement('a');
    anchor.href = trimmed;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  }
  return false;
}
