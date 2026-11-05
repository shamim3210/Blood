import React, { useState, useEffect, useMemo } from 'react';
import {
  BloodGroup,
  UrgencyLevel,
  BloodRequest,
  Language,
  Donor,
  RequiredTimeWindow,
} from '../../types';
import { ALL_BLOOD_GROUPS } from '../../data/compatibility';
import { DISTRICTS } from '../../data/bangladeshGeo';
import {
  auth,
  isUserVerifiedForWrites,
  getStoredDevOtpSandboxSession,
  checkActionCooldownGuard,
  dispatchEmergencyBroadcastClient,
  EmergencyBroadcastDispatchResult,
} from '../../services/bloodSearchService';
import {
  computeEscalationTargets,
  rankDonorsForSeeker,
  canSeekerViewDirectContact,
  buildDirectCallHref,
  buildWhatsAppHref,
  isValidBangladeshMobilePhone,
  normalizeValidBangladeshMobileE164,
} from '../../utils/donorMatcher';
import {
  resolveBangladeshCoordinates,
  resolvePlaceOrHospitalQuery,
  getInstantLocalPlaceSuggestions,
  requestFreshHighAccuracyGPS,
  findNearestDistrictFromCoords,
  reverseGeocodeBangladeshCoords,
  POPULAR_BD_HOSPITALS,
} from '../../utils/geolocation';
import { buildOfflineEmergencySmsUri, copyTextReliable } from '../../utils/sosAlertEngine';
import {
  X,
  Check,
  Copy,
  Mail,
  RefreshCw,
  Phone,
  MessageSquare,
  LocateFixed,
  ChevronDown,
  ChevronUp,
  Hospital,
  Send,
} from 'lucide-react';

interface RequestBloodWizardProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  donors?: Donor[];
  initialBloodGroup?: BloodGroup;
  initialDistrict?: string;
  initialHospitalName?: string;
  onSubmitSOS: (
    newRequest: BloodRequest,
    opts?: { alreadySyncedToCloud?: boolean }
  ) => void;
  onLogAudit: (action: 'CREATE_SOS', details: string) => void;
  onRevealPhone?: (donor: Donor) => void;
}

const EXPRESS_HOSPITALS = POPULAR_BD_HOSPITALS.slice(0, 6);

export const RequestBloodWizard: React.FC<RequestBloodWizardProps> = ({
  isOpen,
  onClose,
  lang,
  donors = [],
  initialBloodGroup,
  initialDistrict,
  initialHospitalName,
  onSubmitSOS,
  onLogAudit,
  onRevealPhone,
}) => {
  const [submittedState, setSubmittedState] = useState<'FORM' | 'LIVE_SUCCESS'>('FORM');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>(initialBloodGroup || '');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [hospitalName, setHospitalName] = useState(initialHospitalName || '');
  const [showHospitalSuggestions, setShowHospitalSuggestions] = useState(false);
  const [district, setDistrict] = useState(
    initialDistrict && initialDistrict !== 'ALL' ? initialDistrict : ''
  );
  const [contactPhone, setContactPhone] = useState('');
  const [savedProfilePhone, setSavedProfilePhone] = useState('');

  // Optional collapsible details
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [urgency, setUrgency] = useState<UrgencyLevel>('CRITICAL');
  const [requiredTimeWindow, setRequiredTimeWindow] =
    useState<RequiredTimeWindow>('IMMEDIATE_2H');
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');
  const [exchangeAllowed, setExchangeAllowed] = useState(false);

  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] =
    useState<EmergencyBroadcastDispatchResult | null>(null);
  const [copiedFallbackSms, setCopiedFallbackSms] = useState(false);

  const devOtpSession = getStoredDevOtpSandboxSession();
  const activeAuthorUid = auth.currentUser?.uid || devOtpSession?.uid;
  const isVerifiedSeeker = Boolean(
    isUserVerifiedForWrites(auth.currentUser) || devOtpSession
  );

  // Only apply explicit context passed by the user's current search/map action; never silently auto-fill personal defaults
  useEffect(() => {
    if (!isOpen) return;
    setSubmittedState('FORM');
    setValidationError(null);
    setBloodGroup(initialBloodGroup || '');
    setHospitalName(initialHospitalName || '');
    if (initialHospitalName) {
      const matchedPlace = resolvePlaceOrHospitalQuery(initialHospitalName);
      if (matchedPlace) {
        setDistrict(matchedPlace.districtId);
      } else {
        setDistrict(initialDistrict && initialDistrict !== 'ALL' ? initialDistrict : '');
      }
    } else {
      setDistrict(initialDistrict && initialDistrict !== 'ALL' ? initialDistrict : '');
    }
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.phone && parsed.phone !== '01700000000') {
          setSavedProfilePhone(String(parsed.phone));
        } else {
          setSavedProfilePhone('');
        }
      } else {
        setSavedProfilePhone('');
      }
    } catch {
      setSavedProfilePhone('');
    }
  }, [isOpen, initialBloodGroup, initialDistrict, initialHospitalName]);

  // Auto-detect district whenever user types a recognized hospital (e.g. "Squire hospital" -> Dhaka, "CMCH" -> Chattogram)
  const handleHospitalInputChange = (val: string) => {
    setHospitalName(val);
    setShowHospitalSuggestions(true);
    const matched = resolvePlaceOrHospitalQuery(val);
    if (matched) {
      setDistrict(matched.districtId);
    }
  };

  const hospitalSuggestions = useMemo(() => {
    if (!hospitalName.trim()) return [];
    return getInstantLocalPlaceSuggestions(hospitalName, lang).slice(0, 5);
  }, [hospitalName, lang]);

  const handleUseLiveGpsForRequest = async () => {
    setIsLocatingGps(true);
    setValidationError(null);
    try {
      const res = await requestFreshHighAccuracyGPS();
      if (res.isRealGps) {
        const near = findNearestDistrictFromCoords(res.coords);
        setDistrict(near.districtId);
        const geo = await reverseGeocodeBangladeshCoords(res.coords, lang);
        setDistrict(geo.districtId || near.districtId);
        if (!hospitalName.trim()) {
          setHospitalName(`${geo.areaText}, ${geo.districtName}`);
        }
      } else {
        setValidationError(
          lang === 'bn'
            ? 'ব্রাউজারে GPS অনুমতি বন্ধ আছে — অনুগ্রহ করে হাসপাতালের বা এলাকার নাম (যেমন: নিকেতন) নিচে লিখুন।'
            : 'Browser GPS is off — please type your hospital or area name (e.g. Niketon) below.'
        );
      }
    } finally {
      setIsLocatingGps(false);
    }
  };

  // Compute concurrent matching opted-in donors for this request
  const initialEscalationPlan = useMemo(() => {
    if (!bloodGroup || !district) {
      return { eligibleDonorsToNotify: [], radiusKm: 15 };
    }
    const origin = resolveBangladeshCoordinates({
      district,
      hospital: hospitalName || undefined,
    });
    return computeEscalationTargets({
      targetLevel: 0,
      bloodGroup,
      originDistrict: district,
      originCoords: origin,
      allDonors: donors,
      alreadyNotifiedDonorIds: [],
      excludeUid: activeAuthorUid,
      exchangeAllowed,
    });
  }, [bloodGroup, district, hospitalName, donors, exchangeAllowed, activeAuthorUid]);

  // Top opted-in donors seeker can call immediately in parallel while alerts run
  const immediateDirectDonors = useMemo(() => {
    const origin = resolveBangladeshCoordinates({
      district: district || 'dhaka',
      hospital: hospitalName || undefined,
    });
    const ranked = rankDonorsForSeeker(donors, {
      bloodGroup: bloodGroup || 'ALL',
      compatibleMatchEnabled: true,
      exchangeAllowed,
      district: district || 'ALL',
      urgency,
      requiredTimeWindow,
      originCoords: origin,
      includeNearbyDistricts: true,
      onlyConfirmedOrAvailable: true,
      seekerIsVerifiedUser: isVerifiedSeeker,
      lang,
    });
    return ranked
      .filter((r) => canSeekerViewDirectContact(r.donor, isVerifiedSeeker).allowed)
      .slice(0, 5);
  }, [
    donors,
    bloodGroup,
    exchangeAllowed,
    district,
    hospitalName,
    urgency,
    requiredTimeWindow,
    isVerifiedSeeker,
    lang,
  ]);

  if (!isOpen) return null;

  const requiredTimeLabel =
    requiredTimeWindow === 'IMMEDIATE_2H'
      ? lang === 'bn'
        ? 'জরুরি ২ ঘণ্টার মধ্যে'
        : 'Immediate (Within 2h)'
      : requiredTimeWindow === 'TODAY_6H'
        ? lang === 'bn'
          ? 'আজ ৬ ঘণ্টার মধ্যে'
          : 'Today (Within 6h)'
        : requiredTimeWindow === 'WITHIN_24H'
          ? lang === 'bn'
            ? '২৪ ঘণ্টার মধ্যে'
            : 'Within 24 hours'
          : lang === 'bn'
            ? 'নির্ধারিত সময়'
            : 'Scheduled';

  const handlePublishRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanHospital = hospitalName.trim();
    const normalizedPhone = normalizeValidBangladeshMobileE164(contactPhone);

    if (!bloodGroup) {
      setValidationError(
        lang === 'bn'
          ? 'কোন গ্রুপের রক্ত লাগবে তা উপরে নির্বাচন করুন।'
          : 'Please select which blood group is needed.'
      );
      return;
    }
    if (cleanHospital.length < 2) {
      setValidationError(
        lang === 'bn'
          ? 'কোন হাসপাতালে বা এলাকায় রক্ত লাগবে তা লিখুন অথবা নিচের হাসপাতাল বাটনে চাপুন।'
          : 'Please enter or tap the hospital / area name.'
      );
      return;
    }
    if (!district) {
      setValidationError(
        lang === 'bn'
          ? 'অনুগ্রহ করে জেলা নির্বাচন করুন।'
          : 'Please select the district.'
      );
      return;
    }
    if (!normalizedPhone || !isValidBangladeshMobilePhone(contactPhone)) {
      setValidationError(
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (যেমন: 01712345678)।'
          : 'Please enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).'
      );
      return;
    }

    const guard = checkActionCooldownGuard('CREATE_SOS', 6000);
    if (!guard.allowed) {
      setValidationError(
        lang === 'bn'
          ? `অনুগ্রহ করে ${guard.waitSeconds} সেকেন্ড অপেক্ষা করে আবার চেষ্টা করুন।`
          : `Please wait ${guard.waitSeconds}s before sending another request.`
      );
      return;
    }

    setIsDispatching(true);
    try {
      const distObj = DISTRICTS.find((d) => d.id === district);
      const cleanPatient =
        patientName.trim() || (lang === 'bn' ? 'জরুরি রোগী' : 'Emergency Patient');
      const finalReason =
        reason.trim() || (lang === 'bn' ? 'জরুরি রক্ত প্রয়োজন' : 'Emergency transfusion');

      const nowMs = Date.now();
      const expiryHours =
        requiredTimeWindow === 'IMMEDIATE_2H'
          ? 6
          : requiredTimeWindow === 'TODAY_6H'
            ? 12
            : 24;

      const candidateIds = initialEscalationPlan.eligibleDonorsToNotify.map((d) => d.id);
      const reqId = `sos_${nowMs}`;

      let seekerSavedName = '';
      try {
        const savedRaw = localStorage.getItem('bloodsearch_current_user');
        const savedParsed = savedRaw ? JSON.parse(savedRaw) : null;
        if (savedParsed?.name && String(savedParsed.name).trim().length >= 2) {
          seekerSavedName = String(savedParsed.name).trim().slice(0, 80);
        }
      } catch {}

      const newReq: BloodRequest = {
        id: reqId,
        authorUid: activeAuthorUid,
        patientName: cleanPatient.slice(0, 80),
        patientAge: 30,
        bloodGroup,
        unitsNeeded: Number(unitsNeeded) || 1,
        unitsCollected: 0,
        hospitalName: cleanHospital.slice(0, 120),
        division: distObj?.divisionId || 'dhaka',
        district,
        upazila: cleanHospital.slice(0, 120) || distObj?.upazilas?.[0]?.id || 'sadar',
        urgency,
        requiredTimeWindow,
        contactName: seekerSavedName || cleanPatient.slice(0, 80),
        contactPhone: normalizedPhone,
        requiredDate: requiredTimeLabel,
        reason: finalReason,
        exchangeAllowed,
        responders: [],
        createdAt: lang === 'bn' ? 'এইমাত্র' : 'Just now',
        createdAtMs: nowMs,
        expiresAtMs: nowMs + expiryHours * 60 * 60 * 1000,
        status: 'ACTIVE',
        lifecycleState: candidateIds.length > 0 ? 'DONORS_NOTIFIED' : 'SEARCHING',
        notifiedCount: candidateIds.length,
        viewedCount: 0,
        respondedCount: 0,
        contactAttemptsCount: 0,
        escalationLevel: 0,
        searchRadiusKm: initialEscalationPlan.radiusKm,
        escalationIntervalMinutes: 10,
      };

      const broadcastRes = await dispatchEmergencyBroadcastClient({
        request: newReq,
        seekerCallbackPhone: normalizedPhone,
        candidateCloudDonorIds: candidateIds,
      });

      const syncedReq: BloodRequest = {
        ...newReq,
        id: broadcastRes.requestId || reqId,
        notifiedCount: broadcastRes.alertsWritten,
        lifecycleState:
          broadcastRes.alertsWritten > 0 ? 'DONORS_NOTIFIED' : 'SEARCHING',
      };

      setDispatchResult(broadcastRes);
      onSubmitSOS(syncedReq, { alreadySyncedToCloud: broadcastRes.syncedToCloud });
      onLogAudit(
        'CREATE_SOS',
        `Dispatched ${bloodGroup} emergency request (${unitsNeeded} unit(s), notified=${broadcastRes.alertsWritten})`
      );
      setSubmittedState('LIVE_SUCCESS');
    } catch {
      setValidationError(
        lang === 'bn'
          ? 'আবেদন পাঠাতে সমস্যা হয়েছে। তথ্য যাচাই করে আবার চেষ্টা করুন।'
          : 'Could not send request. Please verify your details and try again.'
      );
    } finally {
      setIsDispatching(false);
    }
  };

  const handleFinish = () => {
    setSubmittedState('FORM');
    setDispatchResult(null);
    setValidationError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain"
      onClick={() => showHospitalSuggestions && setShowHospitalSuggestions(false)}
    >
      <div className="w-full max-w-lg my-2 sm:my-auto rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white overflow-hidden shadow-2xl border border-slate-300 dark:border-slate-700 transition-colors flex flex-col justify-between text-left">
        {/* Jewel Header */}
        <div className="section-jewel-ruby text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              {submittedState === 'FORM'
                ? lang === 'bn'
                  ? 'জরুরি রক্তের রিকোয়েস্ট দিন'
                  : 'Post Blood Request'
                : lang === 'bn'
                  ? 'রিকোয়েস্ট লাইভ হয়েছে!'
                  : 'Request Is Now Live!'}
            </h2>
            <p className="text-xs text-rose-100/90 mt-0.5">
              {submittedState === 'FORM'
                ? lang === 'bn'
                  ? 'নিজের মতো রোগীর নাম, গ্রুপ, হাসপাতাল ও মোবাইল নম্বর দিন'
                  : 'Enter your blood group, patient/contact name, hospital & mobile number'
                : lang === 'bn'
                  ? 'নিচের প্রস্তুত রক্তদাতাদের এখনই সরাসরি কল করতে পারেন'
                  : 'You can also call ready donors directly below right now'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 cursor-pointer shrink-0 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
        {submittedState === 'FORM' ? (
          /* 1-SCREEN EFFORTLESS REQUEST FORM */
          <form onSubmit={handlePublishRequest} className="space-y-4">
            {/* 1. Blood Group Buttons */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                {lang === 'bn' ? '১. কোন গ্রুপের রক্ত লাগবে? *' : '1. Blood Group Needed *'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {ALL_BLOOD_GROUPS.map((group) => {
                  const isSelected = bloodGroup === group;
                  return (
                    <button
                      type="button"
                      key={group}
                      onClick={() => setBloodGroup(group)}
                      className={`min-h-[46px] rounded-xl font-black text-sm sm:text-base transition-colors cursor-pointer flex items-center justify-center ${
                        isSelected
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:border-rose-400'
                      }`}
                    >
                      {group}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Hospital / Location with 1-Tap Chips & GPS Auto-Fill */}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {lang === 'bn'
                    ? '২. হাসপাতাল বা এলাকার নাম *'
                    : '2. Hospital or Area Name *'}
                </label>
                <button
                  type="button"
                  onClick={handleUseLiveGpsForRequest}
                  disabled={isLocatingGps}
                  className="text-[11px] font-bold text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin' : ''}`} />
                  <span>
                    {isLocatingGps
                      ? lang === 'bn'
                        ? 'লোকেশন নেওয়া হচ্ছে...'
                        : 'Detecting...'
                      : lang === 'bn'
                        ? 'GPS দিয়ে জেলা নিন'
                        : 'Use My GPS'}
                  </span>
                </button>
              </div>

              <div className="relative">
                <input
                  id="req-wizard-hospital"
                  name="hospitalName"
                  type="text"
                  required
                  placeholder={
                    lang === 'bn'
                      ? 'যেমন: Square Hospital, ঢাকা মেডিকেল (DMCH), ইবনে সিনা...'
                      : 'e.g. Square Hospital, Dhaka Medical (DMCH), LabAid...'
                  }
                  value={hospitalName}
                  onFocus={() => setShowHospitalSuggestions(true)}
                  onChange={(e) => handleHospitalInputChange(e.target.value)}
                  className="w-full h-11 px-3.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />

                {showHospitalSuggestions && hospitalSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-12 z-30 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {hospitalSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setHospitalName(item.title);
                          setDistrict(item.districtId);
                          setShowHospitalSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-rose-50/70 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                      >
                        <Hospital className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 1-Tap Popular Hospital Quick Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {EXPRESS_HOSPITALS.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setHospitalName(lang === 'bn' ? h.nameBn : h.nameEn);
                      setDistrict(h.districtId);
                      setShowHospitalSuggestions(false);
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {h.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Patient / Contact Name, Callback Phone & District */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="req-wizard-patient-name" className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  {lang === 'bn' ? '৩. রোগী বা যোগাযোগকারীর নাম' : '3. Patient / Contact Name'}
                </label>
                <input
                  id="req-wizard-patient-name"
                  name="patientName"
                  type="text"
                  placeholder={lang === 'bn' ? 'নিজের বা রোগীর নাম লিখুন' : 'Enter patient or contact name'}
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full h-11 px-3.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label htmlFor="req-wizard-phone" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {lang === 'bn' ? '৪. মোবাইল নম্বর *' : '4. Callback Mobile Number *'}
                  </label>
                  {savedProfilePhone && contactPhone !== savedProfilePhone && (
                    <button
                      type="button"
                      onClick={() => setContactPhone(savedProfilePhone)}
                      className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      {lang === 'bn' ? 'আমার সেভ করা নম্বর দিন' : 'Use Saved Phone'}
                    </button>
                  )}
                </div>
                <input
                  id="req-wizard-phone"
                  name="contactPhone"
                  type="tel"
                  required
                  placeholder="01712345678"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full h-11 px-3.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="req-wizard-district" className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  {lang === 'bn' ? 'জেলা *' : 'District *'}
                </label>
                <select
                  id="req-wizard-district"
                  name="district"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full h-11 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="">
                    {lang === 'bn' ? '-- জেলা নির্বাচন করুন --' : '-- Select District --'}
                  </option>
                  {DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {lang === 'bn' ? d.nameBn : d.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  {lang === 'bn' ? 'কত ব্যাগ রক্ত লাগবে?' : 'How many bags needed?'}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((num) => {
                    const active = unitsNeeded === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setUnitsNeeded(num)}
                        className={`min-h-[44px] rounded-lg text-xs font-bold cursor-pointer tabular-nums transition-colors ${
                          active
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {lang === 'bn'
                          ? `${num === 4 ? '৪+' : num}`
                          : `${num === 4 ? '4+' : num}B`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Optional Extra Details Accordion */}
            <div className="border-t border-slate-200/80 dark:border-slate-800 pt-2.5">
              <button
                type="button"
                onClick={() => setShowOptionalDetails((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white py-1 cursor-pointer"
              >
                <span>
                  {lang === 'bn'
                    ? 'অতিরিক্ত তথ্য যোগ করুন (সময় ও কারণ — ঐচ্ছিক)'
                    : 'Add Optional Details (Time window & reason)'}
                </span>
                {showOptionalDetails ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {showOptionalDetails && (
                <div className="pt-3 space-y-3">
                  <div>
                    <div>
                      <label htmlFor="req-wizard-time-window" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {lang === 'bn' ? 'কখন লাগবে?' : 'When needed?'}
                      </label>
                      <select
                        id="req-wizard-time-window"
                        name="requiredTimeWindow"
                        value={requiredTimeWindow}
                        onChange={(e) => {
                          const val = e.target.value as RequiredTimeWindow;
                          setRequiredTimeWindow(val);
                          setUrgency(
                            val === 'IMMEDIATE_2H'
                              ? 'CRITICAL'
                              : val === 'TODAY_6H'
                                ? 'URGENT'
                                : 'STANDARD'
                          );
                        }}
                        className="w-full h-10 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      >
                        <option value="IMMEDIATE_2H">
                          {lang === 'bn' ? 'এখনই / ২ ঘণ্টার মধ্যে' : 'Immediately (Within 2h)'}
                        </option>
                        <option value="TODAY_6H">
                          {lang === 'bn' ? 'আজ ৬ ঘণ্টার মধ্যে' : 'Today (Within 6h)'}
                        </option>
                        <option value="WITHIN_24H">
                          {lang === 'bn' ? 'আগামী ২৪ ঘণ্টার মধ্যে' : 'Within 24 hours'}
                        </option>
                        <option value="SCHEDULED">
                          {lang === 'bn' ? 'নির্ধারিত তারিখে' : 'Scheduled Later'}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="req-wizard-reason" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {lang === 'bn' ? 'রোগের কারণ / ওয়ার্ড নম্বর (ঐচ্ছিক)' : 'Reason / Ward (Optional)'}
                    </label>
                    <input
                      id="req-wizard-reason"
                      name="clinicalReason"
                      type="text"
                      placeholder={
                        lang === 'bn'
                          ? 'যেমন: জরুরি অপারেশন / ডেলিভারি / ডেঙ্গু'
                          : 'e.g. Surgery / delivery / dengue'
                      }
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full h-10 px-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>

                  <label className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2.5 cursor-pointer text-xs">
                    <input
                      id="req-wizard-exchange"
                      name="exchangeAllowed"
                      type="checkbox"
                      checked={exchangeAllowed}
                      onChange={(e) => setExchangeAllowed(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                    />
                    <span className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {lang === 'bn'
                          ? 'ব্লাড ব্যাংক এক্সচেঞ্জ করা যাবে (যেকোনো গ্রুপ)'
                          : 'Blood Bank Exchange Allowed (Any Group)'}
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            {initialEscalationPlan.eligibleDonorsToNotify.length > 0 && (
              <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-200 font-semibold tabular-nums">
                {lang === 'bn'
                  ? `নিকটবর্তী ${initialEscalationPlan.eligibleDonorsToNotify.length} জন ম্যাচিং রক্তদাতার কাছে সাথে সাথে নোটিফিকেশন যাবে।`
                  : `${initialEscalationPlan.eligibleDonorsToNotify.length} nearby matching donors will be notified immediately.`}
              </div>
            )}

            {validationError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
                {validationError}
              </div>
            )}

            <button
              type="submit"
              disabled={isDispatching}
              className="w-full min-h-[48px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Send className="w-4 h-4 shrink-0" />
              <span>
                {isDispatching
                  ? lang === 'bn'
                    ? 'পাঠানো হচ্ছে...'
                    : 'Sending Request...'
                  : lang === 'bn'
                    ? 'এখনই রক্তের রিকোয়েস্ট পাঠান'
                    : 'Send Blood Request Now'}
              </span>
            </button>
          </form>
        ) : (
          /* LIVE CONFIRMATION + 1-TAP DIRECT CALL SCREEN */
          <div className="py-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? `${bloodGroup} রক্তের রিকোয়েস্ট সফলভাবে পোস্ট হয়েছে`
                    : `${bloodGroup} Blood Request Published`}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {lang === 'bn'
                    ? dispatchResult?.alertsWritten
                      ? `${dispatchResult.alertsWritten} জন ডোনারের কাছে অ্যালার্ট গেছে। সবচেয়ে দ্রুত সাড়া পেতে নিচের প্রস্তুত ডোনারদের সরাসরি কল করুন:`
                      : 'রিকোয়েস্টটি লাইভ ফিডে যুক্ত হয়েছে। নিচের প্রস্তুত ডোনারদের সরাসরি কল করুন:'
                    : dispatchResult?.alertsWritten
                      ? `${dispatchResult.alertsWritten} donors alerted. Call available donors below for the fastest response:`
                      : 'Your request is live. Call available donors below directly:'}
                </p>
              </div>
            </div>

            {immediateDirectDonors.length > 0 && (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {immediateDirectDonors.map(({ donor, distanceKm }) => {
                  const callHref = buildDirectCallHref(donor.phone);
                  const waHref = buildWhatsAppHref(
                    donor.whatsappPhone || donor.phone,
                    `জরুরি ${bloodGroup} রক্ত প্রয়োজন (${hospitalName})। যোগাযোগ: ${contactPhone}`
                  );
                  return (
                    <div
                      key={donor.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {donor.name} · {donor.bloodGroup}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate tabular-nums">
                          {donor.upazila}, {donor.district} · ~{distanceKm.toFixed(1)} km
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {callHref ? (
                          <a
                            href={callHref}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                          </a>
                        ) : onRevealPhone ? (
                          <button
                            type="button"
                            onClick={() => onRevealPhone(donor)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                          </button>
                        ) : null}

                        {waHref && (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WA</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href={buildOfflineEmergencySmsUri(
                  '',
                  `জরুরি রক্ত প্রয়োজন: ${bloodGroup} (${unitsNeeded} ব্যাগ), হাসপাতাল: ${hospitalName}, যোগাযোগ: ${contactPhone}`
                )}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Mail className="w-4 h-4 shrink-0" />
                <span>{lang === 'bn' ? 'SMS পাঠান' : 'Send SMS'}</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyTextReliable(
                    lang === 'bn'
                      ? `জরুরি রক্তের প্রয়োজন: ${bloodGroup} (${unitsNeeded} ব্যাগ)\nহাসপাতাল: ${hospitalName} (${district})\nযোগাযোগ: ${contactPhone}`
                      : `Emergency: ${bloodGroup} blood needed (${unitsNeeded} unit(s)) at ${hospitalName} (${district}). Contact: ${contactPhone}`
                  );
                  if (ok) {
                    setCopiedFallbackSms(true);
                    window.setTimeout(() => setCopiedFallbackSms(false), 2200);
                  }
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl btn-surface font-bold text-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {copiedFallbackSms ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{lang === 'bn' ? 'কপি হয়েছে ✓' : 'Copied ✓'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>{lang === 'bn' ? 'মেসেজ কপি করুন' : 'Copy Post Text'}</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className="w-full min-h-[46px] rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-sm transition-colors cursor-pointer"
            >
              {lang === 'bn' ? 'সম্পন্ন (রিকোয়েস্ট ফিড দেখুন)' : 'Done'}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
