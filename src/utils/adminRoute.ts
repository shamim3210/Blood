/**
 * Dedicated URL & Portal Isolation Helper
 * Completely separates the Public User App (`/`) from the Standalone Admin Console (`/admin`).
 */

export const PORTAL_ROUTE_EVENT = 'bloodsearch_portal_route_changed';

export function isStandaloneAdminUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return true;
  }
  const hash = window.location.hash.toLowerCase();
  if (hash === '#admin' || hash === '#/admin') {
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal')?.toLowerCase() === 'admin') {
      return true;
    }
  } catch {}
  return false;
}

export function navigateToStandaloneAdmin(): void {
  if (typeof window === 'undefined') return;
  try {
    window.history.pushState({}, '', '/admin');
  } catch {
    window.location.hash = 'admin';
  }
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  window.dispatchEvent(new Event(PORTAL_ROUTE_EVENT));
}

export function navigateToPublicUserApp(): void {
  if (typeof window === 'undefined') return;
  try {
    window.history.pushState({}, '', '/');
  } catch {
    window.location.hash = '';
  }
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  window.dispatchEvent(new Event(PORTAL_ROUTE_EVENT));
}

export function getStandaloneAdminFullUrl(): string {
  if (typeof window === 'undefined') return '/admin';
  return `${window.location.origin}/admin`;
}
