import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'buyer-release');

function parseArg(flag, fallback) {
  const prefix = `--${flag}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

const buyerAdminEmail = parseArg('admin', 'admin@buyerdomain.com');
const buyerBrandName = parseArg('brand', 'BloodSearch');
const buyerOrgName = parseArg('org', 'Emergency Blood Network');

const EXCLUDED_NAMES = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  'buyer-release',
  '.git',
  '.aistudio',
  '.vercel',
  '.data',
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.production',
  'backups',
  'downloads',
]);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (EXCLUDED_NAMES.has(entry)) continue;
      if (entry.endsWith('.zip') || entry.endsWith('.log')) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const entry of fs.readdirSync(ROOT_DIR)) {
  if (EXCLUDED_NAMES.has(entry)) continue;
  if (entry.endsWith('.zip') || entry.endsWith('.log')) continue;
  copyRecursive(path.join(ROOT_DIR, entry), path.join(OUTPUT_DIR, entry));
}

const envOutPath = path.join(OUTPUT_DIR, '.env.example');
const buyerEnvTemplate = `# White-Label Brand & Ownership Configuration
PORT="3000"
APP_URL="https://yourdomain.com"
CORS_ALLOWED_ORIGINS="https://yourdomain.com,capacitor://localhost,https://localhost"

VITE_BRAND_NAME="${buyerBrandName}"
VITE_BRAND_TAGLINE="FIND BLOOD. SAVE LIFE."
VITE_ORG_NAME="${buyerOrgName}"
VITE_SUPPORT_PHONE="16263"
VITE_SUPPORT_EMAIL="support@yourdomain.com"
VITE_DEFAULT_REAL_ONLY_MODE="true"
VITE_API_BASE_URL=""
VITE_GOOGLE_CLIENT_ID=""

# Primary Application Database — Neon PostgreSQL (Server-Side Only — NEVER prefix with VITE_)
DATABASE_URL="postgresql://<runtime-role>:<password>@<pooled-host>/neondb?sslmode=verify-full"
DIRECT_DATABASE_URL="postgresql://<migration-role>:<password>@<direct-host>/neondb?sslmode=verify-full"
NEON_PLAN_TIER="FREE"
DB_POOL_MAX="10"

# Google OIDC & Session Security (Server-Side Only)
SUPER_ADMIN_EMAIL="${buyerAdminEmail}"
GOOGLE_CLIENT_ID="YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_OAUTH_WEB_CLIENT_SECRET"
AUDIT_IP_SALT="GENERATE_64_HEX_CHAR_RANDOM_SECRET_HERE"
OTP_HMAC_SECRET="GENERATE_64_HEX_CHAR_RANDOM_SECRET_HERE"
BLOODSEARCH_ENABLE_AUTH_SANDBOX="false"

# Optional SMS Gateway (Server-Side Only)
SMS_PROVIDER="NONE"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER=""
SMS_WEBHOOK_URL=""
SMS_WEBHOOK_API_KEY=""
`;
fs.writeFileSync(envOutPath, buyerEnvTemplate, 'utf8');

console.log('✓ Clean commercial buyer package created at: ./buyer-release');
console.log(`  • Brand Name        : ${buyerBrandName}`);
console.log(`  • Super Admin Email : ${buyerAdminEmail}`);
console.log('  • Seller secrets, .env, .git, .data, and node_modules excluded.');
