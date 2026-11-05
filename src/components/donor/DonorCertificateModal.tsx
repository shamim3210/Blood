import React, { useState } from 'react';
import { Language } from '../../types';
import { BrandLogo } from '../BrandLogo';
import { downloadRoyalCertificatePng } from '../../utils/sosAlertEngine';
import {
  Award,
  X,
  Download,
  Share2,
  Check,
  Sparkles,
  Printer,
  MessageCircle,
} from 'lucide-react';

interface DonorCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  donorName?: string;
  bloodGroup?: string;
  idCardNumber?: string;
  totalDonations?: number;
}

export const DonorCertificateModal: React.FC<DonorCertificateModalProps> = ({
  isOpen,
  onClose,
  lang,
  donorName = 'Hafizur Rahman (হাফিজুর)',
  bloodGroup = 'A+',
  idCardNumber = 'BD-2026-7821-A+',
  totalDonations = 6,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showTempStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const serialNumber = `BS-NAT-${new Date().getFullYear()}-${
    idCardNumber.replace(/[^0-9A-Z]/gi, '').slice(-8) || '782146'
  }`;
  const issueDate = new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    downloadRoyalCertificatePng({
      donorName,
      bloodGroup,
      serialNumber,
      totalDonations: Math.max(1, totalDonations),
      issueDate,
      lang,
    });
    setDownloadSuccess(true);
    showTempStatus(
      lang === 'bn'
        ? '✓ হাই-রেজোলিউশন সম্মাননা সনদপত্র (.PNG ছবি) আপনার ফোনে/পিসিতে ডাউনলোড হয়েছে!'
        : '✓ High-resolution Royal Certificate (.PNG image) downloaded to your device!'
    );
    setTimeout(() => {
      setDownloadSuccess(false);
    }, 2500);
  };

  const shareMessage = `আমি BloodSearch বাংলাদেশ থেকে একজন ভেরিফাইড রক্তদাতা (${bloodGroup}) হিসেবে "জাতীয় রক্তদাতা গৌরব সনদপত্র (Certificate of Humanitarian Honor)" অর্জন করেছি।\n\nসনদ নং: ${serialNumber}\nসর্বমোট রক্তদান: ${totalDonations} বার\n\nআপনিও রক্ত দিয়ে জীবন বাঁচান: ${window.location.origin}`;

  const handleCopyShare = () => {
    navigator.clipboard.writeText(shareMessage).catch(() => {});
    showTempStatus(
      lang === 'bn'
        ? '✓ সনদের বিবরণী ও লিংক কপি হয়েছে! এখন ফেসবুকে পেস্ট করে শেয়ার করুন।'
        : '✓ Certificate text copied! Paste and share it on your Facebook profile.'
    );
  };

  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/90 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-2xl my-2 sm:my-auto rounded-2xl sm:rounded-3xl bg-white dark:bg-[#111827] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-amber-500/40 transition-all text-left space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-500 to-amber-600 text-amber-950 flex items-center justify-center shadow-lg ring-2 ring-amber-400/40 shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                {lang === 'bn'
                  ? 'জাতীয় রক্তদাতা গৌরব সম্মাননা সনদপত্র'
                  : 'National Certificate of Humanitarian Honor'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'জরুরি রক্তদানে মানবিক অবদানের আনুষ্ঠানিক স্বীকৃতি · সরাসরি .PNG ছবি বা PDF ডাউনলোড'
                  : 'Official humanitarian citation · Download high-resolution PNG or Print PDF'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. ROYAL LUXURY CERTIFICATE CANVAS (Printable A4 / Frame Ready) */}
        <div className="w-full rounded-2xl bg-gradient-to-b from-[#fffef7] via-[#fffbf0] to-[#fff8e7] dark:from-[#0d1424] dark:via-[#090e18] dark:to-[#070b13] text-slate-900 dark:text-white p-5 sm:p-8 shadow-2xl border-8 border-double border-amber-500/70 relative overflow-hidden text-center space-y-4">
          {/* Ornate Corner Accents */}
          <div className="absolute top-2 left-2 w-7 h-7 border-t-2 border-l-2 border-amber-600 dark:border-amber-400" />
          <div className="absolute top-2 right-2 w-7 h-7 border-t-2 border-r-2 border-amber-600 dark:border-amber-400" />
          <div className="absolute bottom-2 left-2 w-7 h-7 border-b-2 border-l-2 border-amber-600 dark:border-amber-400" />
          <div className="absolute bottom-2 right-2 w-7 h-7 border-b-2 border-r-2 border-amber-600 dark:border-amber-400" />

          {/* Certificate Top Header */}
          <div className="relative z-10 space-y-1.5">
            <div className="flex justify-center pb-1">
              <BrandLogo variant="mark" size="md" />
            </div>
            <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>BLOODSEARCH BANGLADESH · NATIONAL LIFE-SAVER REGISTRY</span>
            </div>

            <div className="py-1">
              <h1 className="text-xl sm:text-3xl font-serif font-black tracking-wider text-slate-900 dark:text-amber-100 uppercase">
                {lang === 'bn' ? 'জাতীয় রক্তদাতা সম্মাননা সনদপত্র' : 'CERTIFICATE OF HUMANITARIAN HONOR'}
              </h1>
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 tracking-widest uppercase block mt-0.5">
                {lang === 'bn'
                  ? 'জীবন রক্ষাকারী নিঃস্বার্থ রক্তদানের স্বীকৃতিস্বরূপ'
                  : 'IN RECOGNITION OF SELFLESS BLOOD DONATION'}
              </span>
            </div>

            <div className="text-[11px] text-amber-800 dark:text-amber-300 font-mono font-bold">
              সনদপত্র সিরিয়াল: {serialNumber}
            </div>
          </div>

          {/* Certificate Body Text */}
          <div className="relative z-10 py-2 space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-300 italic font-serif">
              {lang === 'bn'
                ? 'অত্যন্ত কৃতজ্ঞতা, সম্মান ও জাতীয় গর্বের সাথে এই প্রশংসাপত্র প্রদান করা হচ্ছে শ্রদ্ধেয় রক্তদাতা:'
                : 'This prestigious citation of honor is proudly bestowed upon the distinguished life-saver:'}
            </p>

            {/* Recipient Hero Name */}
            <div className="py-1">
              <span className="text-2xl sm:text-3xl font-serif font-black text-rose-600 dark:text-rose-400 underline decoration-amber-500 underline-offset-8 break-words">
                {donorName}
              </span>
            </div>

            {/* Recognition Paragraph */}
            <div className="pt-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-w-lg mx-auto font-sans">
              {lang === 'bn' ? (
                <>
                  যিনি <strong>{bloodGroup}</strong> রক্তের গ্রুপের ধারক হিসেবে জরুরি মুহূর্তে স্বেচ্ছায় এগিয়ে এসে এ পর্যন্ত{' '}
                  <strong>{totalDonations} বার</strong> সফলভাবে রক্তদান করেছেন এবং অসংখ্য মুমূর্ষু রোগীর জীবন বাঁচাতে অবিস্মরণীয় অবদান রেখেছেন।
                </>
              ) : (
                <>
                  For exceptional humanitarian devotion as a regular voluntary donor of Blood Group{' '}
                  <strong>{bloodGroup}</strong>, having completed <strong>{totalDonations} verified donations</strong> to protect critical lives across Bangladesh.
                </>
              )}
            </div>

            {/* Clean Typographic Metadata Line */}
            <div className="pt-2 flex items-center justify-center flex-wrap gap-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
              <span className="text-rose-700 dark:text-rose-300">গ্রুপ: {bloodGroup}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-800 dark:text-amber-300">অবদান: {totalDonations} ব্যাগ</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 dark:text-emerald-300">স্ট্যাটাস: ভেরিফাইড হিরো</span>
            </div>
          </div>

          {/* Official Seals & Signatures */}
          <div className="relative z-10 pt-4 border-t-2 border-amber-300/70 dark:border-amber-900/60 flex items-center justify-between gap-2 text-left">
            <div className="text-center font-serif flex-1">
              <div className="text-xs font-black text-slate-800 dark:text-slate-200 border-b border-slate-400 dark:border-slate-600 pb-1 italic">
                ডা. তানভীরুল ইসলাম
              </div>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 font-sans font-bold">
                চিকিৎসা পরিচালক ও রক্ত সঞ্চালন বিশেষজ্ঞ
              </span>
              <span className="text-[8px] text-amber-700 dark:text-amber-400 font-mono">
                বাংলাদেশ স্বাস্থ্য সেবা বোর্ড
              </span>
            </div>

            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 text-amber-950 flex flex-col items-center justify-center font-black shadow-xl ring-4 ring-amber-400/30 shrink-0">
              <Award className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5]" />
              <span className="text-[8px] font-mono leading-none font-black tracking-widest mt-0.5">
                GOLD HONOR
              </span>
              <span className="text-[7px] font-mono font-bold text-amber-900">VERIFIED</span>
            </div>

            <div className="text-center font-serif flex-1">
              <div className="text-xs font-black text-slate-800 dark:text-slate-200 border-b border-slate-400 dark:border-slate-600 pb-1 italic">
                জাতীয় সমন্বয়ক পর্ষদ
              </div>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 font-sans font-bold">
                BloodSearch Bangladesh Network
              </span>
              <span className="text-[8px] text-amber-700 dark:text-amber-400 font-mono">
                ইস্যু তারিখ: {issueDate}
              </span>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleDownloadPng}
            className="min-h-[42px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer sm:col-span-2"
          >
            {downloadSuccess ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>
              {downloadSuccess
                ? lang === 'bn'
                  ? '✓ .PNG ছবি সেভ হয়েছে!'
                  : '✓ PNG Saved!'
                : lang === 'bn'
                ? 'সনদপত্র ডাউনলোড (.PNG ছবি)'
                : 'Download Certificate (.PNG)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[42px] py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-300 dark:border-slate-700"
          >
            <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>{lang === 'bn' ? 'প্রিন্ট / PDF' : 'Print / PDF'}</span>
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <a
              href={whatsappShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] py-2 px-2 rounded-xl bg-[#25D366] hover:bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
              title="WhatsApp-এ শেয়ার করুন"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WA</span>
            </a>
            <button
              type="button"
              onClick={handleCopyShare}
              className="min-h-[42px] py-2 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-bold text-xs flex items-center justify-center gap-1 border border-blue-300 dark:border-blue-800 cursor-pointer"
              title="ফেসবুকে শেয়ারের টেক্সট কপি করুন"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
              <span>FB</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
