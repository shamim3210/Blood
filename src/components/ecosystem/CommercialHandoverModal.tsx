import React, { useState } from 'react';
import { Language } from '../../types';
import {
  COMMERCIAL_BRAND_PRESETS,
  getEnvDefaultBrandConfig,
  resetBrandConfigOverride,
  saveBrandConfigOverride,
  useBrandConfig,
} from '../../config/brandConfig';
import { BrandLogo } from '../BrandLogo';
import {
  Briefcase,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  Globe,
  Layers,
  Package,
  RefreshCw,
  ShieldCheck,
  Sliders,
  X,
} from 'lucide-react';

interface CommercialHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const CommercialHandoverModal: React.FC<CommercialHandoverModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const brand = useBrandConfig();
  const [activeTab, setActiveTab] = useState<'pitch' | 'whitelabel' | 'handover'>('pitch');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Editable White-Label fields
  const [formBrandName, setFormBrandName] = useState(brand.brandName);
  const [formTagline, setFormTagline] = useState(brand.tagline);
  const [formOrgName, setFormOrgName] = useState(brand.organizationName);
  const [formPhone, setFormPhone] = useState(brand.supportPhone);
  const [formEmail, setFormEmail] = useState(brand.supportEmail);
  const [cleanBlankDbMode, setCleanBlankDbMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bloodsearch_real_only_mode') === 'true';
    } catch {
      return brand.defaultRealOnlyMode;
    }
  });

  // Editable Buyer Handover fields
  const [buyerAdminEmail, setBuyerAdminEmail] = useState('admin@buyerdomain.com');
  const [buyerProjectId, setBuyerProjectId] = useState('buyer-blood-network');
  const [quoteSinglePrice, setQuoteSinglePrice] = useState('25,000');
  const [quoteEnterprisePrice, setQuoteEnterprisePrice] = useState('55,000');
  const [quoteWhitelabelPrice, setQuoteWhitelabelPrice] = useState('95,000');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const triggerCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2200);
  };

  const applyWhiteLabelLive = (e: React.FormEvent) => {
    e.preventDefault();
    saveBrandConfigOverride({
      brandName: formBrandName,
      tagline: formTagline,
      organizationName: formOrgName,
      supportPhone: formPhone,
      supportEmail: formEmail,
      defaultRealOnlyMode: cleanBlankDbMode,
    });
    try {
      localStorage.setItem('bloodsearch_real_only_mode', String(cleanBlankDbMode));
      window.dispatchEvent(new Event('bloodsearch_real_mode_changed'));
    } catch {
      // Ignore storage errors
    }
    setStatusNotice(
      lang === 'bn'
        ? 'লাইভ হোয়াইট-লেবেল ব্র্যান্ডিং ও ডাটাবেস মোড সঙ্গে সঙ্গে আপডেট হয়েছে।'
        : 'Live white-label branding and database mode applied across the application.'
    );
    window.setTimeout(() => setStatusNotice(null), 3200);
  };

  const applyPreset = (presetId: string) => {
    const found = COMMERCIAL_BRAND_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setFormBrandName(found.config.brandName);
    setFormTagline(found.config.tagline);
    setFormOrgName(found.config.organizationName);
    setFormPhone(found.config.supportPhone);
    setFormEmail(found.config.supportEmail);
    setCleanBlankDbMode(found.config.defaultRealOnlyMode);
    saveBrandConfigOverride(found.config);
    try {
      localStorage.setItem(
        'bloodsearch_real_only_mode',
        String(found.config.defaultRealOnlyMode)
      );
      window.dispatchEvent(new Event('bloodsearch_real_mode_changed'));
    } catch {
      // Ignore storage errors
    }
    setStatusNotice(
      lang === 'bn'
        ? `"${found.config.brandName}" প্রিসেটটি লাইভ প্রিভিউতে চালু হয়েছে।`
        : `"${found.config.brandName}" preset activated in live preview.`
    );
    window.setTimeout(() => setStatusNotice(null), 3000);
  };

  const handleResetDefault = () => {
    const defaults = getEnvDefaultBrandConfig();
    resetBrandConfigOverride();
    setFormBrandName(defaults.brandName);
    setFormTagline(defaults.tagline);
    setFormOrgName(defaults.organizationName);
    setFormPhone(defaults.supportPhone);
    setFormEmail(defaults.supportEmail);
    setCleanBlankDbMode(false);
    try {
      localStorage.setItem('bloodsearch_real_only_mode', 'false');
      window.dispatchEvent(new Event('bloodsearch_real_mode_changed'));
    } catch {
      // Ignore storage errors
    }
    setStatusNotice(
      lang === 'bn'
        ? 'ডিফল্ট BloodSearch ব্র্যান্ডিং পুনরায় স্থাপন করা হয়েছে।'
        : 'Restored default BloodSearch configuration.'
    );
    window.setTimeout(() => setStatusNotice(null), 3000);
  };

  const generatedBuyerEnv = `# Commercial White-Label & Neon PostgreSQL Configuration (${formBrandName})
NODE_ENV="production"
PORT="3000"
APP_URL="https://${buyerProjectId.trim() || 'bloodsearch.example.org'}"
CORS_ALLOWED_ORIGINS="https://${buyerProjectId.trim() || 'bloodsearch.example.org'},capacitor://localhost,https://localhost"

# Neon PostgreSQL Primary Database (Server-Only Secrets — NEVER prefix with VITE_)
DATABASE_URL="postgresql://bloodsearch_runtime:REPLACE_PASSWORD@ep-buyer-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full"
DIRECT_DATABASE_URL="postgresql://bloodsearch_migrator:REPLACE_PASSWORD@ep-buyer.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full"

# Google Identity Services / OIDC Server Verification
GOOGLE_CLIENT_ID="REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="REPLACE_WITH_GOOGLE_OAUTH_CLIENT_SECRET"
VITE_GOOGLE_CLIENT_ID="REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"

# Super Admin & Cryptographic Secrets
SUPER_ADMIN_EMAIL="${buyerAdminEmail.trim() || 'admin@buyerdomain.com'}"
VITE_SUPER_ADMIN_EMAIL="${buyerAdminEmail.trim() || 'admin@buyerdomain.com'}"
SESSION_HMAC_SECRET="REPLACE_WITH_64_HEX_RANDOM_SECRET"
OTP_HMAC_SECRET="REPLACE_WITH_64_HEX_RANDOM_SECRET"

# White-Label Branding
VITE_BRAND_NAME="${formBrandName.trim() || 'BloodSearch'}"
VITE_BRAND_TAGLINE="${formTagline.trim() || 'FIND BLOOD. SAVE LIFE.'}"
VITE_ORG_NAME="${formOrgName.trim() || 'Emergency Blood Network'}"
VITE_SUPPORT_PHONE="${formPhone.trim() || '16263'}"
VITE_SUPPORT_EMAIL="${formEmail.trim() || 'support@example.org'}"
VITE_DEFAULT_REAL_ONLY_MODE="${cleanBlankDbMode ? 'true' : 'false'}"
VITE_API_BASE_URL="https://${buyerProjectId.trim() || 'bloodsearch.example.org'}"

# Optional SMS Gateway (TWILIO or WEBHOOK_BD)
SMS_PROVIDER="NONE"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER=""
SMS_WEBHOOK_URL=""
SMS_WEBHOOK_API_KEY=""
`;

  const generatedNeonChecklistJson = JSON.stringify(
    {
      deploymentDomain: `https://${buyerProjectId.trim() || 'bloodsearch.example.org'}`,
      googleOAuthRedirectUri: `https://${buyerProjectId.trim() || 'bloodsearch.example.org'}/auth/callback`,
      androidPackageId: 'bd.bloodsearch.app',
      primaryDatabase: 'Neon Serverless PostgreSQL (sslmode=verify-full)',
      tablesCount: 28,
      superAdminEmail: buyerAdminEmail.trim() || 'admin@buyerdomain.com',
    },
    null,
    2
  );

  const buyerPackageCommand = `npm run package:buyer -- --admin="${buyerAdminEmail.trim() || 'admin@buyerdomain.com'}" --brand="${formBrandName.trim() || 'BloodSearch'}"`;

  const salesPitchTextBn = `প্রস্তাবনা: ${formBrandName} — জরুরি রক্তদাতা সন্ধান ও ব্লাড ব্যাংক ম্যানেজমেন্ট প্ল্যাটফর্ম (Web + PWA + Native Android APK রেডি)

মূল সুবিধাসমূহ:
১. দ্রুততম ডোনার সার্চ ও স্মার্ট র‍্যাঙ্কিং: ৬৪ জেলা, রক্তের গ্রুপ, GPS দূরত্ব এবং ডোনারের বর্তমান প্রাপ্যতা অনুযায়ী তাৎক্ষণিক ম্যাচিং।
২. সরাসরি যোগাযোগ ও প্রাইভেসি সুরক্ষা: সম্মতি দেওয়া ডোনারদের ১-ক্লিকে Call, SMS, WhatsApp ও Facebook সুবিধা এবং প্রাইভেট ডোনারদের নম্বর মাস্কিং ও কনসেন্ট রিকোয়েস্ট।
৩. অটোমেটিক জরুরি ব্রডকাস্ট ও এস্কেলেশন: একসাথে একাধিক উপযুক্ত ডোনারকে রিয়েল-টাইম WebSocket/SSE নোটিফিকেশন, SMS গেটওয়ে সাপোর্ট এবং সাড়া না পেলে স্বয়ংক্রিয়ভাবে সার্চ পরিধি বৃদ্ধি।
৪. সম্পূর্ণ অ্যাডমিন ও ব্লাড স্টক প্যানেল: ভেরিফাইড ডোনার ব্যাজ, ব্লাড ব্যাংকের লাইভ ইনভেন্টরি, অ্যান্টি-স্ক্যাম মডারেশন, গ্লোবাল মেগাফোন ঘোষণা এবং সিকিউরিটি অডিট লগ।
৫. এন্টারপ্রাইজ নিরাপত্তা ও হোয়াইট-লেবেল মালিকানা: Neon PostgreSQL 28-Table আইসোলেশন, Google OIDC ভেরিফিকেশন, HttpOnly SHA-256 সেশন, ডিস্ট্রিবিউটেড রেট-লিমিটিং এবং আপনার প্রতিষ্ঠানের নিজস্ব নাম, লোগো ও ডোমেইনে ১০০% মালিকানাসহ সেটআপ।

প্যাকেজ মূল্য (আলোচনা সাপেক্ষে):
• সিঙ্গেল অর্গানাইজেশন লাইসেন্স: ৳${quoteSinglePrice} BDT
• হাসপাতাল ও ডায়াগনস্টিক এন্টারপ্রাইজ এডিশন: ৳${quoteEnterprisePrice} BDT
• ফুল সোর্স কোড ও হোয়াইট-লেবেল মালিকানা: ৳${quoteWhitelabelPrice} BDT`;

  const salesPitchTextEn = `Product Proposal: ${formBrandName} — Real-Time Emergency Blood Donor & Transfusion Dispatch Platform (Web + PWA + Native Android APK Ready)

Core Capabilities:
1. Fast Donor Matching & Ranking: Search across all 64 districts by blood group, urgency, GPS/manual distance, and verified donor availability.
2. Zero-Friction Direct Contact & Privacy Controls: Instant Call, SMS, WhatsApp & Facebook actions for opted-in donors, plus masked phone protection and consent requests for private donors.
3. Multi-Donor SOS Broadcast & Auto-Escalation: Concurrent real-time WebSocket/SSE alerts with optional SMS gateways and automatic radius expansion when no response is received.
4. Institutional Admin & Blood Bank Suite: Live blood unit inventory, verified donor badges, scam report moderation, broadcast announcements, and tamper-evident audit logs.
5. Enterprise Security & White-Label Ownership: Hardened 28-table Neon PostgreSQL database, Google OIDC RS256 verification, HttpOnly SHA-256 opaque sessions, distributed rate-limiting, bilingual UI (Bangla + English), and full white-label deployment on your own domain and Neon database.

Commercial Licensing Options:
• Single Organization License: BDT ${quoteSinglePrice}
• Hospital & Diagnostic Enterprise Edition: BDT ${quoteEnterprisePrice}
• Full White-Label Source Code & Ownership Package: BDT ${quoteWhitelabelPrice}`;

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-4xl my-2 sm:my-auto rounded-2xl bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white p-4 sm:p-6 shadow-xl border border-slate-200 dark:border-slate-800 text-left space-y-5">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="mark" size="md" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'কমার্শিয়াল সেলস, হোয়াইট-লেবেল ও বায়ার হ্যান্ডওভার স্টুডিও'
                  : 'Commercial Sales, White-Label & Buyer Handover Studio'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'bn'
                  ? 'ক্লায়েন্টকে লাইভ ডেমো দেখান, প্রতিষ্ঠানের নামে ব্র্যান্ডিং পরিবর্তন করুন এবং ১-ক্লিকে ক্লিন সোর্স প্যাকেজ তৈরি করুন'
                  : 'Demo to prospective buyers, rebrand live in seconds, and generate clean buyer handover configs'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Segmented Tab Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#1e293b] rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pitch')}
            className={`flex-1 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'pitch'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-rose-600" />
            <span>{lang === 'bn' ? '০১. বিক্রয় প্রপোজাল ও মূল্যমান' : '01. Sales Pitch & Pricing'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whitelabel')}
            className={`flex-1 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'whitelabel'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-rose-600" />
            <span>{lang === 'bn' ? '০২. লাইভ ব্র্যান্ড কাস্টমাইজার' : '02. Live White-Label'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('handover')}
            className={`flex-1 min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'handover'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-rose-600" />
            <span>{lang === 'bn' ? '০৩. বায়ার হ্যান্ডওভার ও ক্লিন ZIP' : '03. Buyer Handover & Clean ZIP'}</span>
          </button>
        </div>

        {statusNotice && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* TAB 1: COMMERCIAL PITCH & LICENSING */}
        {activeTab === 'pitch' && (
          <div className="space-y-5">
            {/* Value Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 px-4 rounded-xl bg-slate-50 dark:bg-[#1e293b]/60 border border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  64
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'জেলা কভারেজ ও ম্যাপ' : 'Districts & Live Map'}
                </div>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  28
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'সুরক্ষিত Neon SQL টেবিল' : 'Hardened Neon SQL Tables'}
                </div>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  5-Tier
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'অটো SOS এস্কেলেশন' : 'Auto SOS Escalation'}
                </div>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  Web + APK
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'PWA ও প্লে-স্টোর রেডি' : 'PWA & Play Store Ready'}
                </div>
              </div>
            </div>

            {/* Pricing / License Tier Matrix with Editable Quote Amounts */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'ক্লায়েন্ট লাইসেন্সিং ও মূল্য নির্ধারণ (আপনার পছন্দমতো এডিট করুন)'
                    : 'Client Licensing Tiers (Customize Quote Before Copying Proposal)'}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'হাসপাতাল · ফাউন্ডেশন · এনজিও · মার্কেটপ্লেস' : 'Hospitals · NGOs · Foundations · SaaS'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Tier 1 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'রক্তদান সংগঠন ও ক্যাম্পাস ক্লাবের জন্য' : 'For Blood Clubs & Foundations'}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'সিঙ্গেল অর্গানাইজেশন লাইসেন্স' : 'Single Organization License'}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-xs font-mono text-slate-500">BDT</span>
                      <input
                        name="quoteSinglePrice"
                        type="text"
                        value={quoteSinglePrice}
                        onChange={(e) => setQuoteSinglePrice(e.target.value)}
                        className="w-28 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>{lang === 'bn' ? '১টি কাস্টম ডোমেইন ও PWA সেটআপ' : '1 Custom Domain & PWA Setup'}</div>
                    <div>{lang === 'bn' ? 'ডোনার সার্চ, SOS ও কল/WhatsApp' : 'Donor Search, SOS & Call/WhatsApp'}</div>
                    <div>{lang === 'bn' ? 'অ্যাডমিন ও মডারেটর ড্যাশবোর্ড' : 'Admin & Moderator Dashboard'}</div>
                  </div>
                </div>

                {/* Tier 2 */}
                <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/15 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-rose-700 dark:text-rose-300 font-medium">
                      {lang === 'bn' ? 'প্রাইভেট হাসপাতাল ও ডায়াগনস্টিক সেন্টারের জন্য' : 'For Hospitals & Diagnostic Centers'}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'হাসপাতাল ও ব্লাড ব্যাংক এন্টারপ্রাইজ' : 'Hospital & Blood Bank Enterprise'}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-xs font-mono text-slate-500">BDT</span>
                      <input
                        name="quoteEnterprisePrice"
                        type="text"
                        value={quoteEnterprisePrice}
                        onChange={(e) => setQuoteEnterprisePrice(e.target.value)}
                        className="w-28 px-2 py-1 rounded-lg bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-rose-200/60 dark:border-rose-900/50">
                    <div>{lang === 'bn' ? 'লাইভ ব্লাড স্টক ইনভেন্টরি ও থ্যালাসেমিয়া কেয়ার' : 'Live Blood Inventory & Thalassemia Care'}</div>
                    <div>{lang === 'bn' ? 'SMS ও ব্রাউজার Push গেটওয়ে ইন্টিগ্রেশন' : 'SMS & Web Push Gateway Integration'}</div>
                    <div>{lang === 'bn' ? 'Android APK বিল্ড ও প্লে-স্টোর গাইডলাইন' : 'Android APK Package & Play Store Kit'}</div>
                  </div>
                </div>

                {/* Tier 3 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'bn' ? 'সফটওয়্যার এজেন্সি ও কর্পোরেট ক্রেতাদের জন্য' : 'For Agencies & Corporate Buyers'}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'ফুল সোর্স কোড ও হোয়াইট-লেবেল রাইটস' : 'Full Source Code & White-Label'}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-xs font-mono text-slate-500">BDT</span>
                      <input
                        name="quoteWhitelabelPrice"
                        type="text"
                        value={quoteWhitelabelPrice}
                        onChange={(e) => setQuoteWhitelabelPrice(e.target.value)}
                        className="w-28 px-2 py-1 rounded-lg bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>{lang === 'bn' ? '১০০% ক্লিন TypeScript সোর্স কোড' : '100% Clean TypeScript Full-Stack Code'}</div>
                    <div>{lang === 'bn' ? 'নিজস্ব Neon PostgreSQL ও Zero-Trust RBAC' : 'Dedicated Neon PostgreSQL & Zero-Trust RBAC'}</div>
                    <div>{lang === 'bn' ? 'সম্পূর্ণ রি-ব্র্যান্ডিং ও কাস্টমাইজেশন অধিকার' : 'Full Rebranding & Modification Rights'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ready-to-Send Sales Proposal Actions */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1e293b]/70 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'ক্লায়েন্টকে পাঠানোর রেডি সেলস প্রপোজাল (WhatsApp / Email / Marketplace)'
                      : 'Ready-to-Send Client Sales Proposal (WhatsApp / Email / Marketplace)'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? '১-ক্লিকে বাংলা বা ইংরেজি প্রপোজাল কপি করে সরাসরি বায়ারকে পাঠান'
                      : 'Copy the formatted pitch in Bengali or English with your custom pricing'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerCopy(salesPitchTextBn, 'pitch-bn')}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'pitch-bn' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'pitch-bn' ? 'কপি হয়েছে!' : 'বাংলা প্রপোজাল কপি করুন'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopy(salesPitchTextEn, 'pitch-en')}
                    className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'pitch-en' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'pitch-en' ? 'Copied!' : 'Copy English Proposal'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE WHITE-LABEL BRAND CUSTOMIZER */}
        {activeTab === 'whitelabel' && (
          <div className="space-y-5">
            {/* Industry Demo Presets */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {lang === 'bn'
                  ? 'ক্লায়েন্ট মিটিংয়ের জন্য ১-ক্লিক ইন্ডাস্ট্রি ডেমো প্রিসেট:'
                  : '1-Click Industry Demo Presets for Client Meetings:'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {COMMERCIAL_BRAND_PRESETS.map((preset) => {
                  const active = brand.brandName === preset.config.brandName;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? preset.labelBn : preset.labelEn}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {lang === 'bn' ? preset.audienceBn : preset.audienceEn}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Brand Form */}
            <form onSubmit={applyWhiteLabelLive} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'অ্যাপ / ব্র্যান্ডের নাম (Brand Name)' : 'App / Brand Name'}
                  </span>
                  <input
                    name="whitelabelBrandName"
                    type="text"
                    required
                    maxLength={40}
                    value={formBrandName}
                    onChange={(e) => setFormBrandName(e.target.value)}
                    placeholder="e.g. Square Blood Bank"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'ট্যাগলাইন (Tagline)' : 'Brand Tagline'}
                  </span>
                  <input
                    name="whitelabelTagline"
                    type="text"
                    required
                    maxLength={50}
                    value={formTagline}
                    onChange={(e) => setFormTagline(e.target.value)}
                    placeholder="FIND BLOOD. SAVE LIFE."
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'প্রতিষ্ঠানের পূর্ণ নাম (Organization Name)' : 'Organization Legal / Display Name'}
                  </span>
                  <input
                    name="whitelabelOrgName"
                    type="text"
                    required
                    maxLength={80}
                    value={formOrgName}
                    onChange={(e) => setFormOrgName(e.target.value)}
                    placeholder="Bangladesh Emergency Blood Network"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'bn' ? 'হটলাইন নম্বর' : 'Support Hotline'}
                    </span>
                    <input
                      name="whitelabelHotline"
                      type="text"
                      maxLength={24}
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+88017..."
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'bn' ? 'সাপোর্ট ইমেইল' : 'Support Email'}
                    </span>
                    <input
                      name="whitelabelSupportEmail"
                      type="email"
                      maxLength={80}
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="support@domain.com"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Clean Production Database Toggle */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1e293b]/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? '১০০% ক্লিন প্রোডাকশন ডাটাবেস মোড (ডেমো ডোনার ও রিকোয়েস্ট লুকান)'
                      : '100% Clean Blank Production Mode (Hide Demo Seed Records)'}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'bn'
                      ? 'অন করলে সব ডেমো ডোনার ও নমুনা রিকোয়েস্ট মুছে শুধু আসল ক্লাউড ডাটা দেখাবে—বায়ারকে ফ্রেশ প্রোডাকশন ডেলিভারি দেওয়ার জন্য উপযুক্ত।'
                      : 'When enabled, hides all sample showcase donors/requests so the buyer starts with a clean production database.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCleanBlankDbMode(!cleanBlankDbMode)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                    cleanBlankDbMode
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {cleanBlankDbMode
                    ? lang === 'bn'
                      ? 'চালু (Clean Mode)'
                      : 'Enabled (Clean)'
                    : lang === 'bn'
                      ? 'ডেমো মোড (Showcase)'
                      : 'Showcase Mode'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'ডিফল্ট BloodSearch ফিরিয়ে আনুন' : 'Reset to Default'}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTextFile('.env.production', generatedBuyerEnv)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? '.env ফাইল ডাউনলোড' : 'Download .env'}</span>
                  </button>

                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{lang === 'bn' ? 'লাইভ ব্র্যান্ডিং প্রয়োগ করুন' : 'Apply Live Branding'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: BUYER HANDOVER & CLEAN SOURCE PACKAGE */}
        {activeTab === 'handover' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {lang === 'bn'
                    ? 'বায়ারের সুপার অ্যাডমিন Gmail (মালিকানা হস্তান্তরের জন্য)'
                    : 'Buyer Super Admin Gmail (For Ownership Transfer)'}
                </span>
                <input
                  name="buyerAdminEmail"
                  type="email"
                  value={buyerAdminEmail}
                  onChange={(e) => setBuyerAdminEmail(e.target.value)}
                  placeholder="owner@buyerhospital.com"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {lang === 'bn'
                    ? 'বায়ারের প্রোডাকশন ডোমেইন হোস্টনেম'
                    : 'Buyer Production Domain Hostname'}
                </span>
                <input
                  name="buyerProjectId"
                  type="text"
                  value={buyerProjectId}
                  onChange={(e) => setBuyerProjectId(e.target.value)}
                  placeholder="bloodsearch.buyerhospital.org"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white"
                />
              </label>
            </div>

            {/* Step-by-step Clean Buyer Packaging Command */}
            <div className="p-4 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {lang === 'bn'
                      ? '১-কমান্ডে বায়ার-রেডি ক্লিন ডেলিভারি ফোল্ডার তৈরি (VS Code Terminal)'
                      : '1-Command Clean Buyer Release Packager (VS Code Terminal)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => triggerCopy(buyerPackageCommand, 'pkg-cmd')}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'pkg-cmd' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'pkg-cmd' ? 'Copied' : 'Copy Command'}</span>
                </button>
              </div>
              <pre className="text-xs font-mono text-emerald-300 overflow-x-auto py-1">
                {buyerPackageCommand}
              </pre>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'এই কমান্ডটি আপনার ব্যক্তিগত .env সিক্রেট, ডাটাবেস কী, .git এবং node_modules বাদ দিয়ে `buyer-release/` ফোল্ডারে বায়ারের ইমেইল ও ব্র্যান্ডিংসহ ১০০% পরিচ্ছন্ন ডেলিভারি প্যাকেজ তৈরি করে।'
                  : 'Automatically strips personal .env secrets, .git, and node_modules, and outputs a clean `buyer-release/` folder pre-configured with the buyer’s brand and Super Admin email.'}
              </p>
            </div>

            {/* Downloadable Config Files */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-rose-600" />
                  <span>{lang === 'bn' ? 'বায়ারের .env কনফিগারেশন' : 'Buyer .env Configuration'}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'Neon DATABASE_URL, Google OIDC কী ও সুপার অ্যাডমিন ইমেইল সংবলিত রেডি টেমপ্লেট।'
                    : 'Pre-filled with Neon DATABASE_URL placeholders, Google OIDC, and buyer Super Admin email.'}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => downloadTextFile('.env.example', generatedBuyerEnv)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .env</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopy(generatedBuyerEnv, 'env-copy')}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'env-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'env-copy' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>{lang === 'bn' ? 'Neon ও OAuth হ্যান্ডওভার ম্যানিফেস্ট' : 'Neon & OAuth Handover Manifest'}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'বায়ারের প্রোডাকশন ডোমেইন, Google OAuth কলব্যাক URL ও APK প্যাকেজ আইডি সারাংশ।'
                    : 'Summary JSON of buyer domain, Google OAuth callback URL, and Android APK package ID.'}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        'buyer-deployment-manifest.json',
                        generatedNeonChecklistJson,
                        'application/json'
                      )
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopy(generatedNeonChecklistJson, 'fb-copy')}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'fb-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'fb-copy' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4-Step Buyer Handover Checklist */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1e293b]/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-rose-600" />
                <span>
                  {lang === 'bn'
                    ? 'বিক্রির পর বায়ারকে ডেলিভারি দেওয়ার ৪টি ধাপ (DEPLOYMENT_GUIDE.md-তে বিস্তারিত যুক্ত আছে):'
                    : '4-Step Buyer Delivery Checklist (Included in DEPLOYMENT_GUIDE.md):'}
                </span>
              </div>
              <div>
                {lang === 'bn'
                  ? '০১. উপরের কমান্ডটি চালিয়ে `buyer-release/` ফোল্ডারটি ZIP করে বায়ারকে দিন (আপনার কোনো ব্যক্তিগত কী তাতে থাকবে না)।'
                  : '01. Run the packager command above and zip `buyer-release/` — zero seller keys or secrets are included.'}
              </div>
              <div>
                {lang === 'bn'
                  ? '০২. বায়ার নিজের Neon Console থেকে PostgreSQL ডাটাবেস খুলে `DATABASE_URL` এবং Google Cloud থেকে `GOOGLE_CLIENT_ID` বসাবে।'
                  : '02. Buyer creates a Neon PostgreSQL database (`DATABASE_URL`) and Google Cloud OAuth Client (`GOOGLE_CLIENT_ID`).'}
              </div>
              <div>
                {lang === 'bn'
                  ? '০৩. `npx drizzle-kit migrate` চালিয়ে ২৮টি সুরক্ষিত PostgreSQL টেবিল ও ইনডেক্স অ্যাক্টিভেট করবে।'
                  : '03. Buyer runs `npx drizzle-kit migrate` to provision all 28 hardened Neon PostgreSQL tables and indexes.'}
              </div>
              <div>
                {lang === 'bn'
                  ? '০৪. Cloud Run / Render / Railway / VPS-এ হোস্ট করবে এবং Capacitor (`./gradlew assembleRelease`) দিয়ে সাইনড Android APK জেনারেট করবে।'
                  : '04. Deploy full-stack server (`npm run build && npm start`) and sign the Capacitor Android APK (`ANDROID_BUILD_GUIDE.md`).'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
