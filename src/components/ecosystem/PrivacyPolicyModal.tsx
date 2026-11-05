import React from 'react';
import { Language } from '../../types';
import { 
  ShieldCheck, 
  X, 
  Lock, 
  FileText, 
  Phone, 
  CheckCircle2, 
  AlertTriangle, 
  HeartHandshake, 
  Award,
  Globe,
  ExternalLink
} from 'lucide-react';
import { useBrandConfig } from '../../config/brandConfig';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const brand = useBrandConfig();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-xl my-2 sm:my-auto rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-all text-left space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {lang === 'bn' ? 'গোপনীয়তা ও গুগল প্লে স্টোর পলিসি' : 'Privacy & Google Play Data Safety'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'বাণিজ্যিক মানসম্পন্ন ও আন্তর্জাতিক হেলথ অ্যাপ নীতিমালা' : 'Commercial-grade compliance & clinical data safety'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-3.5 text-xs text-slate-700 dark:text-slate-300 max-h-[70vh] overflow-y-auto pr-1">
          {/* Card 1: Google Play Health Data Safety Declaration */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Lock className="w-4 h-4 text-emerald-500" />
              <span>{lang === 'bn' ? '১. গুগল প্লে হেলথ ডাটা সুরক্ষা ঘোষণা' : '1. Google Play Health Data Safety'}</span>
            </div>
            <p className="leading-relaxed">
              {lang === 'bn'
                ? `${brand.brandName} (${brand.organizationName}) কোনো ব্যক্তিগত মেডিকেল হিস্ট্রি বা সংবেদনশীল স্বাস্থ্য তথ্য তৃতীয় পক্ষের বিজ্ঞাপন নেটওয়ার্কের সাথে শেয়ার করে না। রোগীর রক্তের চাহিদা এবং রক্তদাতার ফিটনেস তথ্য শুধুমাত্র জরুরি রক্ত সংগ্রহের উদ্দেশ্যে ব্যবহৃত হয়।`
                : `${brand.brandName} (${brand.organizationName}) does not share personal medical history or sensitive health data with third-party advertising networks. Blood group and clinical criteria are used solely for real-time emergency transfusion matching.`}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-semibold text-[11px]">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'এন্ড-টু-এন্ড এনক্রিপশন' : 'End-to-End Encrypted'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'বিজ্ঞাপনমুক্ত সেবামূলক' : 'Zero Ad Trackers'}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Phone Masking & Tamper-Proof Audit */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Phone className="w-4 h-4 text-rose-500" />
              <span>{lang === 'bn' ? '২. রক্তদাতার ফোন নম্বর সুরক্ষা ও আনমাস্কিং' : '2. Phone Number Masking & Audit Trail'}</span>
            </div>
            <p className="leading-relaxed">
              {lang === 'bn'
                ? 'রক্তদাতার গোপনীয়তা নিশ্চিত করতে মোবাইল নম্বর স্বয়ংক্রিয়ভাবে মাস্ক করা থাকে (যেমন: ০১৭১২ •••• ৭৮)। শুধুমাত্র জরুরি প্রয়োজনে সম্মতি ও অডিট ট্রেইল রেকর্ড নিশ্চিত করে ফোন নম্বর দেখা সম্ভব।'
                : 'To prevent harassment, donor phone numbers are masked by default (e.g., 01712 •••• 78). Phone reveal requests require verified purpose acknowledgment and are logged in tamper-proof security records.'}
            </p>
          </div>

          {/* Card 3: Monetization & Commercial Deployment Ready */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300">
              <Award className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{lang === 'bn' ? '৩. বাণিজ্যিক ব্যবহার ও প্লে স্টোর ডিপ্লয়মেন্ট' : '3. Commercial & Play Store Readiness'}</span>
            </div>
            <p className="text-amber-800 dark:text-amber-200 leading-relaxed">
              {lang === 'bn'
                ? 'এই প্ল্যাটফর্মটি সম্পূর্ণ সেল-রেডি এবং গুগল প্লে স্টোরে আপলোডযোগ্য। এতে রয়েছে অ্যাডমিন প্যানেল, ভেরিফাইড প্রাতিষ্ঠানিক ব্লাড ব্যাংক সাবস্ক্রিপশন এবং সিএসআর স্পন্সরশিপ সাপোর্টের প্রিমিয়াম আর্কিটেকচার।'
                : 'This application is fully production-ready for deployment or sale on Google Play Store with APK wrapping, administrative controls, institutional blood bank accounts, and commercial compliance.'}
            </p>
          </div>

          {/* Card 4: Official Emergency Bangladesh Helplines */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <HeartHandshake className="w-4 h-4 text-rose-500" />
              <span>{lang === 'bn' ? '৪. জরুরি জাতীয় হটলাইন নম্বরসমূহ' : '4. Official Emergency Bangladesh Helplines'}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <a
                href="tel:16263"
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200 hover:border-rose-400"
              >
                <span>স্বাস্থ্য বাতায়ন (Health)</span>
                <span className="font-bold text-rose-600">16263</span>
              </a>
              <a
                href="tel:999"
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200 hover:border-rose-400"
              >
                <span>জাতীয় জরুরি সেবা (Ambulance)</span>
                <span className="font-bold text-rose-600">999</span>
              </a>
              <a
                href="tel:029116563"
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200 hover:border-rose-400"
              >
                <span>রেড ক্রিসেন্ট ব্লাড ব্যাংক</span>
                <span className="font-bold text-rose-600">02-9116563</span>
              </a>
              <a
                href="tel:01714010869"
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-800 dark:text-slate-200 hover:border-rose-400"
              >
                <span>কোয়ান্টাম ব্লাড ল্যাব</span>
                <span className="font-bold text-rose-600">01714-010869</span>
              </a>
            </div>
          </div>
        </div>

        {/* Footer Button */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            Version 2.4.0 (Commercial Build)
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            {lang === 'bn' ? 'বুঝেছি ও একমত' : 'I Understand & Agree'}
          </button>
        </div>
      </div>
    </div>
  );
};
