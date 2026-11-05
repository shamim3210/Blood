# BloodSearch v2.5.0 — Bangladesh Direct Blood Donor & Emergency SOS Network

Production-hardened emergency blood donor search, multi-donor SOS dispatch, hospital & blood bank inventory, and real-time transfusion coordination platform for all 64 districts of Bangladesh.

## Core Stack

- **Database**: Neon Serverless PostgreSQL + Drizzle ORM (28 relational tables, zero Firebase/Firestore dependencies)
- **Authentication**: Google Identity Services / OIDC (`RS256` JWKS + single-use nonce) + Scrypt Email/Password + Bangladesh Mobile OTP + SHA-256 Opaque Sessions (`HttpOnly` Cookie + `X-CSRF-Token` + Native APK `Bearer`)
- **Backend**: Express.js Zero-Trust API (`server.ts`, `/api/v1/*`) with PostgreSQL distributed rate limiting, strict CORS, WAF scanner blocking, and immutable `audit_logs`
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + OpenStreetMap Leaflet + Workbox PWA
- **Android Mobile**: Capacitor 8 Native Android Project (`bd.bloodsearch.app`) producing `BloodSearch-debug.apk` & `BloodSearch-release-unsigned.apk`

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Apply Neon PostgreSQL schema (when DATABASE_URL / DIRECT_DATABASE_URL is set)
npm run db:migrate

# 4. Run development server (Port 3000)
npm run dev

# 5. Run automated security & integration test suite
npm test

# 6. Typecheck & build production bundle
npm run lint
npm run build
```

## Documentation Index

- [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) — Authentication, Neon PostgreSQL, privacy vault, API WAF, and APK security controls
- [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) — Neon provisioning, Google OAuth setup, Cloud Run / Vercel deployment, and backup/restore
- [`ANDROID_BUILD_GUIDE.md`](./ANDROID_BUILD_GUIDE.md) — Capacitor Android APK build, release keystore signing (`apksigner`), and Play Store AAB guide
- [`TESTING_REPORT.md`](./TESTING_REPORT.md) — Automated security, OIDC, session, donor privacy, and APK verification results
