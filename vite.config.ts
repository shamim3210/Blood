import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || '2.5.0';
  } catch {
    return '2.5.0';
  }
}

function bloodsearchVersionManifestPlugin(version: string, buildId: string): Plugin {
  const payload = JSON.stringify({
    version,
    buildId,
    builtAt: new Date().toISOString(),
  });

  const devManifestPayload = JSON.stringify({
    id: '/',
    name: 'BloodSearch - Bangladesh Emergency Blood Network',
    short_name: 'BloodSearch',
    description:
      'জরুরি রক্তদাতা সন্ধান, ৬৪ জেলা হাসপাতাল ডিরেক্টরি ও লাইভ ব্লাড ডোনেশন নেটওয়ার্ক বাংলাদেশ।',
    lang: 'bn',
    dir: 'ltr',
    theme_color: '#0b2239',
    background_color: '#ffffff',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });

  return {
    name: 'bloodsearch-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.end(payload);
      });
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(devManifestPayload);
      });
      server.middlewares.use('/favicon.ico', (_req, res) => {
        try {
          const iconBuf = fs.readFileSync(
            path.resolve(import.meta.dirname, 'public', 'favicon-64x64.png')
          );
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.end(iconBuf);
        } catch {
          res.statusCode = 204;
          res.end();
        }
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
      try {
        const iconBuf = fs.readFileSync(
          path.resolve(import.meta.dirname, 'public', 'favicon-64x64.png')
        );
        this.emitFile({
          type: 'asset',
          fileName: 'favicon.ico',
          source: iconBuf,
        });
      } catch {
        // Ignore if favicon PNG unavailable
      }
    },
  };
}

export default defineConfig(() => {
  // Hard security gate: prevent accidental exposure of Neon PostgreSQL credentials in React/APK bundles
  const forbiddenFrontendDbVars = Object.keys(process.env).filter((key) =>
    /^VITE_(DATABASE_URL|DIRECT_DATABASE_URL|NEON_|PGPASSWORD|POSTGRES_)/i.test(key) &&
    Boolean(process.env[key]?.trim())
  );
  if (forbiddenFrontendDbVars.length > 0) {
    throw new Error(
      `FATAL_BUILD_SECURITY_BLOCK: Database credentials (${forbiddenFrontendDbVars.join(', ')}) must NEVER be prefixed with VITE_. Store DATABASE_URL exclusively in backend server secrets.`
    );
  }

  const appVersion = readPackageVersion();
  const appBuildId = process.env.BUILD_ID || `${appVersion}-${Date.now()}`;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      bloodsearchVersionManifestPlugin(appVersion, appBuildId),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [],
        includeManifestIcons: false,
        devOptions: {
          enabled: false,
          type: 'module',
        },
        manifest: {
          id: '/',
          name: 'BloodSearch - Bangladesh Emergency Blood Network',
          short_name: 'BloodSearch',
          description:
            'জরুরি রক্তদাতা সন্ধান, ৬৪ জেলা হাসপাতাল ডিরেক্টরি ও লাইভ ব্লাড ডোনেশন নেটওয়ার্ক বাংলাদেশ।',
          lang: 'bn',
          dir: 'ltr',
          theme_color: '#0b2239',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          prefer_related_applications: false,
          launch_handler: {
            client_mode: 'navigate-existing',
          },
          categories: ['medical', 'health', 'utilities'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'জরুরি রক্তের আবেদন (SOS)',
              short_name: 'জরুরি SOS',
              description: '১-ক্লিকে মুমূর্ষু রোগীর জন্য জরুরি রক্তের আবেদন পাঠান',
              url: '/?action=sos',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'রক্তদাতা খুঁজুন (৬৪ জেলা)',
              short_name: 'ডোনার সার্চ',
              description: 'নিকটস্থ প্রস্তুত রক্তদাতা খুঁজুন',
              url: '/?action=search',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'লাইভ চ্যাট ও ইনবক্স',
              short_name: 'লাইভ চ্যাট',
              description: 'রক্তদাতাদের সাথে সরাসরি চ্যাট ও লোকেশন শেয়ার',
              url: '/?action=chat',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          cacheId: 'bloodsearch-pwa-v5',
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'pwa-*.png', 'favicon-*.png', 'apple-touch-icon.png'],
          dontCacheBustURLsMatching: /^assets\/.*-[a-zA-Z0-9_-]{8}\./,
          globIgnores: [
            '**/version.json',
            '**/.env*',
            '**/assetlinks.json',
            '**/drizzle/**',
            '**/backups/**',
            '**/downloads/**',
            '**/*.sql',
            '**/*.apk',
            '**/*.zip',
            '**/assets/aistudio/**',
            '**/assets/bloodsearch-*.png',
          ],
          cleanupOutdatedCaches: true,
          // Never intercept API routes, OAuth callback, downloads, live version manifest, PWA manifest, static assets, or Android TWA assetlinks
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/auth\//,
            /^\/downloads\//,
            /^\/version\.json/,
            /^\/manifest\.webmanifest/,
            /^\/favicon\.ico/,
            /^\/assets\//,
            /\.(?:js|css|json|webmanifest|png|svg|ico|woff2?)(?:\?.*)?$/i,
            /^\/__/,
            /^\/\.well-known\//,
          ],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 12,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/(?:[abc]\.)?tile\.openstreetmap\.(?:org|fr)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'bangladesh-map-tiles-cache-v2',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), usb=(), payment=(), serial=(), bluetooth=(), geolocation=(self), microphone=(self)',
      },
      // HMR is disabled in AI Studio container.
      hmr: false,
      watch: null,
    },
    build: {
      sourcemap: false,
      target: 'es2020',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/leaflet')) {
              return 'leaflet';
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/motion')) {
              return 'vendor-motion';
            }
          },
        },
      },
    },
  };
});

