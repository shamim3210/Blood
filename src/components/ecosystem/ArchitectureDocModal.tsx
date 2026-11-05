import React, { useState } from 'react';
import {
  FolderTree,
  Database,
  ShieldCheck,
  CloudLightning,
  Smartphone,
  GitBranch,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';

export const ArchitectureDocModal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'folder' | 'schema' | 'security' | 'realtime' | 'android' | 'devops'
  >('folder');
  const [copied, setCopied] = useState(false);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const folderStructureCode = `// BloodSearch Production Architecture (React + Express + Drizzle ORM + Neon PostgreSQL + Capacitor Android)
bloodsearch/
├── server.ts                         # Hardened Express API + WebSocket (/ws) + Google OIDC Callback
├── capacitor.config.ts               # Native Android APK configuration (bd.bloodsearch.app)
├── drizzle/
│   ├── 0000_bloodsearch_neon_core.sql # 28-Table Neon PostgreSQL DDL, FKs, CHECKs & Indexes
│   ├── least_privilege_roles.sql      # Separation of bloodsearch_migrator vs bloodsearch_runtime
│   └── rollback_0000_drop_all.sql     # Safe transactional rollback script
├── src/
│   ├── db/
│   │   ├── schema.ts                 # Drizzle ORM schema (users, donor_profiles, private_contacts, ...)
│   │   ├── neonConfig.ts             # TLS sslmode=verify-full pooled & direct Neon configuration
│   │   └── repositories/
│   │       └── bloodSearchRepo.ts    # Transactional RBAC, IDOR guards & parameterized SQL queries
│   ├── server/
│   │   ├── authAndSessionService.ts  # Google OIDC RS256 JWKS, scrypt passwords, SHA-256 opaque sessions
│   │   ├── distributedRateLimiter.ts # Multi-instance PostgreSQL atomic sliding-window rate limiter
│   │   ├── neonRoutes.ts             # Complete /api/v1/* REST + SSE backend router
│   │   └── realtimeHub.ts            # RFC-6455 WebSocket + Server-Sent Events push broker
│   ├── services/
│   │   ├── bloodSearchService.ts     # Frontend API client with CSRF, GET coalescing & fingerprint dedup
│   │   └── capacitorBridge.ts        # Android WebView origin resolver & hardware back-button handler
│   └── components/                   # Bilingual (BN/EN) User Portal & Isolated /admin Console
└── android/                          # Native Capacitor Android Gradle project (Debug & Release APKs)`;

  const neonSchemaCode = `-- Neon PostgreSQL Core Schema Highlights (28 Hardened Tables)
-- 1. Strict Public vs Private PII Split Isolation
CREATE TABLE users (
  uid VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name VARCHAR(120) NOT NULL,
  account_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'
    CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'PENDING_REVIEW')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE donor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES users(uid) ON DELETE CASCADE,
  public_name VARCHAR(120) NOT NULL,
  blood_group VARCHAR(5) NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  district VARCHAR(64) NOT NULL,
  masked_phone_hint VARCHAR(24) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  availability_status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
  share_direct_contact BOOLEAN NOT NULL DEFAULT TRUE
);

-- Raw phone, WhatsApp & Facebook URL NEVER appear in donor_profiles!
CREATE TABLE private_contacts (
  user_uid VARCHAR(128) PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  phone_e164 VARCHAR(20) NOT NULL,
  whatsapp_number VARCHAR(20),
  facebook_profile_url VARCHAR(255),
  contact_visibility VARCHAR(32) NOT NULL DEFAULT 'PUBLIC_OPT_IN'
);

-- SHA-256 hashed opaque session tokens (raw token never stored in DB)
CREATE TABLE login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uid VARCHAR(128) NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  token_sha256 VARCHAR(64) NOT NULL UNIQUE,
  csrf_secret_sha256 VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);`;

  const backendSecurityCode = `// Multi-Layer Zero-Trust Backend Security Controls
// 1. Google OIDC RS256 Verification + Single-Use Nonce Replay Protection
const claims = await verifyGoogleOidcIdToken({ idToken, expectedClientId });
await consumeGoogleOidcNonceTx(db, claims.nonce, expectedState);

// 2. Opaque 256-bit Session Cookie + Session-Bound CSRF Token
// Cookie: bs_session=bs_sess_<random>; HttpOnly; Secure; SameSite=None; Path=/
// Header: X-CSRF-Token validated in constant time on all POST/PUT/PATCH/DELETE mutations

// 3. Distributed PostgreSQL Rate Limiting (Multi-Instance Safe)
await enforceDistributedRateLimit(res, db, \`donorsearch:\${ipHash}\`, 60, 60_000);

// 4. Object-Level Authorization (IDOR Prevention)
// - Public donor search queries ONLY donor_profiles (zero raw phone leakage)
// - Unmasking private_contacts checks DND, consent visibility, contact_requests, and logs audit_logs
// - Direct chat rooms & live GPS trips verify participant membership on the server`;

  const realtimeCode = `// Real-Time SOS Broadcast & Notification Engine (WebSocket + SSE + Optional SMS)
// 1. Authenticated SOS creation persists atomically in Neon PostgreSQL
// 2. Compatible nearby donors (respecting DND & 90-day recovery) receive emergency_alerts + notifications
// 3. Server pushes instant frame over /ws (RFC-6455 WebSocket) and /api/v1/events/stream (SSE)
realtimeHub.emitEvent('requests:created', 'public:requests', { requestId: created.id });
realtimeHub.emitToUser(targetDonorUid, 'alerts:sos', {
  requestId: created.id,
  bloodGroup: created.bloodGroup,
  hospitalName: created.hospitalName,
  district: created.district,
});`;

  const androidCapacitorCode = `// Native Android APK Configuration (capacitor.config.ts)
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'bd.bloodsearch.app',
  appName: 'BloodSearch',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

// Build Debug & Unsigned Release APKs:
// npm run build
// npx cap sync android
// cd android && ./gradlew assembleDebug assembleRelease`;

  const devopsCode = `# Production Deployment & Neon Migration Workflow
# 1. Apply Neon PostgreSQL schema migrations using direct connection URL
DATABASE_URL="$DIRECT_DATABASE_URL" npx drizzle-kit migrate

# 2. Verify cryptographic 28-table backup & restore integrity
npm run db:backup
npm run db:restore:verify

# 3. Run security & integration test suite + build production bundle
npm test
npm run build
NODE_ENV=production npm start`;

  return (
    <div className="space-y-6">
      <div className="glass-card-adaptive rounded-2xl p-5 sm:p-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-md">
                <Terminal className="w-5 h-5 text-rose-500" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Neon PostgreSQL & Security Architecture (সম্পূর্ণ আর্কিটেকচার ব্লুপ্রিন্ট)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              Neon PostgreSQL 28-Table Schema, Google OIDC, Opaque SHA-256 Sessions, Express API & Capacitor Android APK
            </p>
          </div>
        </div>

        <div className="pt-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'folder' as const, label: 'Project Structure', icon: FolderTree },
            { id: 'schema' as const, label: 'Neon SQL Schema', icon: Database },
            { id: 'security' as const, label: 'API & Session Shield', icon: ShieldCheck },
            { id: 'realtime' as const, label: 'WebSocket & SOS', icon: CloudLightning },
            { id: 'android' as const, label: 'Capacitor Android APK', icon: Smartphone },
            { id: 'devops' as const, label: 'Migrations & Deploy', icon: GitBranch },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card-adaptive rounded-2xl overflow-hidden shadow-2xl border border-slate-200/80 dark:border-slate-800/80">
        <div className="p-3 px-5 bg-slate-900 text-slate-300 text-xs font-mono flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="ml-2 font-bold text-slate-100">
              {activeTab === 'folder' && 'bloodsearch/ - Full-Stack Directory'}
              {activeTab === 'schema' && 'drizzle/0000_bloodsearch_neon_core.sql'}
              {activeTab === 'security' && 'src/server/authAndSessionService.ts'}
              {activeTab === 'realtime' && 'src/server/realtimeHub.ts'}
              {activeTab === 'android' && 'capacitor.config.ts'}
              {activeTab === 'devops' && 'DEPLOYMENT_GUIDE.md'}
            </span>
          </div>

          <button
            onClick={() => {
              const codeMap = {
                folder: folderStructureCode,
                schema: neonSchemaCode,
                security: backendSecurityCode,
                realtime: realtimeCode,
                android: androidCapacitorCode,
                devops: devopsCode,
              };
              copyCode(codeMap[activeTab]);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>

        <div className="p-5 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed">
          <pre>
            {activeTab === 'folder' && folderStructureCode}
            {activeTab === 'schema' && neonSchemaCode}
            {activeTab === 'security' && backendSecurityCode}
            {activeTab === 'realtime' && realtimeCode}
            {activeTab === 'android' && androidCapacitorCode}
            {activeTab === 'devops' && devopsCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
