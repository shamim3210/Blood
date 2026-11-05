import {
  auth,
  isBootstrappedAdminUser,
  onAuthStateChanged,
} from '../services/bloodSearchService';

export interface SecurityDiagnostics {
  origin: string;
  hostname: string;
  isHttpsOrLocal: boolean;
  isStandaloneApp: boolean;
  isInIframe: boolean;
  isTrustedEnvironment: boolean;
  runtimeShieldActive: boolean;
  ownerEmail: string;
  firebaseProjectId: string;
}

let initialized = false;
let verifiedCloudAdminUid: string | null = null;

/**
 * Marks a Firebase UID as verified Cloud/Server Admin for local cache consistency.
 * Even if tampered in memory, all backend PostgreSQL & Firestore operations remain enforced server-side.
 */
export function markRuntimeVerifiedAdminUid(uid: string | null): void {
  verifiedCloudAdminUid = uid;
}

function scrubForgedLocalRoleEscalation(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('bloodsearch_admin_auth');
    localStorage.removeItem('bloodsearch_admin_auth');

    // Scrub any legacy stored owner email in whitelabel config cache
    const wlRaw = localStorage.getItem('bloodsearch_whitelabel_config');
    if (wlRaw && wlRaw.includes('@gmail.com')) {
      try {
        const wlParsed = JSON.parse(wlRaw);
        if (wlParsed && typeof wlParsed === 'object' && typeof wlParsed.superAdminEmail === 'string') {
          wlParsed.superAdminEmail = 'Authorized Super Owner';
          localStorage.setItem('bloodsearch_whitelabel_config', JSON.stringify(wlParsed));
        }
      } catch {
        localStorage.removeItem('bloodsearch_whitelabel_config');
      }
    }

    const raw = localStorage.getItem('bloodsearch_current_user');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const hasAdminClaim = parsed.role === 'ADMIN' || parsed.panelType === 'ADMIN';
    if (!hasAdminClaim) return;

    const currentUser = auth.currentUser;
    const isLegitAdminSession =
      Boolean(currentUser) &&
      (isBootstrappedAdminUser(currentUser) ||
        (verifiedCloudAdminUid !== null && currentUser?.uid === verifiedCloudAdminUid));

    if (!isLegitAdminSession) {
      const sanitized = {
        ...parsed,
        role: 'USER',
        panelType: 'USER',
      };
      localStorage.setItem('bloodsearch_current_user', JSON.stringify(sanitized));
    }
  } catch {
    try {
      localStorage.removeItem('bloodsearch_current_user');
    } catch {}
  }
}

export function initRuntimeSecurityShield(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // 1. Anti-Self-XSS Browser Console Warning (Zero owner email or internal project ID disclosure!)
  try {
    console.log(
      '%c🛑 থামুন! STOP — BloodSearch Security Shield',
      'color:#e11d48;font-size:22px;font-weight:900;'
    );
    console.log(
      '%cকেউ যদি আপনাকে এখানে কোনো কোড কপি-পেস্ট করতে বলে (যেমন "ফ্রি ভেরিফিকেশন" বা "অ্যাডমিন আনলক"), তবে তা ১০০% প্রতারণা (Self-XSS Scam)। এখানে কখনোই অপরিচিত কোড পেস্ট করবেন না।',
      'color:#f59e0b;font-size:13px;font-weight:700;'
    );
  } catch {}

  // 2. Purge insecure client-only admin flags & watch localStorage against DevTools / APK WebView role spoofing
  scrubForgedLocalRoleEscalation();
  window.addEventListener('storage', () => {
    scrubForgedLocalRoleEscalation();
  });
  window.addEventListener('bloodsearch_user_changed', () => {
    scrubForgedLocalRoleEscalation();
  });
  window.addEventListener('focus', () => {
    scrubForgedLocalRoleEscalation();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scrubForgedLocalRoleEscalation();
    }
  });
  try {
    onAuthStateChanged(auth, (u) => {
      if (!u) {
        verifiedCloudAdminUid = null;
      }
      scrubForgedLocalRoleEscalation();
    });
  } catch {}

  // 2B. Untrusted Cross-Origin Clickjacking Detection (allows same-origin & AI Studio preview hosts)
  try {
    if (window.self !== window.top) {
      const ref = (document.referrer || '').trim();
      if (ref) {
        const refHost = new URL(ref).hostname.toLowerCase();
        const selfHost = window.location.hostname.toLowerCase();
        const isTrustedEmbedHost =
          refHost === selfHost ||
          refHost === 'localhost' ||
          refHost === '127.0.0.1' ||
          refHost === 'aistudio.google.com' ||
          refHost.endsWith('.google.com') ||
          refHost.endsWith('.googleusercontent.com') ||
          refHost.endsWith('.run.app');
        if (!isTrustedEmbedHost) {
          document.documentElement.setAttribute('data-untrusted-frame', '1');
          document.body.innerHTML =
            '<div style="padding:32px;font-family:system-ui,sans-serif;text-align:center;background:#0f172a;color:#fff;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;">' +
            '<h1 style="font-size:20px;font-weight:800;color:#fb7185;margin-bottom:12px;">Security Alert: Untrusted Embedded Frame Blocked</h1>' +
            '<p style="font-size:14px;max-width:440px;line-height:1.6;color:#cbd5e1;">BloodSearch cannot be embedded inside unauthorized external websites to protect your account and donor privacy. Please open BloodSearch directly in your browser.</p>' +
            '</div>';
          return;
        }
      }
    }
  } catch {}

  // 3. APK WebView & Browser Reverse-Tabnabbing + Dangerous URI Scheme Firewall
  const guardAnchorClicks = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;

    const rawHref = (anchor.getAttribute('href') || '').trim();
    if (/^(javascript|vbscript|file|blob|data\s*:\s*(text\/html|application\/xhtml|image\/svg))\s*:/i.test(rawHref)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (anchor.target === '_blank') {
      const existingRel = (anchor.getAttribute('rel') || '').toLowerCase();
      if (!existingRel.includes('noopener') || !existingRel.includes('noreferrer')) {
        anchor.setAttribute('rel', 'noopener noreferrer');
      }
    }
  };
  document.addEventListener('click', guardAnchorClicks, true);
  document.addEventListener('auxclick', guardAnchorClicks, true);

  // 3B. Form Action Hijacking Guard (blocks javascript: / cross-origin form submission injection)
  document.addEventListener(
    'submit',
    (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;
      const action = (form.getAttribute('action') || '').trim();
      if (action && /^(javascript|vbscript|data)\s*:/i.test(action)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // 4. Block untrusted Drag-and-Drop HTML/URI injection into APK WebViews & Browser Windows
  const blockUntrustedDrop = (e: DragEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') {
      return;
    }
    if (e.dataTransfer) {
      const uri =
        e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
      if (/^(javascript|vbscript|data)\s*:/i.test(uri.trim()) || e.type === 'drop') {
        e.preventDefault();
      } else if (e.type === 'dragover') {
        e.preventDefault();
      }
    }
  };
  window.addEventListener('dragover', blockUntrustedDrop, false);
  window.addEventListener('drop', blockUntrustedDrop, false);
}

export function getSecurityDiagnostics(): SecurityDiagnostics {
  if (typeof window === 'undefined') {
    return {
      origin: '',
      hostname: '',
      isHttpsOrLocal: true,
      isStandaloneApp: false,
      isInIframe: false,
      isTrustedEnvironment: true,
      runtimeShieldActive: true,
      ownerEmail: 'Protected (Server-Verified)',
      firebaseProjectId: 'Protected',
    };
  }

  const origin = window.location.origin;
  const hostname = window.location.hostname;
  const isHttpsOrLocal =
    window.location.protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';

  const isStandaloneApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((window.navigator as any).standalone) ||
    document.referrer.startsWith('android-app://');

  let isInIframe = false;
  try {
    isInIframe = window.self !== window.top;
  } catch {
    isInIframe = true;
  }

  const isTrustedHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com') ||
    isHttpsOrLocal;

  return {
    origin,
    hostname,
    isHttpsOrLocal,
    isStandaloneApp,
    isStandaloneApp_unused: undefined,
    isInIframe,
    isTrustedEnvironment: isTrustedHost && isHttpsOrLocal,
    runtimeShieldActive: initialized,
    ownerEmail: 'Protected (Server-Verified)',
    firebaseProjectId: 'Protected',
  } as SecurityDiagnostics;
}
