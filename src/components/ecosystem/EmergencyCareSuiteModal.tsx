import React, { useState, useEffect, useMemo } from 'react';
import { BloodGroup, Donor, Language } from '../../types';
import { ALL_BLOOD_GROUPS } from '../../data/compatibility';
import {
  downloadIceLockScreenWallpaperPng,
  buildOfflineEmergencySmsUri,
  copyTextReliable,
} from '../../utils/sosAlertEngine';
import {
  isValidBangladeshMobilePhone,
  normalizeValidBangladeshMobileE164,
  formatBangladeshPhoneDisplay,
} from '../../utils/donorMatcher';
import {
  buildWhatsAppChatUrl,
  subscribePublicGratitudeNotes,
  createGratitudeNoteInFirestore,
  GratitudeNoteItem,
} from '../../services/bloodSearchService';
import {
  X,
  Heart,
  Activity,
  Truck,
  Smartphone,
  Apple,
  Sparkles,
  Phone,
  MessageSquare,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search,
  ShieldCheck,
  Copy,
} from 'lucide-react';

export type CareSuiteTab =
  | 'maternity'
  | 'dengue'
  | 'ambulance'
  | 'ice_wallpaper'
  | 'diet'
  | 'gratitude';

interface EmergencyCareSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  initialTab?: CareSuiteTab;
  donors: Donor[];
  onOpenSOSWizard: () => void;
}

interface StandbyDonorEntry {
  id: string;
  name: string;
  phone: string;
  bloodGroup: BloodGroup;
  relationNote: string;
}

interface MaternityPlanData {
  motherName: string;
  bloodGroup: BloodGroup;
  eddDate: string;
  hospitalName: string;
  standbyDonors: StandbyDonorEntry[];
}

interface DengueLogEntry {
  id: string;
  dateLabel: string;
  platelets: number;
  hctPercent: number;
  hemoglobin: number;
}

const DEFAULT_MATERNITY_PLAN: MaternityPlanData = {
  motherName: '',
  bloodGroup: 'O+',
  eddDate: '',
  hospitalName: '',
  standbyDonors: [],
};

const DEFAULT_DENGUE_LOGS: DengueLogEntry[] = [];

export const EmergencyCareSuiteModal: React.FC<EmergencyCareSuiteModalProps> = ({
  isOpen,
  onClose,
  lang,
  initialTab = 'maternity',
  donors,
  onOpenSOSWizard,
}) => {
  const [activeTab, setActiveTab] = useState<CareSuiteTab>(initialTab);
  const [suiteNotice, setSuiteNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const showTempNotice = (msg: string) => {
    setSuiteNotice(msg);
    window.setTimeout(() => setSuiteNotice(null), 3500);
  };

  // =========================================================================
  // TAB 1: MATERNITY DELIVERY STANDBY DONOR POOL
  // =========================================================================
  const [maternityPlan, setMaternityPlan] = useState<MaternityPlanData>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_maternity_plan');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_MATERNITY_PLAN;
  });
  const [sbName, setSbName] = useState('');
  const [sbPhone, setSbPhone] = useState('');
  const [sbGroup, setSbGroup] = useState<BloodGroup>('O+');
  const [sbNote, setSbNote] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('bloodsearch_maternity_plan', JSON.stringify(maternityPlan));
    } catch {}
  }, [maternityPlan]);

  const eddDaysRemaining = useMemo(() => {
    if (!maternityPlan.eddDate) return null;
    const ms = Date.parse(`${maternityPlan.eddDate}T09:00:00`);
    if (Number.isNaN(ms)) return null;
    return Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000));
  }, [maternityPlan.eddDate]);

  const isMotherRhNegative = maternityPlan.bloodGroup.endsWith('-');

  const handleAddStandbyDonor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbName.trim() || !sbPhone.trim()) return;
    const normalizedPhone = normalizeValidBangladeshMobileE164(sbPhone);
    if (!normalizedPhone || !isValidBangladeshMobilePhone(sbPhone)) {
      showTempNotice(
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের সচল বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 01712345678)।'
          : 'Please enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).'
      );
      return;
    }
    const newEntry: StandbyDonorEntry = {
      id: `sb_${Date.now()}`,
      name: sbName.trim(),
      phone: normalizedPhone,
      bloodGroup: sbGroup,
      relationNote: sbNote.trim() || (lang === 'bn' ? 'স্ট্যান্ডবাই রক্তদাতা' : 'Standby donor'),
    };
    setMaternityPlan((prev) => ({
      ...prev,
      standbyDonors: [newEntry, ...prev.standbyDonors].slice(0, 8),
    }));
    setSbName('');
    setSbPhone('');
    setSbNote('');
    showTempNotice(
      lang === 'bn'
        ? '✓ ডেলিভারি স্ট্যান্ডবাই ডোনার পুলে যুক্ত হয়েছে!'
        : '✓ Added to Maternity Standby Pool!'
    );
  };

  // =========================================================================
  // TAB 2: DENGUE PLATELET & CBC DANGER TRACKER
  // =========================================================================
  const [dengueLogs, setDengueLogs] = useState<DengueLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_dengue_logs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_DENGUE_LOGS;
  });
  const [pltInput, setPltInput] = useState('35000');
  const [hctInput, setHctInput] = useState('46');
  const [hbInput, setHbInput] = useState('12.2');

  useEffect(() => {
    try {
      localStorage.setItem('bloodsearch_dengue_logs', JSON.stringify(dengueLogs));
    } catch {}
  }, [dengueLogs]);

  const latestDengue = dengueLogs[dengueLogs.length - 1] || {
    platelets: 150000,
    hctPercent: 40,
    hemoglobin: 13,
    dateLabel: '-',
  };

  const handleAddDengueLog = (e: React.FormEvent) => {
    e.preventDefault();
    const pVal = Math.max(1000, Math.min(800000, Number(pltInput) || 50000));
    const hctVal = Math.max(15, Math.min(70, Number(hctInput) || 42));
    const hbVal = Math.max(3, Math.min(22, Number(hbInput) || 12));
    const entry: DengueLogEntry = {
      id: `dl_${Date.now()}`,
      dateLabel: new Date().toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      platelets: pVal,
      hctPercent: hctVal,
      hemoglobin: hbVal,
    };
    setDengueLogs((prev) => [...prev.slice(-7), entry]);
    showTempNotice(
      lang === 'bn'
        ? `✓ সিবিসি রিপোর্ট সেভ হয়েছে (প্লাটিলেট: ${pVal.toLocaleString()})`
        : `✓ CBC report logged (${pVal.toLocaleString()} /µL)`
    );
  };

  // =========================================================================
  // TAB 3: AMBULANCE FAIR FARE CALCULATOR + ICU/OXYGEN + GOVT BLOOD FEE CHART
  // =========================================================================
  const [ambDistanceKm, setAmbDistanceKm] = useState<number>(25);
  const [ambType, setAmbType] = useState<'NON_AC' | 'AC' | 'ICU' | 'FREEZER'>('AC');

  const estimatedFareRange = useMemo(() => {
    const rates = {
      NON_AC: { base: 800, perKm: 32 },
      AC: { base: 1200, perKm: 45 },
      ICU: { base: 3500, perKm: 95 },
      FREEZER: { base: 2200, perKm: 65 },
    };
    const r = rates[ambType];
    const min = Math.round((r.base + ambDistanceKm * r.perKm) / 50) * 50;
    const max = Math.round((min * 1.18) / 50) * 50;
    return { min, max };
  }, [ambDistanceKm, ambType]);

  // =========================================================================
  // TAB 4: LOCK-SCREEN MEDICAL ID (.PNG) WALLPAPER GENERATOR
  // =========================================================================
  const [iceName, setIceName] = useState(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) return JSON.parse(raw)?.name || '';
    } catch {}
    return '';
  });
  const [iceGroup, setIceGroup] = useState<BloodGroup>(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) return JSON.parse(raw)?.bloodGroup || 'B+';
    } catch {}
    return 'B+';
  });
  const [iceGuardian, setIceGuardian] = useState('');
  const [icePhone, setIcePhone] = useState(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) {
        const p = JSON.parse(raw)?.phone;
        if (p && isValidBangladeshMobilePhone(p)) return p;
      }
    } catch {}
    return '';
  });
  const [iceSecondPhone, setIceSecondPhone] = useState('');
  const [iceConditions, setIceConditions] = useState('কোনো দীর্ঘমেয়াদী রোগ নেই');
  const [iceAllergies, setIceAllergies] = useState('কোনো ওষুধ অ্যালার্জি নেই');
  const [iceDistrict, setIceDistrict] = useState('ঢাকা, বাংলাদেশ');

  // =========================================================================
  // TAB 6: PATIENT GRATITUDE WALL + SMART DONOR ID VERIFIER
  // =========================================================================
  const [gratitudeNotes, setGratitudeNotes] = useState<GratitudeNoteItem[]>([]);
  const [gratAuthor, setGratAuthor] = useState('');
  const [gratDonor, setGratDonor] = useState('');
  const [gratGroup, setGratGroup] = useState<BloodGroup>('O+');
  const [gratHospital, setGratHospital] = useState('');
  const [gratMessage, setGratMessage] = useState('');
  const [isPostingGratitude, setIsPostingGratitude] = useState(false);

  const [verifyIdQuery, setVerifyIdQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribePublicGratitudeNotes(setGratitudeNotes);
    } catch {}
    return () => {
      if (unsub) unsub();
    };
  }, [isOpen]);

  const verifiedDonorMatch = useMemo(() => {
    const q = verifyIdQuery.trim().toLowerCase();
    if (q.length < 2) return null;
    return (
      donors.find(
        (d) =>
          d.id.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.phone.replace(/[^0-9]/g, '').includes(q.replace(/[^0-9]/g, ''))
      ) || null
    );
  }, [verifyIdQuery, donors]);

  const handlePostGratitude = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gratDonor.trim() || !gratMessage.trim() || isPostingGratitude) return;
    setIsPostingGratitude(true);
    try {
      const res = await createGratitudeNoteInFirestore({
        authorName: gratAuthor.trim() || 'রোগীর কৃতজ্ঞ পরিবার',
        donorName: gratDonor.trim(),
        bloodGroup: gratGroup,
        hospitalName: gratHospital.trim() || 'হাসপাতাল ব্লাড ইউনিট',
        message: gratMessage.trim(),
      });
      if (!res.syncedToCloud) {
        setGratitudeNotes((prev) => [res.note, ...prev]);
      }
      setGratDonor('');
      setGratHospital('');
      setGratMessage('');
      showTempNotice(
        lang === 'bn'
          ? '✓ আপনার কৃতজ্ঞতা ও দোয়া বার্তা প্রকাশিত হয়েছে!'
          : '✓ Your gratitude note has been posted!'
      );
    } catch (err: any) {
      showTempNotice(err?.message || 'বার্তা পাঠাতে সমস্যা হয়েছে');
    } finally {
      setIsPostingGratitude(false);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: CareSuiteTab; labelBn: string; labelEn: string; icon: React.ReactNode }[] = [
    {
      id: 'maternity',
      labelBn: 'মাতৃত্ব স্ট্যান্ডবাই',
      labelEn: 'Maternity Pool',
      icon: <Heart className="w-3.5 h-3.5" />,
    },
    {
      id: 'dengue',
      labelBn: 'ডেঙ্গু প্লাটিলেট',
      labelEn: 'Dengue Monitor',
      icon: <Activity className="w-3.5 h-3.5" />,
    },
    {
      id: 'ambulance',
      labelBn: 'অ্যাম্বুলেন্স ও ফি চার্ট',
      labelEn: 'Ambulance & Fees',
      icon: <Truck className="w-3.5 h-3.5" />,
    },
    {
      id: 'ice_wallpaper',
      labelBn: 'লক-স্ক্রিন কার্ড',
      labelEn: 'ICE Lock Card',
      icon: <Smartphone className="w-3.5 h-3.5" />,
    },
    {
      id: 'diet',
      labelBn: 'ডায়েট ও রমজান গাইড',
      labelEn: 'Diet & Fasting',
      icon: <Apple className="w-3.5 h-3.5" />,
    },
    {
      id: 'gratitude',
      labelBn: 'কৃতজ্ঞতা ও আইডি যাচাই',
      labelEn: 'Gratitude & Verify',
      icon: <Sparkles className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-3xl my-2 sm:my-auto rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 text-left space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
              {lang === 'bn'
                ? 'বাংলাদেশ ইমার্জেন্সি মেডিকেল টুলকিট'
                : 'BANGLADESH EMERGENCY MEDICAL SUITE'}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug">
              {lang === 'bn'
                ? 'মাতৃত্ব সুরক্ষা, ডেঙ্গু ট্র্যাকার, অ্যাম্বুলেন্স ভাড়া ও আইডি হাব'
                : 'Maternity Pool, Dengue Tracker, Fair Fare & ICE Hub'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none p-1 rounded-xl bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800">
          {tabs.map((tb) => {
            const active = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setActiveTab(tb.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {tb.icon}
                <span>{lang === 'bn' ? tb.labelBn : tb.labelEn}</span>
              </button>
            );
          })}
        </div>

        {suiteNotice && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold">
            {suiteNotice}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 1: MATERNITY DELIVERY STANDBY POOL & RH ANTI-D GUIDE            */}
        {/* =================================================================== */}
        {activeTab === 'maternity' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'গর্ভবতী মায়ের ডেলিভারি স্ট্যান্ডবাই ডোনার প্ল্যানার'
                    : 'Safe Delivery Standby Donor Planner'}
                </h3>
                {eddDaysRemaining !== null && (
                  <span className="text-xs font-bold font-mono text-rose-700 dark:text-rose-300">
                    {eddDaysRemaining >= 0
                      ? lang === 'bn'
                        ? `সম্ভাব্য ডেলিভারির বাকি: ${eddDaysRemaining} দিন`
                        : `${eddDaysRemaining} days until EDD`
                      : lang === 'bn'
                      ? 'ডেলিভারি সময় উপস্থিত!'
                      : 'Delivery window active!'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {lang === 'bn'
                  ? 'সিজারিয়ান বা নরমাল ডেলিভারির সময় হঠাৎ রক্তক্ষরণ (PPH) সামলাতে আগে থেকেই অন্তত ২-৩ জন ম্যাচিং রক্তদাতা স্ট্যান্ডবাই রাখুন, যাতে শেষ মুহূর্তে হাসপাতালে ছোটাছুটি করতে না হয়।'
                  : 'Keep 2–3 pre-matched donors ready before expected delivery date to prevent postpartum hemorrhage emergencies.'}
              </p>
            </div>

            {/* Mother Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'গর্ভবতী মায়ের নাম' : 'Mother Name'}
                </label>
                <input
                  name="maternityMotherName"
                  type="text"
                  value={maternityPlan.motherName}
                  onChange={(e) =>
                    setMaternityPlan((p) => ({ ...p, motherName: e.target.value }))
                  }
                  placeholder={lang === 'bn' ? 'যেমন: ফারহানা ইয়াসমিন' : 'Mother full name'}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {lang === 'bn' ? 'রক্তের গ্রুপ' : 'Blood Group'}
                  </label>
                  <select
                    name="maternityBloodGroup"
                    value={maternityPlan.bloodGroup}
                    onChange={(e) =>
                      setMaternityPlan((p) => ({
                        ...p,
                        bloodGroup: e.target.value as BloodGroup,
                      }))
                    }
                    className="w-full h-10 px-2.5 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  >
                    {ALL_BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {lang === 'bn' ? 'সম্ভাব্য তারিখ (EDD)' : 'Expected Date'}
                  </label>
                  <input
                    name="maternityEddDate"
                    type="date"
                    value={maternityPlan.eddDate}
                    onChange={(e) =>
                      setMaternityPlan((p) => ({ ...p, eddDate: e.target.value }))
                    }
                    className="w-full h-10 px-2 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Rh-Negative Anti-D Critical Medical Alert */}
            {isMotherRhNegative && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-1 text-xs">
                <div className="font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? `জরুরি সতর্কতা: মায়ের রক্ত নেগেটিভ (${maternityPlan.bloodGroup}) — Anti-D ইনজেকশন গাইড`
                      : `Rh-Negative Mother (${maternityPlan.bloodGroup}) — Anti-D Injection Alert`}
                  </span>
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  {lang === 'bn'
                    ? 'মা নেগেটিভ এবং বাবা পজিটিভ হলে গর্ভের ২৮ সপ্তাহে এবং সন্তান জন্মের ৭২ ঘণ্টার মধ্যে গাইনোকোলজিস্টের পরামর্শে অবশ্যই Anti-D (Rhogam) ইনজেকশন নিশ্চিত করুন এবং অন্তত ২ জন নেগেটিভ ডোনার আগে থেকে বুক রাখুন।'
                    : 'Consult your obstetrician regarding routine 28-week and post-delivery (within 72h) Anti-D Immunoglobulin prophylaxis, and secure 2 Rh-negative donors early.'}
                </p>
              </div>
            )}

            {/* Add Standby Donor Form */}
            <form
              onSubmit={handleAddStandbyDonor}
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
            >
              <div className="font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? '+ নতুন স্ট্যান্ডবাই রক্তদাতা যুক্ত করুন'
                  : '+ Add Standby Delivery Donor'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  name="standbyDonorName"
                  type="text"
                  required
                  value={sbName}
                  onChange={(e) => setSbName(e.target.value)}
                  placeholder={lang === 'bn' ? 'ডোনারের নাম' : 'Donor Name'}
                  className="h-10 px-3 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  name="standbyDonorPhone"
                  type="tel"
                  required
                  value={sbPhone}
                  onChange={(e) => setSbPhone(e.target.value)}
                  placeholder="+88017XXXXXXXX"
                  className="h-10 px-3 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                />
                <select
                  name="standbyDonorGroup"
                  value={sbGroup}
                  onChange={(e) => setSbGroup(e.target.value as BloodGroup)}
                  className="h-10 px-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                >
                  {ALL_BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="h-10 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'যুক্ত করুন' : 'Add'}</span>
                </button>
              </div>
            </form>

            {/* Standby Donors List */}
            <div className="space-y-2">
              {maternityPlan.standbyDonors.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'এখনও কোনো স্ট্যান্ডবাই রক্তদাতা যোগ করা হয়নি। উপরের ফর্মে প্রকৃত রক্তদাতার নাম ও ১১ ডিজিটের মোবাইল নম্বর যোগ করুন।'
                    : 'No standby donors added yet. Add real standby donors with their 11-digit mobile numbers above.'}
                </div>
              ) : (
                maternityPlan.standbyDonors.map((d) => {
                  const hospLabel = maternityPlan.hospitalName || 'হাসপাতাল';
                  const smsLink = buildOfflineEmergencySmsUri(
                    d.phone,
                    `আসসালামু আলাইকুম ${d.name}, জরুরি ডেলিভারির জন্য হাসপাতালে (${hospLabel}) আপনার ${d.bloodGroup} রক্ত প্রয়োজন। অনুগ্রহ করে যোগাযোগ করুন।`
                  );
                  return (
                    <div
                      key={d.id}
                      className="p-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-rose-600 text-white font-black flex items-center justify-center shrink-0">
                          {d.bloodGroup}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {d.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                            {formatBangladeshPhoneDisplay(d.phone)} · {d.relationNote}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await copyTextReliable(d.phone);
                            showTempNotice(
                              lang === 'bn' ? '✓ নম্বর কপি হয়েছে!' : '✓ Phone copied!'
                            );
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`tel:${d.phone.replace(/[^0-9+]/g, '')}`}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold inline-flex items-center gap-1"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                        </a>
                        <a
                          href={smsLink}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-800 text-white font-bold inline-flex items-center gap-1"
                        >
                          <span>SMS</span>
                        </a>
                        <a
                          href={buildWhatsAppChatUrl(
                            d.phone,
                            `আসসালামু আলাইকুম ${d.name}, ডেলিভারি স্ট্যান্ডবাই রক্তদাতা হিসেবে আপনাকে স্মরণ করিয়ে দিচ্ছি (${hospLabel})।`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold inline-flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WA</span>
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setMaternityPlan((p) => ({
                              ...p,
                              standbyDonors: p.standbyDonors.filter((x) => x.id !== d.id),
                            }))
                          }
                          className="min-h-[36px] min-w-[36px] rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center cursor-pointer"
                          aria-label="Remove standby donor"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: DENGUE PLATELET & CBC DANGER MONITOR                         */}
        {/* =================================================================== */}
        {activeTab === 'dengue' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 block">
                  {lang === 'bn' ? 'সর্বশেষ প্লাটিলেট কাউন্ট' : 'Latest Platelet Count'}
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                  {latestDengue.platelets.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">/µL</span>
                </div>
                <div className="text-xs font-bold mt-1">
                  {latestDengue.platelets < 20000 ? (
                    <span className="text-red-600 dark:text-red-400">
                      🚨 ক্রিটিক্যাল বিপদ সীমা (&lt;20,000) — দ্রুত ডাক্তারের পরামর্শে SDP/RDP প্লাটিলেট প্রস্তুত রাখুন!
                    </span>
                  ) : latestDengue.platelets < 50000 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      ⚠ হাসপাতাল পর্যবেক্ষণ সীমা (&lt;50,000) — রক্তক্ষরণ লক্ষণ ও HCT % নিয়মিত মনিটর করুন।
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ স্থিতিশীল সীমা — প্রচুর তরল খাবার (ওরস্যালাইন, ডাবের পানি) চালিয়ে যান।
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSOSWizard();
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer shadow-sm"
              >
                {lang === 'bn' ? '🆘 জরুরি প্লাটিলেট SOS পাঠান' : '🆘 Request SDP Platelet SOS'}
              </button>
            </div>

            {/* Log New CBC Entry */}
            <form
              onSubmit={handleAddDengueLog}
              className="p-3.5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
            >
              <div className="font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'নতুন সিবিসি (CBC) রিপোর্ট লগ করুন:' : 'Log Latest CBC Report:'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Platelets (/µL)</label>
                  <input
                    name="denguePlatelets"
                    type="number"
                    required
                    value={pltInput}
                    onChange={(e) => setPltInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Hematocrit (HCT %)</label>
                  <input
                    name="dengueHct"
                    type="number"
                    step="0.1"
                    value={hctInput}
                    onChange={(e) => setHctInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Hemoglobin (g/dL)</label>
                  <input
                    name="dengueHemoglobin"
                    type="number"
                    step="0.1"
                    value={hbInput}
                    onChange={(e) => setHbInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  >
                    {lang === 'bn' ? '+ রিপোর্ট যোগ করুন' : '+ Save CBC'}
                  </button>
                </div>
              </div>
            </form>

            {/* History Table */}
            {dengueLogs.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'এখনও কোনো সিবিসি (CBC) রিপোর্ট লগ করা হয়নি। উপরের ফর্মে রোগীর প্লাটিলেট কাউন্ট লিখে "+ রিপোর্ট যোগ করুন" বাটনে ক্লিক করুন।'
                  : 'No CBC reports logged yet. Enter the patient’s platelet count above and tap "+ Save CBC".'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                {dengueLogs.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-white dark:bg-[#0f172a] flex items-center justify-between gap-2 font-mono tabular-nums"
                  >
                    <span className="font-sans font-semibold text-slate-700 dark:text-slate-300">
                      {item.dateLabel}
                    </span>
                    <span
                      className={`font-bold ${
                        item.platelets < 20000
                          ? 'text-red-600'
                          : item.platelets < 50000
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      PLT: {item.platelets.toLocaleString()}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">HCT: {item.hctPercent}%</span>
                    <span className="text-slate-600 dark:text-slate-400">Hb: {item.hemoglobin}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: AMBULANCE FARE, ICU/OXYGEN & OFFICIAL BLOOD SCREENING FEES   */}
        {/* =================================================================== */}
        {activeTab === 'ambulance' && (
          <div className="space-y-4 text-xs">
            {/* Fair Fare Calculator */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'অ্যাম্বুলেন্স ন্যায্য ভাড়া ক্যালকুলেটর (সিন্ডিকেট প্রতিরোধে)'
                      : 'Fair Ambulance Fare Estimator'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {lang === 'bn'
                      ? 'হাসপাতাল দালালদের অতিরিক্ত ভাড়া দাবি যাচাই করতে দূরত্ব ও ধরন নির্বাচন করুন'
                      : 'Estimate standard Bangladesh ambulance fare by distance & life-support tier'}
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] text-slate-500 block">সম্ভাব্য ন্যায্য ভাড়া</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    ৳{estimatedFareRange.min.toLocaleString()} – ৳{estimatedFareRange.max.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'NON_AC', label: 'Non-AC সাধারণ' },
                  { id: 'AC', label: 'AC অ্যাম্বুলেন্স' },
                  { id: 'ICU', label: 'Cardiac / ICU ভ্যান' },
                  { id: 'FREEZER', label: 'ফ্রিজার ভ্যান' },
                ].map((tItem) => (
                  <button
                    key={tItem.id}
                    type="button"
                    onClick={() => setAmbType(tItem.id as any)}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-xl font-bold cursor-pointer border ${
                      ambType === tItem.id
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span>{lang === 'bn' ? 'দূরত্ব (কিলোমিটার)' : 'Distance (km)'}</span>
                  <span className="font-mono text-rose-600">{ambDistanceKm} km</span>
                </div>
                <input
                  name="ambulanceDistanceKm"
                  type="range"
                  min={5}
                  max={350}
                  step={5}
                  value={ambDistanceKm}
                  onChange={(e) => setAmbDistanceKm(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Official Blood Screening & Cross-Matching Fee Reference */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="font-black text-sm text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'সরকারি ও অনুমোদিত ব্লাড স্ক্রিনিং / ক্রস-ম্যাচিং নির্ধারিত ফি চার্ট:'
                  : 'Official Blood Screening & Cross-Match Fee Reference:'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300">
                    সরকারি মেডিকেল কলেজ হাসপাতাল
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
                    ৳২৫০ – ৳৫০০
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    ৫টি বাধ্যতামূলক টেস্ট ও ব্যাগ চার্জ (সন্ধানী/মেডিসিন ক্লাবে অনেক ক্ষেত্রে আরও কম)
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                  <div className="font-bold text-blue-800 dark:text-blue-300">
                    রেড ক্রিসেন্ট ও কোয়ান্টাম ল্যাব
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
                    ৳৪৫০ – ৳১,১০০
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    PRBC / FFP / Whole Blood প্রসেসিং ও কম্পোনেন্ট সেপারেশন চার্জ
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <div className="font-bold text-amber-800 dark:text-amber-300">
                    প্রাইভেট হাসপাতাল ও SDP প্লাটিলেট
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
                    ৳১,২০০ – ৳২,৫০০+
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    সাধারণ ক্রস-ম্যাচ ১.২–২.৫ হাজার; অ্যাফেরেসিস কিট আলাদা (সরকারি হাসপাতালে কম)
                  </p>
                </div>
              </div>
            </div>

            {/* 24/7 ICU, NICU & Oxygen Direct Dial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { name: 'জাতীয় জরুরি অ্যাম্বুলেন্স ও পুলিশ সহায়তা', phone: '999' },
                { name: 'স্বাস্থ্য বাতায়ন ২৪/৭ ICU ও ডাক্তার পরামর্শ', phone: '16263' },
                { name: 'কোয়ান্টাম ল্যাব ২৪/৭ ব্লাড ও কম্পোনেন্ট হটলাইন', phone: '+8801714010869' },
                { name: 'রেড ক্রিসেন্ট কেন্দ্রীয় ব্লাড ব্যাংক (ঢাকা)', phone: '+880248110184' },
              ].map((h) => (
                <a
                  key={h.phone}
                  href={`tel:${h.phone}`}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 hover:border-rose-500"
                >
                  <span className="font-bold text-slate-900 dark:text-white">{h.name}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold shrink-0">
                    ☎ {h.phone}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: ICE LOCK-SCREEN MEDICAL WALLPAPER (.PNG)                     */}
        {/* =================================================================== */}
        {activeTab === 'ice_wallpaper' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-sm">
                  {lang === 'bn'
                    ? 'মোবাইল লক-স্ক্রিন জরুরি মেডিকেল কার্ড (1080×1920 HD .PNG)'
                    : 'Phone Lock-Screen Emergency Medical Wallpaper'}
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {lang === 'bn'
                    ? 'রাস্তায় দুর্ঘটনা বা অচেতন অবস্থায় ফোন আনলক না করেই যেন যে কেউ আপনার রক্তের গ্রুপ ও অভিভাবকের নম্বর দেখতে পান।'
                    : 'Allows paramedics & bystanders to read your Blood Group & ICE Guardian phone without unlocking your phone.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  downloadIceLockScreenWallpaperPng({
                    fullName: iceName,
                    bloodGroup: iceGroup,
                    guardianName: iceGuardian,
                    guardianPhone: icePhone,
                    secondaryPhone: iceSecondPhone,
                    medicalConditions: iceConditions,
                    allergies: iceAllergies,
                    district: iceDistrict,
                  });
                  showTempNotice(
                    lang === 'bn'
                      ? '✓ আপনার HD লক-স্ক্রিন ওয়ালপেপার (.PNG) ডাউনলোড হয়েছে!'
                      : '✓ Lock-Screen ICE Wallpaper (.PNG) downloaded!'
                  );
                }}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{lang === 'bn' ? '.PNG ওয়ালপেপার ডাউনলোড' : 'Download .PNG'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  আপনার পূর্ণ নাম
                </label>
                <input
                  name="iceFullName"
                  type="text"
                  value={iceName}
                  onChange={(e) => setIceName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    রক্তের গ্রুপ
                  </label>
                  <select
                    name="iceBloodGroup"
                    value={iceGroup}
                    onChange={(e) => setIceGroup(e.target.value as BloodGroup)}
                    className="w-full h-10 px-2.5 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  >
                    {ALL_BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    জেলা / ঠিকানা
                  </label>
                  <input
                    name="iceDistrict"
                    type="text"
                    value={iceDistrict}
                    onChange={(e) => setIceDistrict(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  জরুরি অভিভাবকের নাম ও সম্পর্ক
                </label>
                <input
                  name="iceGuardianName"
                  type="text"
                  value={iceGuardian}
                  onChange={(e) => setIceGuardian(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    জরুরি মোবাইল নম্বর
                  </label>
                  <input
                    name="iceGuardianPhone"
                    type="tel"
                    value={icePhone}
                    onChange={(e) => setIcePhone(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    বিকল্প নম্বর (ঐচ্ছিক)
                  </label>
                  <input
                    name="iceSecondPhone"
                    type="tel"
                    value={iceSecondPhone}
                    onChange={(e) => setIceSecondPhone(e.target.value)}
                    placeholder="+88018..."
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  রোগের তথ্য (ডায়াবেটিস / অ্যাজমা / প্রেসার)
                </label>
                <input
                  name="iceConditions"
                  type="text"
                  value={iceConditions}
                  onChange={(e) => setIceConditions(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  ওষুধ বা খাবারে অ্যালার্জি
                </label>
                <input
                  name="iceAllergies"
                  type="text"
                  value={iceAllergies}
                  onChange={(e) => setIceAllergies(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: 7-DAY RECOVERY DIET & RAMADAN FASTING DONATION GUIDE         */}
        {/* =================================================================== */}
        {activeTab === 'diet' && (
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-1.5">
                <div className="font-black text-emerald-900 dark:text-emerald-200">
                  ১. রক্তদানের প্রথম ২৪ ঘণ্টা (ফ্লুইড রিকভারি)
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  রক্ত দেওয়ার পর ১০-১৫ মিনিট শুয়ে বিশ্রাম নিন। অন্তত ৮-১০ গ্লাস পানি, ডাবের পানি, ফলের রস বা ওরস্যালাইন পান করুন। ৪ ঘণ্টা ভারী ওজন তোলা বা ধূমপান এড়িয়ে চলুন।
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-1.5">
                <div className="font-black text-rose-900 dark:text-rose-200">
                  ২. ৭ দিনের হিমোগ্লোবিন ও আয়রন ডায়েট (দেশি খাবার)
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  কচুশাক, পালংশাক, ডালিম/বেদানা, খেজুর, কিসমিস, কলিজা, শিং-মাগুর মাছ ও ডিম খান। খাবারের সাথে এক টুকরো লেবু (Vitamin-C) খেলে আয়রন শোষণ ৩ গুণ বাড়ে!
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1.5">
                <div className="font-black text-amber-900 dark:text-amber-200">
                  ৩. সতর্কতা: খাবারের পরপরই চা/কফি পান নিষেধ
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  দুপুর বা রাতের খাবারের অন্তত ১ ঘণ্টা আগে ও পরে চা বা কফি পান করবেন না—চায়ে থাকা ট্যানিন খাবারের আয়রন শরীরে শোষিত হতে বাধা দেয়।
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-1.5">
                <div className="font-black text-blue-900 dark:text-blue-200">
                  ৪. পবিত্র রমজান ও রোজা অবস্থায় রক্তদান গাইড
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  ইফতারের ৩০-৪৫ মিনিট পর থেকে তারাবির পর পর্যন্ত রক্ত দেওয়ার সবচেয়ে নিরাপদ সময়। সেহরিতে পর্যাপ্ত পানি ও খেজুর খান; দিনের বেলায় একান্ত জীবন-মরণ জরুরি না হলে ইফতারের পর রক্ত দিন।
                </p>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: PATIENT GRATITUDE WALL & SMART DONOR ID VERIFIER             */}
        {/* =================================================================== */}
        {activeTab === 'gratitude' && (
          <div className="space-y-4 text-xs">
            {/* Smart Donor ID Checker */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {lang === 'bn'
                    ? 'স্মার্ট ডোনার আইডি / নাম যাচাই করুন'
                    : 'Verify Smart Donor ID or Name'}
                </span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  name="verifyDonorIdQuery"
                  type="text"
                  value={verifyIdQuery}
                  onChange={(e) => setVerifyIdQuery(e.target.value)}
                  placeholder={
                    lang === 'bn'
                      ? 'ডোনারের নাম বা আইডি লিখুন (যেমন: কামাল / তানভীর)...'
                      : 'Enter Donor Name or Smart ID...'
                  }
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              {verifyIdQuery.trim().length >= 2 && (
                <div>
                  {verifiedDonorMatch ? (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-black text-emerald-800 dark:text-emerald-300">
                          ✓ নিবন্ধিত রক্তদাতা: {verifiedDonorMatch.name} ({verifiedDonorMatch.bloodGroup})
                        </span>
                        <span className="block text-[11px] text-slate-600 dark:text-slate-400">
                          মোট রক্তদান: {verifiedDonorMatch.totalDonations} বার · জেলা:{' '}
                          {verifiedDonorMatch.district}
                        </span>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                      এই নামে বা আইডিতে কোনো পাবলিক ডোনার কার্ড পাওয়া যায়নি।
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Post Gratitude Note Form */}
            <form
              onSubmit={handlePostGratitude}
              className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 space-y-2.5"
            >
              <div className="font-black text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? '🤲 রক্তদাতার প্রতি কৃতজ্ঞতা ও দোয়া বার্তা লিখুন'
                  : '🤲 Post a Gratitude & Blessing Note for a Donor'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  name="gratitudeAuthor"
                  type="text"
                  value={gratAuthor}
                  onChange={(e) => setGratAuthor(e.target.value)}
                  placeholder={lang === 'bn' ? 'আপনার নাম (রোগীর স্বজন)' : 'Your Name'}
                  className="h-9 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  name="gratitudeDonorName"
                  type="text"
                  required
                  value={gratDonor}
                  onChange={(e) => setGratDonor(e.target.value)}
                  placeholder={lang === 'bn' ? 'রক্তদাতার নাম *' : 'Donor Name *'}
                  className="h-9 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <select
                    name="gratitudeBloodGroup"
                    value={gratGroup}
                    onChange={(e) => setGratGroup(e.target.value as BloodGroup)}
                    className="w-20 h-9 px-2 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  >
                    {ALL_BLOOD_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <input
                    name="gratitudeHospital"
                    type="text"
                    value={gratHospital}
                    onChange={(e) => setGratHospital(e.target.value)}
                    placeholder={lang === 'bn' ? 'হাসপাতাল' : 'Hospital'}
                    className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white min-w-0"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  name="gratitudeMessage"
                  type="text"
                  required
                  value={gratMessage}
                  onChange={(e) => setGratMessage(e.target.value)}
                  placeholder={
                    lang === 'bn'
                      ? 'আপনার দোয়া ও অনুভূতির কথা লিখুন...'
                      : 'Write your thank-you message...'
                  }
                  className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={isPostingGratitude}
                  className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer shrink-0"
                >
                  {isPostingGratitude
                    ? lang === 'bn'
                      ? 'প্রকাশ হচ্ছে...'
                      : 'Posting...'
                    : lang === 'bn'
                    ? 'প্রকাশ করুন'
                    : 'Publish'}
                </button>
              </div>
            </form>

            {/* Gratitude Notes Feed */}
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {gratitudeNotes.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-rose-600 dark:text-rose-400">
                      রক্তযোদ্ধা: {n.donorName} ({n.bloodGroup})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {n.hospitalName} · {n.timeLabel}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    &ldquo;{n.message}&rdquo;
                  </p>
                  <div className="text-[11px] text-slate-500 font-semibold">
                    — {n.authorName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
