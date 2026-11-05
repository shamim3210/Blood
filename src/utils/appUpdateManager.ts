import { registerSW } from 'virtual:pwa-register';

declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD_ID__: string | undefined;

export const CURRENT_APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '2.5.0';

export const CURRENT_APP_BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== 'undefined' && __APP_BUILD_ID__
    ? __APP_BUILD_ID__
    : `${CURRENT_APP_VERSION}-dev`;

export interface DetectedBuildUpdate {
  available: boolean;
  latestVersion: string;
  latestBuildId: string;
  source: 'SERVICE_WORKER' | 'VERSION_MANIFEST';
}

let swUpdaterFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistrationRef: ServiceWorkerRegistration | null = null;
let detectedUpdateState: DetectedBuildUpdate | null = null;
let apiAppVersionUnavailable = false;

const UPDATE_EVENT_NAME = 'bloodsearch_build_update_detected';

export function compareSemver(a: string, b: string): number {
  const cleanA = String(a || '0.0.0')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const cleanB = String(b || '0.0.0')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i += 1) {
    const diff = (cleanA[i] || 0) - (cleanB[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function notifyBuildUpdateListeners(next: DetectedBuildUpdate): void {
  detectedUpdateState = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: next }));
  }
}

export function getDetectedBuildUpdate(): DetectedBuildUpdate | null {
  return detectedUpdateState;
}

export function subscribeDetectedBuildUpdate(
  listener: (update: DetectedBuildUpdate | null) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(detectedUpdateState);
  window.addEventListener(UPDATE_EVENT_NAME, handler);
  if (detectedUpdateState) {
    listener(detectedUpdateState);
  }
  return () => {
    window.removeEventListener(UPDATE_EVENT_NAME, handler);
  };
}

/**
 * Checks `/version.json` and `/api/app-version` with cache-busting headers.
 * Works across Cloud Run, Vercel, PWA home-screen apps, and Capacitor Android APKs.
 */
export async function checkForDeployedBuildUpdateNow(): Promise<{
  updateAvailable: boolean;
  latestVersion: string;
  latestBuildId: string;
}> {
  if (typeof window === 'undefined') {
    return {
      updateAvailable: false,
      latestVersion: CURRENT_APP_VERSION,
      latestBuildId: CURRENT_APP_BUILD_ID,
    };
  }

  // Trigger SW update check in parallel if registered
  if (swRegistrationRef) {
    swRegistrationRef.update().catch(() => {});
  }

  const endpoints = apiAppVersionUnavailable
    ? [`/version.json?t=${Date.now()}`]
    : [`/version.json?t=${Date.now()}`, `/api/app-version?t=${Date.now()}`];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Pragma: 'no-cache',
          'Cache-Control': 'no-cache',
        },
      });
      if (!resp.ok) {
        if (resp.status === 404 && url.startsWith('/api/app-version')) {
          apiAppVersionUnavailable = true;
        }
        continue;
      }
      const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('json')) {
        if (url.startsWith('/api/app-version')) {
          apiAppVersionUnavailable = true;
        }
        continue;
      }
      const data = (await resp.json()) as { version?: string; buildId?: string };
      const remoteVersion = String(data.version || CURRENT_APP_VERSION).trim();
      const remoteBuildId = String(data.buildId || '').trim();

      const versionIsNewer = compareSemver(remoteVersion, CURRENT_APP_VERSION) > 0;
      const buildChangedInProd =
        !import.meta.env.DEV &&
        Boolean(remoteBuildId) &&
        !remoteBuildId.endsWith('-live') &&
        remoteBuildId !== CURRENT_APP_BUILD_ID;

      if (versionIsNewer || buildChangedInProd) {
        const next: DetectedBuildUpdate = {
          available: true,
          latestVersion: remoteVersion,
          latestBuildId: remoteBuildId || remoteVersion,
          source: 'VERSION_MANIFEST',
        };
        notifyBuildUpdateListeners(next);
        return {
          updateAvailable: true,
          latestVersion: remoteVersion,
          latestBuildId: next.latestBuildId,
        };
      }

      return {
        updateAvailable: Boolean(detectedUpdateState?.available),
        latestVersion: remoteVersion,
        latestBuildId: remoteBuildId || CURRENT_APP_BUILD_ID,
      };
    } catch {
      // Try next endpoint gracefully
    }
  }

  return {
    updateAvailable: Boolean(detectedUpdateState?.available),
    latestVersion: detectedUpdateState?.latestVersion || CURRENT_APP_VERSION,
    latestBuildId: detectedUpdateState?.latestBuildId || CURRENT_APP_BUILD_ID,
  };
}

/**
 * Activates any waiting Service Worker, clears stale asset caches, and reloads into the newest build.
 */
export async function applySeamlessAppUpdateAndReload(acknowledgeVersion?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (acknowledgeVersion) {
      localStorage.setItem('bloodsearch_ack_remote_version', acknowledgeVersion);
    }
  } catch {}

  try {
    if (swUpdaterFn) {
      await swUpdaterFn(true);
    }
  } catch {}

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.includes('workbox') || k.includes('precache'))
          .map((k) => caches.delete(k))
      );
    }
  } catch {}

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_updated', String(Date.now()));
  window.location.replace(nextUrl.toString());
}

/**
 * Initializes PWA Service Worker lifecycle + automatic visibility/interval deployment polling.
 */
export function initAppUpdateManager(): void {
  if (typeof window === 'undefined') return;

  // Clean up temporary `_updated` query param from URL bar after a fresh update reload
  try {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('_updated')) {
      currentUrl.searchParams.delete('_updated');
      window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
    }
  } catch {}

  // Self-heal once if a newly deployed Vercel/Cloud Run build invalidated an older cached chunk/CSS
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const guardKey = 'bsbd_chunk_reload_guard';
      const lastTs = Number(sessionStorage.getItem(guardKey) || '0');
      if (Date.now() - lastTs > 15_000) {
        sessionStorage.setItem(guardKey, String(Date.now()));
        void applySeamlessAppUpdateAndReload();
      }
    } catch {}
  });

  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
  } else {
    swUpdaterFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        notifyBuildUpdateListeners({
          available: true,
          latestVersion: CURRENT_APP_VERSION,
          latestBuildId: `${CURRENT_APP_VERSION}-sw`,
          source: 'SERVICE_WORKER',
        });
        if (swUpdaterFn) {
          swUpdaterFn(true).catch(() => {});
        }
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          swRegistrationRef = registration;
          window.setInterval(() => {
            registration.update().catch(() => {});
          }, 60_000);
        }
      },
    });
  }

  // Check for newly deployed builds whenever the user brings the app/APK to foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void checkForDeployedBuildUpdateNow();
    }
  });

  // Periodic lightweight check every 90 seconds in production
  if (!import.meta.env.DEV) {
    window.setTimeout(() => {
      void checkForDeployedBuildUpdateNow();
    }, 8_000);
    window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkForDeployedBuildUpdateNow();
      }
    }, 90_000);
  }
}
