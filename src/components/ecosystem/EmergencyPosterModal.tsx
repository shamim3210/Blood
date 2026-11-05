import React, { useState } from 'react';
import { BloodRequest, BloodGroup, Language } from '../../types';
import { ALL_BLOOD_GROUPS } from '../../data/compatibility';
import { downloadEmergencyPosterPng } from '../../utils/sosAlertEngine';
import {
  Share2,
  X,
  Download,
  Copy,
  Check,
  Phone,
  MapPin,
  Hospital,
  QrCode,
  ShieldCheck,
  Flame,
} from 'lucide-react';

interface EmergencyPosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  initialRequest?: BloodRequest | null;
}

export const EmergencyPosterModal: React.FC<EmergencyPosterModalProps> = ({
  isOpen,
  onClose,
  lang,
  initialRequest,
}) => {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(initialRequest?.bloodGroup || 'O-');
  const [patientName, setPatientName] = useState(initialRequest?.patientName || 'রোকেয়া বেগম');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(initialRequest?.unitsNeeded || 2);
  const [hospitalName, setHospitalName] = useState(
    initialRequest?.hospitalName || 'ঢাকা মেডিকেল কলেজ হাসপাতাল'
  );
  const [location, setLocation] = useState(
    initialRequest ? `${initialRequest.upazila}, ${initialRequest.district}` : 'শাহবাগ, ঢাকা'
  );
  const [contactPhone, setContactPhone] = useState(
    initialRequest?.contactPhone || '01712-345678'
  );
  const [requiredDate, setRequiredDate] = useState(
    initialRequest?.requiredDate || 'আজ জরুরি ভিত্তিতে'
  );
  const [reason, setReason] = useState(
    initialRequest?.reason || 'জরুরি সার্জারি ও সিজারিয়ান ডেলিভারি'
  );

  const [copied, setCopied] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(false);

  if (!isOpen) return null;

  const shareText = `🚨 *জরুরি রক্তের আবেদন (Emergency Blood Needed)* 🚨
🩸 রক্তের গ্রুপ: *${bloodGroup}* (${unitsNeeded} ব্যাগ)
🏥 হাসপাতাল: *${hospitalName}*
📍 অবস্থান: *${location}*
📅 প্রয়োজন: *${requiredDate}*
⚠️ কারণ: *${reason}*
📞 যোগাযোগ: *${contactPhone}*

সরাসরি রক্ত দিতে বা লাইভ ট্র্যাকিং করতে ভিজিট করুন: ${window.location.origin}`;

  const handleCopyText = () => {
    navigator.clipboard.writeText(shareText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadRealPng = () => {
    downloadEmergencyPosterPng({
      bloodGroup,
      unitsNeeded,
      patientName,
      hospitalName,
      location,
      contactPhone,
      requiredDate,
      reason,
    });
    setDownloadNotice(true);
    setTimeout(() => setDownloadNotice(false), 3200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/85 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-lg my-2 sm:my-auto rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-colors text-left space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'জরুরি রক্তের সোশ্যাল মিডিয়া পোস্টার (.PNG)'
                  : 'Emergency Blood Poster (.PNG)'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'ফেসবুক, হোয়াটসঅ্যাপ ও মেসেঞ্জারে শেয়ারের জন্য ১০৮০×১০৮০ HD পোস্টার'
                  : 'Download crisp 1080×1080 square HD poster for Facebook & WhatsApp'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. VISUAL POSTER CARD PREVIEW */}
        <div
          id="emergency-poster-card"
          className="w-full rounded-2xl bg-gradient-to-br from-slate-950 via-[#18090d] to-slate-950 text-white p-4 sm:p-5 shadow-xl border-2 border-rose-600/70 relative overflow-hidden space-y-3"
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-rose-900/60">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="font-black text-xs uppercase tracking-widest text-red-400 font-mono">
                {lang === 'bn' ? 'জরুরি রক্তের আবেদন' : 'EMERGENCY BLOOD NEEDED'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>BloodSearch BD</span>
            </div>
          </div>

          {/* Central Blood Group Spotlight */}
          <div className="flex items-center justify-between gap-3 py-1">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                {lang === 'bn' ? 'রক্তের গ্রুপ প্রয়োজন:' : 'REQUIRED BLOOD TYPE:'}
              </span>
              <div className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                <span className="text-rose-500 font-mono">{bloodGroup}</span>
              </div>
              <span className="text-xs font-bold text-amber-300 block mt-0.5">
                {unitsNeeded} {lang === 'bn' ? 'ব্যাগ রক্ত প্রয়োজন' : 'Bags Needed'} · {requiredDate}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-white text-slate-900 flex flex-col items-center justify-center shadow-md shrink-0">
              <QrCode className="w-14 h-14" />
              <span className="text-[8px] font-bold font-mono mt-0.5">BLOODSEARCH</span>
            </div>
          </div>

          {/* Patient & Hospital Details Box */}
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <Hospital className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-bold text-slate-100">{hospitalName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{location}</span>
            </div>
            {reason && (
              <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                <span className="text-slate-300 font-semibold">
                  {lang === 'bn' ? 'রোগী: ' : 'Patient: '}
                </span>
                {patientName} ({reason})
              </div>
            )}
          </div>

          {/* Direct Urgent Contact Bar */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 shrink-0" />
              <div>
                <span className="text-[10px] text-rose-100 uppercase font-bold block leading-none">
                  {lang === 'bn' ? 'সরাসরি যোগাযোগ:' : 'DIRECT CONTACT:'}
                </span>
                <span className="text-base sm:text-lg font-black font-mono tracking-wider">
                  {contactPhone}
                </span>
              </div>
            </div>
            {contactPhone.replace(/[^0-9+]/g, '').length >= 3 && (
              <a
                href={`tel:${contactPhone.replace(/[^0-9+]/g, '')}`}
                className="px-3 py-1.5 rounded-lg bg-white text-rose-600 font-black text-xs hover:bg-slate-100"
              >
                {lang === 'bn' ? 'কল দিন' : 'Call'}
              </a>
            )}
          </div>

          <div className="text-center text-[10px] text-slate-400 pt-1 font-mono">
            রক্ত দিন, জীবন বাঁচান · BloodSearch National Network
          </div>
        </div>

        {/* 2. Customizer / Controls */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'bn' ? 'ব্লাড গ্রুপ নির্বাচন:' : 'Select Blood Group:'}
            </span>
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              {ALL_BLOOD_GROUPS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => setBloodGroup(bg)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer ${
                    bloodGroup === bg
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'রোগীর নাম' : 'Patient Name'}
              </label>
              <input
                name="posterPatientName"
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'ব্যাগ সংখ্যা ও সময়' : 'Bags & Timing'}
              </label>
              <div className="flex gap-1.5">
                <select
                  name="posterUnitsNeeded"
                  value={unitsNeeded}
                  onChange={(e) => setUnitsNeeded(Number(e.target.value))}
                  className="w-20 h-9 px-2 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} ব্যাগ
                    </option>
                  ))}
                </select>
                <input
                  name="posterRequiredDate"
                  type="text"
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                  className="flex-1 h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'হাসপাতাল' : 'Hospital'}
              </label>
              <input
                name="posterHospitalName"
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'মোবাইল নম্বর' : 'Contact Phone'}
              </label>
              <input
                name="posterContactPhone"
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'এলাকা / জেলা' : 'Location'}
              </label>
              <input
                name="posterLocation"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">
                {lang === 'bn' ? 'রক্তের কারণ' : 'Medical Reason'}
              </label>
              <input
                name="posterMedicalReason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* 3. Action Buttons: Real PNG Download, WhatsApp & Copy */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={handleDownloadRealPng}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloadNotice
                ? lang === 'bn'
                  ? '✓ ১০৮০×১০৮০ HD পোস্টার (.PNG) গ্যালারিতে ডাউনলোড হয়েছে!'
                  : '✓ 1080×1080 HD Poster (.PNG) Downloaded!'
                : lang === 'bn'
                ? 'এইচডি পোস্টার ইমেজ (.PNG) ডাউনলোড করুন'
                : 'Download HD Poster Image (.PNG)'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="min-h-[40px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-rose-500" />
              )}
              <span>
                {copied
                  ? lang === 'bn'
                    ? 'টেক্সট কপি হয়েছে!'
                    : 'Copied!'
                  : lang === 'bn'
                  ? 'ক্যাপশন কপি করুন'
                  : 'Copy Caption'}
              </span>
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] py-2 px-3 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{lang === 'bn' ? 'হোয়াটসঅ্যাপে পাঠান' : 'Share WhatsApp'}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
