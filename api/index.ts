import type { IncomingMessage, ServerResponse } from 'node:http';
import type { createEmergencyApiApp } from '../server';

process.env.BLOODSEARCH_SERVERLESS_MODE ||= 'true';
process.env.BLOODSEARCH_DISABLE_EMBEDDED_PG ||= 'true';

let cachedAppPromise: Promise<ReturnType<typeof createEmergencyApiApp>> | null = null;

function getApp(): Promise<ReturnType<typeof createEmergencyApiApp>> {
  if (!cachedAppPromise) {
    cachedAppPromise = import('../server')
      .then(({ createEmergencyApiApp }) => createEmergencyApiApp())
      .catch((error: unknown) => {
        cachedAppPromise = null;
        throw error;
      });
  }
  return cachedAppPromise;
}

const ALLOWED_HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function applyFallbackSecurityHeaders(res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendSafeJsonFallback(req: IncomingMessage, res: ServerResponse) {
  if (res.headersSent) return;
  const rawUrl = String(req.url || '/');
  const pathname = rawUrl.split('?')[0] || '/';

  res.statusCode = 503;
  applyFallbackSecurityHeaders(res);

  if (pathname.endsWith('/donors/search')) {
    res.end(
      JSON.stringify({
        ok: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'The API service is temporarily unavailable.',
        items: [],
        pagination: {
          page: 1,
          limit: 50,
          totalItems: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
        geoStrategy: 'NONE',
      })
    );
    return;
  }

  if (pathname.endsWith('/opted-in-contact') || pathname.endsWith('/contact')) {
    res.end(
      JSON.stringify({
        ok: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'The API service is temporarily unavailable.',
        found: false,
        contact: null,
      })
    );
    return;
  }

  if (pathname.endsWith('/app-version')) {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        version: '2.5.0',
        buildId: '2.5.0-serverless',
      })
    );
    return;
  }

  if (pathname.endsWith('/db/health')) {
    res.end(
      JSON.stringify({
        ok: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'The API service is temporarily unavailable.',
        status: 'UNAVAILABLE',
        configured: false,
        cutoverMode: 'NEON_PRIMARY',
      })
    );
    return;
  }

  res.statusCode = 503;
  res.end(
    JSON.stringify({
      ok: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'API service is temporarily unavailable.',
    })
  );
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!ALLOWED_HTTP_METHODS.has(method)) {
    res.statusCode = 405;
    applyFallbackSecurityHeaders(res);
    res.end(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED' }));
    return;
  }

  const rawUrl = String(req.url || '/');
  if (rawUrl.length > 2048 || rawUrl.includes('\u0000')) {
    res.statusCode = 414;
    applyFallbackSecurityHeaders(res);
    res.end(JSON.stringify({ ok: false, code: 'URI_TOO_LONG_OR_MALFORMED' }));
    return;
  }

  try {
    const app = await getApp();
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      res.once('finish', done);
      res.once('close', done);
      res.once('error', done);
      try {
        (app as unknown as (
          req: IncomingMessage,
          res: ServerResponse,
          next: (err?: unknown) => void
        ) => void)(req, res, (err) => {
          if (err && !res.headersSent) {
            sendSafeJsonFallback(req, res);
          }
          done();
        });
      } catch {
        sendSafeJsonFallback(req, res);
        done();
      }
    });
  } catch (error) {
    console.error(
      '[api] Server initialization or request failed:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    sendSafeJsonFallback(req, res);
  }
}
