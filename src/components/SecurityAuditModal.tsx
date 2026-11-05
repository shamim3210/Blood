import React, { useEffect, useState } from 'react';
import { AuditLogEntry, Language } from '../types';
import { getTranslation } from '../utils/translations';
import {
  DATABASE_COLLECTION_ARCHITECTURES,
  IS_APP_CHECK_CONFIGURED,
  SmartDatabaseHealthReport,
  runSmartDatabaseHealthAndSecurityAudit,
} from '../services/bloodSearchService';
import {
  ShieldCheck,
  Lock,
  Terminal,
  CheckCircle2,
  Server,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

interface SecurityAuditModalProps {
  logs: AuditLogEntry[];
  lang: Language;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ logs, lang }) => {
  const t = getTranslation(lang);
  const [healthReport, setHealthReport] = useState<SmartDatabaseHealthReport | null>(null);
  const [isRunningAudit, setIsRunningAudit] = useState<boolean>(false);
  const [tierFilter, setTierFilter] = useState<
    'ALL' | 'PRIVATE_PII' | 'PUBLIC_MASKED' | 'ADMIN_ONLY' | 'OWNER_VAULT' | 'PARTICIPANT_LOCKED'
  >('ALL');

  const executeLiveAudit = async () => {
    setIsRunningAudit(true);
    try {
      const res = await runSmartDatabaseHealthAndSecurityAudit();
      setHealthReport(res);
    } catch {
      // Handled safely inside runSmartDatabaseHealthAndSecurityAudit
    } finally {
      setIsRunningAudit(false);
    }
  };

  useEffect(() => {
    executeLiveAudit();
  }, []);

  const filteredCollections = DATABASE_COLLECTION_ARCHITECTURES.filter((col) =>
    tierFilter === 'ALL' ? true : col.tier === tierFilter
  );

  const activeDbLayers = [
    {
      title: lang === 'bn' ? '১. PII স্প্লিট আইসোলেশন (/users বনাম /donors)' : '1. Strict PII Split Isolation',
      desc:
        lang === 'bn'
          ? 'আসল ফোন নম্বর, WhatsApp ও ইমেইল /users/{uid} কালেকশনে লক করা (`allow list: if false`)। পাবলিক কার্ডে অবশ্যই `**` মাস্কড নম্বর (`017****00`) বাধ্যতামূলক।'
          : 'Raw phone, WhatsApp & email stay locked inside /users/{uid} (`allow list: if false`). Public cards enforce `**` phone masking.',
    },
    {
      title: lang === 'bn' ? '২. অ্যান্টি-ফেক ডোনার ও বট ফায়ারওয়াল' : '2. 1-UID-1-Donor & Registered Profile Gate',
      desc:
        lang === 'bn'
          ? 'প্রতিটি অ্যাকাউন্ট সর্বোচ্চ ১টি ডোনার কার্ড খুলতে পারে (`donorId == uid`) এবং ভেরিফাইড `/users/{uid}` প্রোফাইল ছাড়া কেউ SOS, চ্যাট বা রিপোর্ট পোস্ট করতে পারে না।'
          : 'Enforces `donorId == request.auth.uid` and `hasRegisteredUserProfile()` across SOS, chats, and reports.',
    },
    {
      title: lang === 'bn' ? '৩. সার্ভার-সাইড অ্যান্টি-XSS ও মিডিয়া শিল্ড' : '3. Kernel Anti-XSS & Safe Media Firewall',
      desc:
        lang === 'bn'
          ? 'Firestore কার্নেলে `isSafeText()` দিয়ে `<script>`, `javascript:` ও ক্ষতিকর HTML কোড এবং `isSafeMediaUri()` দিয়ে অনিরাপদ ফাইল লিংক সরাসরি ব্লক করা হয়েছে।'
          : 'Server-side `isSafeText()` and `isSafeMediaUri()` reject script injection and unsafe URI schemes before storage.',
    },
    {
      title: lang === 'bn' ? '৪. ৯০-দিনের স্মার্ট অটো-রিকভারি ও সুপার ওনার ভল্ট' : '4. Smart 90-Day Auto-Unlock & Owner Vault',
      desc:
        lang === 'bn'
          ? 'রক্তদানের ৯০ দিন পূর্ণ হলে ডোনার কার্ড স্বয়ংক্রিয়ভাবে আবার "প্রস্তুত" হয় এবং অ্যাডমিন ভল্ট এককভাবে সুপার ওনার ও SHA-256 হ্যাশ দ্বারা সুরক্ষিত।'
          : 'Automatically unlocks donor availability after 90 days of medical rest and locks admin elevation behind SHA-256 proofs.',
    },
  ];

  const consoleHardeningSteps = [
    {
      statusText: IS_APP_CHECK_CONFIGURED
        ? lang === 'bn'
          ? 'সক্রিয়'
          : 'Active'
        : lang === 'bn'
          ? 'সার্ভার-সাইড গার্ড সক্রিয়'
          : 'Server-Gated',
      title: lang === 'bn' ? 'PostgreSQL মেইন ডাটাবেস আইসোলেশন (/api/v1/*)' : 'PostgreSQL Main Database Isolation (/api/v1/*)',
      desc:
        lang === 'bn'
          ? 'ডাটাবেস ক্রেডেনশিয়াল ও পুল শুধুমাত্র ব্যাকএন্ড সার্ভারে সীমাবদ্ধ; APK বা ব্রাউজার থেকে সরাসরি ডাটাবেসে প্রবেশ অসম্ভব।'
          : 'Database credentials and connection pools live exclusively on the backend server; zero direct APK/browser DB access.',
    },
    {
      statusText: lang === 'bn' ? 'সক্রিয়' : 'Active',
      title: lang === 'bn' ? 'অ্যান্টি-স্ক্যানার, CSRF ও ইনজেকশন ফায়ারওয়াল' : 'Anti-Scanner, CSRF & Injection Firewall',
      desc:
        lang === 'bn'
          ? 'স্বয়ংক্রিয় হ্যাকিং টুল (sqlmap/nikto), ক্রস-সাইট CSRF রিকোয়েস্ট এবং প্যারামিটারাইজড SQL কোয়েরি দ্বারা ইনজেকশন সম্পূর্ণ ব্লক।'
          : 'Automated vulnerability scanners, cross-site CSRF mutations, and prototype/SQL injection payloads are blocked at ingress.',
    },
    {
      statusText: lang === 'bn' ? 'সক্রিয়' : 'Active',
      title: lang === 'bn' ? 'অ্যাডমিন ব্রুট-ফোর্স লকআউট ও টোকেন ভেরিফিকেশন' : 'Admin Brute-Force Lockout & Token Gate',
      desc:
        lang === 'bn'
          ? 'অ্যাডমিন পরিচয় গোপন রাখা হয়েছে এবং ৫ বার ভুল চেষ্টায় স্বয়ংক্রিয়ভাবে ১৫ মিনিটের লকআউট কার্যকর হয়।'
          : 'Admin identities are salted/hashed with zero email hints and automatic 5-attempt 15-minute brute-force lockout.',
    },
    {
      statusText: lang === 'bn' ? 'সক্রিয়' : 'Active',
      title: lang === 'bn' ? 'রেট-লিমিটেড ডোনার কন্টাক্ট প্রাইভেসি' : 'Rate-Limited Donor Contact Protection',
      desc:
        lang === 'bn'
          ? 'রক্তদাতার সম্মতি অনুযায়ী কল, WhatsApp, SMS ও Facebook খোলা থাকে কিন্তু বাল্ক ডাটা স্ক্র্যাপিং সম্পূর্ণ নিষিদ্ধ।'
          : 'Preserves opted-in Call, WhatsApp, SMS & Facebook for real seekers while blocking bulk directory scraping.',
    },
  ];

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400 dark:text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t.auditLogTitle}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
                {lang === 'bn'
                  ? 'সার্ভার-সাইড PostgreSQL মেইন ডাটাবেস ও জিরো-ট্রাস্ট ফায়ারওয়াল মনিটর'
                  : 'Server-Side PostgreSQL Main Database & Zero-Trust Firewall Monitor'}
              </p>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'সর্বোচ্চ নিরাপত্তা সক্রিয়' : 'High Security Enforced'}</span>
          </div>
        </div>

        {/* Live Cloud Database Telemetry Bar */}
        <div className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'লাইভ ক্লাউড ডাটাবেস স্ট্যাটাস ও জিরো-ট্রাস্ট পেনিট্রেশন সেলফ-টেস্ট'
                  : 'Live Cloud Database Telemetry & Zero-Trust Penetration Self-Test'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {healthReport
                  ? lang === 'bn'
                    ? `সর্বশেষ যাচাই: ${healthReport.checkedAt} · সার্ভার সংযোগ: ${healthReport.online ? 'সক্রিয়' : 'অফলাইন'} · রেসপন্স টাইম: ${healthReport.latencyMs} ms`
                    : `Last checked: ${healthReport.checkedAt} · Connection: ${healthReport.online ? 'Online' : 'Offline'} · Latency: ${healthReport.latencyMs} ms`
                  : lang === 'bn'
                    ? 'ক্লাউড সার্ভারের সাথে সরাসরি সংযোগ ও নিরাপত্তা পরীক্ষা করা হচ্ছে...'
                    : 'Testing live Cloud Firestore latency and security rules...'}
              </p>
            </div>

            <button
              type="button"
              onClick={executeLiveAudit}
              disabled={isRunningAudit}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningAudit ? 'animate-spin' : ''}`} />
              <span>
                {isRunningAudit
                  ? lang === 'bn'
                    ? 'পরীক্ষা চলছে...'
                    : 'Testing...'
                  : lang === 'bn'
                    ? 'পুনরায় নিরাপত্তা পরীক্ষা চালান'
                    : 'Run Live Security Test'}
              </span>
            </button>
          </div>

          {/* Numeric Cloud Document Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'ক্লাউড ডোনার কার্ড' : 'Cloud Donors'}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {healthReport ? healthReport.counts.publicDonors : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'ক্লাউড SOS আবেদন' : 'Cloud SOS Docs'}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                {healthReport ? healthReport.counts.publicRequests : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'ব্লাড স্টক গ্রুপ' : 'Stock Groups'}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {healthReport ? `${healthReport.counts.bloodStockGroups}/8` : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'কমিউনিটি বার্তা' : 'Chat Messages'}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                {healthReport ? healthReport.counts.communityMessages : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'কৃতজ্ঞতা দেয়াল' : 'Gratitude Notes'}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                {healthReport ? healthReport.counts.gratitudeNotes : '—'}
              </div>
            </div>
          </div>

          {/* Live Zero-Trust Penetration Probes Result Table */}
          {healthReport && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">
                      {lang === 'bn' ? 'লাইভ অ্যাটাক সিমুলেশন টেস্ট' : 'Simulated Attack Probe'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold font-mono">
                      {lang === 'bn' ? 'টার্গেট পাথ' : 'Target Vector'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      {lang === 'bn' ? 'Firestore সার্ভারের সিদ্ধান্ত' : 'Live Server Verdict'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {healthReport.probes.map((probe) => (
                    <tr key={probe.id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {lang === 'bn' ? probe.nameBn : probe.nameEn}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {probe.attackVector}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        <span
                          className={
                            probe.blockedAsExpected
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {probe.blockedAsExpected ? '✓ ' : '✕ '}
                          {probe.serverVerdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Interactive 12-Path Cloud Database Architecture Explorer */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {lang === 'bn'
                ? `আপনার ডাটাবেসের সম্পূর্ণ আর্কিটেকচার ম্যাপ (${DATABASE_COLLECTION_ARCHITECTURES.length}টি সুরক্ষিত পাথ)`
                : `Complete Cloud Firestore Architecture (${DATABASE_COLLECTION_ARCHITECTURES.length} Secured Paths)`}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {lang === 'bn'
                ? 'কোন কালেকশনে কী ডাটা থাকে, কে পড়তে/লিখতে পারে এবং কী কী স্মার্ট অটোমেশন চালু আছে তার পূর্ণ বিবরণ'
                : 'Inspect every collection path, access boundary, schema fields, and smart automation rule'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'ALL', labelBn: 'সবগুলো', labelEn: 'All' },
                { id: 'PRIVATE_PII', labelBn: 'প্রাইভেট PII', labelEn: 'Private PII' },
                { id: 'PUBLIC_MASKED', labelBn: 'পাবলিক মাস্কড', labelEn: 'Public Masked' },
                { id: 'PARTICIPANT_LOCKED', labelBn: 'ইনবক্স লক', labelEn: 'Inbox' },
                { id: 'ADMIN_ONLY', labelBn: 'অ্যাডমিন', labelEn: 'Admin' },
                { id: 'OWNER_VAULT', labelBn: 'ওনার ভল্ট', labelEn: 'Owner Vault' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setTierFilter(btn.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  tierFilter === btn.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bn' ? btn.labelBn : btn.labelEn}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-semibold">
                  {lang === 'bn' ? 'কালেকশন ও পাথ' : 'Collection Path'}
                </th>
                <th className="py-2.5 px-3 font-semibold">
                  {lang === 'bn' ? 'সিকিউরিটি স্তর' : 'Access Policy'}
                </th>
                <th className="py-2.5 px-3 font-semibold">
                  {lang === 'bn' ? 'স্মার্ট অটোমেশন ও সুরক্ষা আচরণ' : 'Smart Automation & Security Rule'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {filteredCollections.map((col) => (
                <tr key={col.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top">
                  <td className="py-3 px-3 min-w-[210px]">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {lang === 'bn' ? col.titleBn : col.titleEn}
                    </div>
                    <div className="font-mono text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                      {col.path}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {col.fieldsSummary}
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? col.tierLabelBn : col.tierLabelEn}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 leading-relaxed min-w-[260px]">
                    {lang === 'bn' ? col.smartBehaviorBn : col.smartBehaviorEn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Firestore Zero-Trust Architecture + Production Hardening Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-500" />
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'ডাটাবেসে ইতিমধ্যে সক্রিয় নিরাপত্তা স্তরসমূহ'
                : 'Active Firestore Zero-Trust Protections'}
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeDbLayers.map((item, idx) => (
              <div key={idx} className="py-3 first:pt-1 last:pb-0">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'ক্লাউড কনসোল অতিরিক্ত নিরাপত্তা চেকলিস্ট (মালিকের জন্য)'
                : 'Cloud Console Extra Hardening Checklist'}
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {consoleHardeningSteps.map((step, idx) => (
              <div
                key={idx}
                className="py-3 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-xs text-slate-900 dark:text-white">
                    <span className="font-bold">{step.title}</span>
                    <span className="text-slate-400 mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      {step.statusText}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Audit Log Stream */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-rose-500" />
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              {lang === 'bn' ? 'সাম্প্রতিক নিরাপত্তা ও অ্যাকশন লগ' : 'Real-Time Security & Action Log'}
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {logs.length} {lang === 'bn' ? 'টি এন্ট্রি' : 'entries recorded'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 px-3 font-semibold">{lang === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                <th className="py-2.5 px-3 font-semibold">{lang === 'bn' ? 'বিস্তারিত' : 'Details'}</th>
                <th className="py-2.5 px-3 font-semibold">{lang === 'bn' ? 'সময়' : 'Timestamp'}</th>
                <th className="py-2.5 px-3 font-semibold font-mono">
                  {lang === 'bn' ? 'সিকিউরিটি হ্যাশ' : 'Integrity Hash'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono tabular-nums">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-800 dark:text-slate-200">
                    {log.targetDetails}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-2.5 px-3 text-slate-400 dark:text-slate-500 text-[11px]">
                    {log.securityHash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
