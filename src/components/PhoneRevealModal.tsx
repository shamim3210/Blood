import React, { useState, useEffect } from 'react';
import { Donor, Language } from '../types';
import { getTranslation } from '../utils/translations';
import {
  auth,
  fetchUnmaskedDonorContactIfAuthorized,
  normalizeFacebookProfileUrl,
  sendContactConsentRequestInFirestore,
  submitScamReportInFirestore,
} from '../services/bloodSearchService';
import {
  buildDirectCallHref,
  buildWhatsAppHref,
  canSeekerViewDirectContact,
  formatAvailabilityTimestamp,
  formatBangladeshPhoneDisplay,
  getDonorAvailabilityConfidence,
  isPhoneMaskedOrInvalid,
  isValidBangladeshMobilePhone,
  normalizeValidBangladeshMobileE164,
} from '../utils/donorMatcher';
import { buildOfflineEmergencySmsUri, copyTextReliable } from '../utils/sosAlertEngine';
import {
  ShieldCheck,
  Phone,
  MessageSquare,
  Copy,
  Check,
  X,
  MapPin,
  ExternalLink,
  Lock,
  ShieldAlert,
  Mail,
  Send,
  UserCheck,
  SkipForward,
} from 'lucide-react';

interface PhoneRevealModalProps {
  donor: Donor | null;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onLogAudit: (action: 'UNMASK_PHONE', details: string) => void;
  onStartChatWithDonor?: (donor: Donor) => void;
  onRecordContactOutcome?: (donor: Donor, outcome: 'CONFIRMED' | 'NO_ANSWER') => void;
}

export const PhoneRevealModal: React.FC<PhoneRevealModalProps> = ({
  donor,
  isOpen,
  onClose,
  lang,
  onLogAudit,
  onStartChatWithDonor,
  onRecordContactOutcome,
}) => {
  const t = getTranslation(lang);
  const [isFetchingContact, setIsFetchingContact] = useState(false);
  const [resolvedContact, setResolvedContact] = useState<{
    phone: string;
    whatsappPhone?: string;
    facebookUrl?: string;
    allowCall?: boolean;
    allowWhatsApp?: boolean;
    allowSms?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSms, setCopiedSms] = useState(false);

  // Consent contact request form state when direct phone is private (REQUEST_ONLY)
  const [seekerName, setSeekerName] = useState('');
  const [seekerPhone, setSeekerPhone] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [isSendingConsentReq, setIsSendingConsentReq] = useState(false);
  const [consentReqFeedback, setConsentReqFeedback] = useState<string | null>(null);

  // Scam reporting state
  const [showScamForm, setShowScamForm] = useState(false);
  const [scamReason, setScamReason] = useState(
    'হাসপাতালে আসার আগে বিকাশ/নগদে গাড়িভাড়া বা টাকা দাবি করেছে'
  );
  const [scamFeedback, setScamFeedback] = useState<string | null>(null);
  const [isReportingScam, setIsReportingScam] = useState(false);

  const isVerifiedSeeker = Boolean(
    auth.currentUser && (auth.currentUser.emailVerified || auth.currentUser.phoneNumber)
  );

  // Prefill seeker details from saved user profile if available
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name) setSeekerName(parsed.name);
        if (parsed?.phone) setSeekerPhone(parsed.phone);
      }
    } catch {}
  }, [isOpen]);

  // Auto-resolve opted-in contact immediately on modal open (zero extra confirmation friction!)
  useEffect(() => {
    if (!isOpen || !donor) {
      setResolvedContact(null);
      setIsFetchingContact(false);
      setConsentReqFeedback(null);
      return;
    }

    let cancelled = false;
    const consentCheck = canSeekerViewDirectContact(donor, isVerifiedSeeker);

    const resolveImmediately = async () => {
      if (!isPhoneMaskedOrInvalid(donor.phone) && consentCheck.allowed) {
        setResolvedContact({
          phone: donor.phone,
          whatsappPhone: donor.whatsappPhone,
          facebookUrl: donor.facebookUrl,
          allowCall: donor.allowCall !== false,
          allowWhatsApp: donor.allowWhatsApp !== false,
          allowSms: donor.allowSms !== false,
        });
        onLogAudit(
          'UNMASK_PHONE',
          `Viewed opted-in contact for donor ${donor.id} (${donor.bloodGroup})`
        );
        return;
      }

      if (!consentCheck.allowed) {
        setResolvedContact(null);
        return;
      }

      setIsFetchingContact(true);
      try {
        const unmasked = await fetchUnmaskedDonorContactIfAuthorized(donor.id);
        if (cancelled) return;
        if (unmasked && !isPhoneMaskedOrInvalid(unmasked.phone)) {
          setResolvedContact(unmasked);
          onLogAudit(
            'UNMASK_PHONE',
            `Resolved authorized direct contact for donor ${donor.id} (${donor.bloodGroup})`
          );
        } else {
          setResolvedContact(null);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingContact(false);
        }
      }
    };

    resolveImmediately();
    return () => {
      cancelled = true;
    };
  }, [isOpen, donor, isVerifiedSeeker, onLogAudit]);

  if (!isOpen || !donor) return null;

  const consentStatus = canSeekerViewDirectContact(donor, isVerifiedSeeker);
  const availabilityConfidence = getDonorAvailabilityConfidence(donor);
  const freshnessText = formatAvailabilityTimestamp(donor, lang);

  const activePhone = resolvedContact?.phone || (!isPhoneMaskedOrInvalid(donor.phone) && consentStatus.allowed ? donor.phone : donor.phone);
  const activeWhatsapp =
    resolvedContact?.whatsappPhone ||
    (!isPhoneMaskedOrInvalid(donor.whatsappPhone) && consentStatus.allowed
      ? donor.whatsappPhone
      : activePhone);
  const activeFacebook = normalizeFacebookProfileUrl(
    resolvedContact?.facebookUrl || donor.facebookUrl
  );

  const hasUnmaskedAuthorizedPhone =
    consentStatus.allowed && !isPhoneMaskedOrInvalid(activePhone);

  const allowCall = resolvedContact?.allowCall ?? donor.allowCall !== false;
  const allowWhatsApp = resolvedContact?.allowWhatsApp ?? donor.allowWhatsApp !== false;
  const allowSms = resolvedContact?.allowSms ?? donor.allowSms !== false;

  const plainSmsBody =
    lang === 'bn'
      ? `আসসালামু আলাইকুম ${donor.name}, জরুরি রোগীর জন্য ${donor.bloodGroup} রক্ত প্রয়োজন। আপনি কি রক্তদানে প্রস্তুত আছেন? - BloodSearch`
      : `Hello ${donor.name}, we urgently need ${donor.bloodGroup} blood for a patient. Are you available to donate? - BloodSearch`;

  const callHref = allowCall ? buildDirectCallHref(activePhone) : null;
  const waHref = allowWhatsApp ? buildWhatsAppHref(activeWhatsapp, plainSmsBody) : null;
  const offlineSmsHref =
    allowSms && hasUnmaskedAuthorizedPhone
      ? buildOfflineEmergencySmsUri(activePhone, plainSmsBody)
      : null;

  const handleCopyPhone = async () => {
    if (!hasUnmaskedAuthorizedPhone) return;
    const ok = await copyTextReliable(activePhone);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopySms = async () => {
    const ok = await copyTextReliable(plainSmsBody);
    if (ok) {
      setCopiedSms(true);
      setTimeout(() => setCopiedSms(false), 2000);
    }
  };

  const handleClose = () => {
    setResolvedContact(null);
    setCopied(false);
    setCopiedSms(false);
    setShowScamForm(false);
    setScamFeedback(null);
    setConsentReqFeedback(null);
    onClose();
  };

  const handleSendConsentRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingConsentReq) return;
    if (!seekerName.trim() || !seekerPhone.trim() || !hospitalName.trim()) {
      setConsentReqFeedback(
        lang === 'bn'
          ? 'আপনার নাম, কলব্যাক নম্বর এবং হাসপাতালের নাম লিখুন।'
          : 'Please enter your name, callback phone, and hospital name.'
      );
      return;
    }

    const normalizedSeekerPhone = normalizeValidBangladeshMobileE164(seekerPhone);
    if (!normalizedSeekerPhone || !isValidBangladeshMobilePhone(seekerPhone)) {
      setConsentReqFeedback(
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের সচল বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 01712345678)।'
          : 'Please enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).'
      );
      return;
    }

    setIsSendingConsentReq(true);
    setConsentReqFeedback(null);
    try {
      const res = await sendContactConsentRequestInFirestore({
        donorUid: donor.id,
        donorName: donor.name,
        seekerName: seekerName.trim(),
        seekerPhone: normalizedSeekerPhone,
        bloodGroupNeeded: donor.bloodGroup,
        hospitalName: hospitalName.trim(),
        urgency: 'CRITICAL',
      });

      if (!res.ok) {
        if (res.reason === 'AUTH_REQUIRED') {
          setConsentReqFeedback(
            lang === 'bn'
              ? 'অনুমতি অনুরোধ পাঠাতে ভেরিফাইড অ্যাকাউন্টে লগইন করুন অথবা সরাসরি লাইভ চ্যাট ব্যবহার করুন।'
              : 'Sign in with a verified account to send a consent request, or use In-App Chat.'
          );
        } else {
          setConsentReqFeedback(
            lang === 'bn' ? 'নিজের প্রোফাইলে অনুরোধ পাঠানো যাবে না।' : 'Cannot request your own profile.'
          );
        }
      } else if (res.reason === 'ALREADY_APPROVED') {
        setConsentReqFeedback(
          lang === 'bn'
            ? '✓ রক্তদাতা ইতিমধ্যে আপনার যোগাযোগের অনুরোধ অনুমোদন করেছেন।'
            : '✓ Donor has already approved your contact request.'
        );
      } else {
        setConsentReqFeedback(
          lang === 'bn'
            ? '✓ রক্তদাতার কাছে আপনার কলব্যাক নম্বরসহ জরুরি যোগাযোগের অনুরোধ পাঠানো হয়েছে।'
            : '✓ Urgent contact request sent to donor with your callback phone number.'
        );
      }
    } catch {
      setConsentReqFeedback(
        lang === 'bn'
          ? 'অনুরোধ পাঠানো যায়নি। অনুগ্রহ করে ইন-অ্যাপ চ্যাট ব্যবহার করুন বা পরবর্তী রক্তদাতাকে কল করুন।'
          : 'Could not send request. Please use In-App Chat or contact the next available donor.'
      );
    } finally {
      setIsSendingConsentReq(false);
    }
  };

  const handleReportScam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReportingScam) return;
    setIsReportingScam(true);
    try {
      await submitScamReportInFirestore({
        suspectPhone: activePhone,
        suspectName: donor.name,
        reason: scamReason,
      });
      setShowScamForm(false);
      setScamFeedback(
        lang === 'bn'
          ? '✓ রিপোর্ট গৃহীত হয়েছে! অ্যাডমিন টিম নম্বরটি যাচাই করে ব্যবস্থা নেবে।'
          : '✓ Scam report submitted to Admin moderation!'
      );
    } catch (err: any) {
      setScamFeedback(err?.message || 'রিপোর্ট পাঠাতে সমস্যা হয়েছে।');
    } finally {
      setIsReportingScam(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain transition-all">
      <div className="w-full max-w-md my-2 sm:my-auto rounded-2xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-5 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 text-left">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {t.phoneRevealTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {donor.name} · {donor.bloodGroup} · {freshnessText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-3.5">
          {/* Donor Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {donor.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="capitalize truncate">
                  {donor.upazila}, {donor.district}
                </span>
              </div>
              <div className="text-[11px] mt-1 font-medium text-slate-600 dark:text-slate-300">
                {availabilityConfidence === 'CONFIRMED_RECENT' ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    {lang === 'bn' ? 'সাম্প্রতিক নিশ্চিতকৃত প্রস্তুত' : 'Recently Confirmed Available'} ·{' '}
                    {freshnessText}
                  </span>
                ) : availabilityConfidence === 'UNKNOWN_UNCONFIRMED' ? (
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    {freshnessText}
                  </span>
                ) : (
                  <span className="text-slate-500">{freshnessText}</span>
                )}
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-extrabold text-sm shrink-0">
              {donor.bloodGroup}
            </div>
          </div>

          {/* Anti-bKash Scam Protection Notice */}
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900/70 text-[11px] text-red-900 dark:text-red-200 leading-relaxed">
            <span className="font-bold block mb-0.5">
              {lang === 'bn'
                ? 'বিকাশ/নগদ প্রতারণা সতর্কতা:'
                : 'Advance Money Scam Warning:'}
            </span>
            {lang === 'bn'
              ? 'স্বেচ্ছাসেবী রক্তদান সম্পূর্ণ বিনামূল্যে। রক্তদাতা হাসপাতালে এসে সশরীরে পৌঁছানোর আগে কখনোই বিকাশ/নগদে গাড়িভাড়া বা অগ্রিম টাকা পাঠাবেন না।'
              : 'Voluntary blood donation is 100% free. Never send advance travel fare via bKash/Nagad before the donor arrives in person at the hospital.'}
          </div>

          {isFetchingContact ? (
            <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
              {lang === 'bn'
                ? 'অনুমোদিত সরাসরি যোগাযোগের তথ্য লোড হচ্ছে...'
                : 'Loading donor-authorized contact options...'}
            </div>
          ) : hasUnmaskedAuthorizedPhone ? (
            <div className="space-y-3.5">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1.5">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                  {lang === 'bn'
                    ? 'রক্তদাতা সরাসরি যোগাযোগের অনুমতি দিয়েছেন'
                    : 'Opted-In Direct Contact Number'}
                </span>
                <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-white tracking-wider flex items-center justify-center gap-2">
                  <span>{formatBangladeshPhoneDisplay(activePhone)}</span>
                  <button
                    type="button"
                    onClick={handleCopyPhone}
                    title="Copy Phone Number"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {lang === 'bn' ? 'নম্বরটি কপি করা হয়েছে!' : 'Copied to clipboard!'}
                  </p>
                )}
              </div>

              {/* Honest Direct Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {callHref ? (
                  <a
                    href={callHref}
                    className="min-h-[44px] flex flex-col items-center justify-center px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors text-center cursor-pointer whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'কল করুন' : 'Call Now'}</span>
                    </span>
                    <span className="text-[10px] font-normal text-rose-100">
                      {lang === 'bn' ? 'ফোন ডায়ালার খুলবে' : 'Opens Phone Dialer'}
                    </span>
                  </a>
                ) : (
                  <div className="min-h-[44px] flex items-center justify-center px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] font-medium text-center">
                    {lang === 'bn' ? 'কল বন্ধ' : 'Call Off'}
                  </div>
                )}

                {waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] flex flex-col items-center justify-center px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors text-center cursor-pointer whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span>WhatsApp</span>
                    </span>
                    <span className="text-[10px] font-normal text-emerald-100">
                      {lang === 'bn' ? 'WhatsApp অ্যাপ খুলবে' : 'Opens WhatsApp'}
                    </span>
                  </a>
                ) : (
                  <div className="min-h-[44px] flex items-center justify-center px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] font-medium text-center">
                    {lang === 'bn' ? 'WA বন্ধ' : 'WA Off'}
                  </div>
                )}

                {offlineSmsHref ? (
                  <a
                    href={offlineSmsHref}
                    className="min-h-[44px] flex flex-col items-center justify-center px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-colors text-center cursor-pointer whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'সাধারণ SMS' : 'SMS'}</span>
                    </span>
                    <span className="text-[10px] font-normal text-slate-300">
                      {lang === 'bn' ? 'SMS অ্যাপ খুলবে' : 'Opens SMS App'}
                    </span>
                  </a>
                ) : (
                  <div className="min-h-[44px] flex items-center justify-center px-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] font-medium text-center">
                    {lang === 'bn' ? 'SMS বন্ধ' : 'SMS Off'}
                  </div>
                )}
              </div>

              {/* Pre-written SMS Copy Box for Desktop & Mobile Convenience */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'প্রস্তুতকৃত জরুরি মেসেজ:' : 'Ready-to-Send SMS Text:'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySms}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    {copiedSms ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>{lang === 'bn' ? 'মেসেজ কপি ✓' : 'Copied ✓'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{lang === 'bn' ? 'মেসেজ কপি করুন' : 'Copy SMS Text'}</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {plainSmsBody}
                </p>
              </div>

              {onStartChatWithDonor && (
                <button
                  type="button"
                  onClick={() => {
                    const target = donor;
                    handleClose();
                    onStartChatWithDonor(target);
                  }}
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#075e54] hover:bg-[#064e46] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'ইন-অ্যাপ লাইভ চ্যাটে বিনামূল্যে বার্তা পাঠান'
                      : 'Send Free Message via In-App Live Chat'}
                  </span>
                </button>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'bn'
                  ? 'নোট: মোবাইলে উপরের বাটনগুলো ফোনের ডায়ালার, WhatsApp বা SMS অ্যাপ খুলবে। কম্পিউটার ব্রাউজারে নম্বর/মেসেজ কপি করুন অথবা ইন-অ্যাপ চ্যাট ব্যবহার করুন।'
                  : 'Note: On mobile, these open your dialer, WhatsApp, or SMS app. On desktop, copy the number/SMS above or use In-App Live Chat.'}
              </p>

              {/* Seeker Contact Tracking: Confirm Donor or Move to Next Donor */}
              {onRecordContactOutcome && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {lang === 'bn'
                      ? 'কথা বলার পর ফলাফল রেকর্ড করুন:'
                      : 'Record call outcome to track your search:'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onRecordContactOutcome(donor, 'CONFIRMED');
                        handleClose();
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {lang === 'bn' ? 'ডোনার নিশ্চিত' : 'Donor Confirmed'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRecordContactOutcome(donor, 'NO_ANSWER');
                        handleClose();
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {lang === 'bn' ? 'সাড়া নেই · পরের ডোনার' : 'No Answer · Next'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {activeFacebook && (
                <a
                  href={activeFacebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[40px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'ফেসবুক প্রোফাইল দেখুন' : 'View Facebook Profile'}</span>
                </a>
              )}
            </div>
          ) : (
            /* Private / Consent-Protected Fallback: In-App Chat + 1-Click Consent Contact Request */
            <div className="space-y-3.5">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'প্রাইভেসি সুরক্ষিত যোগাযোগ'
                      : 'Privacy-Protected Donor Contact'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {lang === 'bn' ? consentStatus.reasonBn : consentStatus.reasonEn}
                </p>

                {onStartChatWithDonor && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = donor;
                      handleClose();
                      onStartChatWithDonor(target);
                    }}
                    className="w-full min-h-[42px] mt-1 px-3.5 py-2 rounded-xl bg-[#075e54] hover:bg-[#064e46] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span>
                      {lang === 'bn'
                        ? 'ইন-অ্যাপ লাইভ চ্যাটে বার্তা পাঠান'
                        : 'Message via In-App Live Chat'}
                    </span>
                  </button>
                )}
              </div>

              {availabilityConfidence !== 'DND' && (
                <form
                  onSubmit={handleSendConsentRequest}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5"
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'জরুরি কলব্যাক ও নম্বরের অনুমতি পাঠান'
                      : 'Send Urgent Callback & Contact Consent Request'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      name="seekerName"
                      type="text"
                      required
                      placeholder={lang === 'bn' ? 'আপনার নাম *' : 'Your Name *'}
                      value={seekerName}
                      onChange={(e) => setSeekerName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      name="seekerPhone"
                      type="tel"
                      required
                      placeholder={lang === 'bn' ? 'আপনার ফোন নম্বর *' : 'Callback Phone *'}
                      value={seekerPhone}
                      onChange={(e) => setSeekerPhone(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <input
                    name="consentHospitalName"
                    type="text"
                    required
                    placeholder={
                      lang === 'bn' ? 'হাসপাতালের নাম ও এলাকা *' : 'Hospital Name & Area *'
                    }
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={isSendingConsentReq}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isSendingConsentReq
                        ? lang === 'bn'
                          ? 'পাঠানো হচ্ছে...'
                          : 'Sending...'
                        : lang === 'bn'
                        ? 'কলব্যাক অনুরোধ পাঠান'
                        : 'Send Contact Request'}
                    </span>
                  </button>
                  {consentReqFeedback && (
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      {consentReqFeedback}
                    </p>
                  )}
                </form>
              )}

              {onRecordContactOutcome && (
                <button
                  type="button"
                  onClick={() => {
                    onRecordContactOutcome(donor, 'NO_ANSWER');
                    handleClose();
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {lang === 'bn'
                      ? 'পরবর্তী উপলব্ধ রক্তদাতায় যান'
                      : 'Skip & Move to Next Available Donor'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* 1-Tap Scam Report Drawer */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            {scamFeedback ? (
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 text-center">
                {scamFeedback}
              </p>
            ) : !showScamForm ? (
              <button
                type="button"
                onClick={() => setShowScamForm(true)}
                className="w-full min-h-[36px] py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  {lang === 'bn'
                    ? 'টাকা বা বিকাশ দাবি করলে নম্বরটি রিপোর্ট করুন'
                    : 'Report suspicious number / advance money demand'}
                </span>
              </button>
            ) : (
              <form onSubmit={handleReportScam} className="space-y-2 pt-1 text-xs">
                <input
                  name="scamReportReason"
                  type="text"
                  required
                  value={scamReason}
                  onChange={(e) => setScamReason(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-red-300 dark:border-red-800 text-slate-900 dark:text-white text-xs"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScamForm(false)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                  >
                    {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isReportingScam}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                  >
                    {isReportingScam
                      ? lang === 'bn'
                        ? 'পাঠানো হচ্ছে...'
                        : 'Sending...'
                      : lang === 'bn'
                      ? 'রিপোর্ট পাঠান'
                      : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
