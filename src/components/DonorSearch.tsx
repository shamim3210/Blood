import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Donor,
  BloodGroup,
  Language,
} from '../types';
import { DISTRICTS } from '../data/bangladeshGeo';
import { ALL_BLOOD_GROUPS } from '../data/compatibility';
import { getTranslation } from '../utils/translations';
import {
  auth,
  isUserVerifiedForWrites,
  getStoredDevOtpSandboxSession,
  fetchUnmaskedDonorContactIfAuthorized,
  normalizeFacebookProfileUrl,
} from '../services/bloodSearchService';
import {
  requestFreshHighAccuracyGPS,
  clearCachedDeviceGps,
  DEFAULT_BANGLADESH_COORDS,
  resolveBangladeshCoordinates,
  resolvePlaceOrHospitalQuery,
  findNearestDistrictFromCoords,
  getInstantLocalPlaceSuggestions,
  LivePlaceSuggestion,
  formatDistance,
  Coordinates,
} from '../utils/geolocation';
import {
  rankDonorsForSeeker,
  canSeekerViewDirectContact,
  buildDirectCallHref,
  buildWhatsAppHref,
  buildDirectSmsHref,
  isPhoneMaskedOrInvalid,
} from '../utils/donorMatcher';
import {
  Search,
  MapPin,
  Phone,
  Star,
  CheckCircle2,
  Clock,
  Heart,
  RotateCcw,
  MessageSquare,
  MessageCircle,
  UserPlus,
  Mic,
  MicOff,
  LocateFixed,
  Moon,
  GraduationCap,
  Lock,
  SkipForward,
  Expand,
  SlidersHorizontal,
  Bookmark,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Hospital,
  ExternalLink,
  ShieldCheck,
  X,
} from 'lucide-react';

interface DonorSearchProps {
  donors: Donor[];
  lang: Language;
  presetGroup?: BloodGroup | 'ALL';
  presetDistrict?: string;
  presetNonce?: number;
  onRevealPhone: (donor: Donor) => void;
  onOpenSOSModal: (context?: {
    bloodGroup?: BloodGroup;
    district?: string;
    hospitalName?: string;
  }) => void;
  onStartChatWithDonor?: (donor: Donor) => void;
  onOpenRegister?: () => void;
  unsuccessfulDonorIds?: string[];
  confirmedDonorId?: string | null;
  onRecordContactOutcome?: (donor: Donor, outcome: 'CONFIRMED' | 'NO_ANSWER') => void;
}

const PAGE_CHUNK = 24;

const QUICK_HOSPITAL_CHIPS: Array<{
  labelBn: string;
  labelEn: string;
  query: string;
  districtId: string;
}> = [
  { labelBn: 'নিকেতন (Niketon)', labelEn: 'Niketon', query: 'Niketon', districtId: 'dhaka' },
  { labelBn: 'Square Hospital', labelEn: 'Square Hospital', query: 'Square Hospital', districtId: 'dhaka' },
  { labelBn: 'ঢাকা মেডিকেল (DMCH)', labelEn: 'DMCH', query: 'DMCH', districtId: 'dhaka' },
  { labelBn: 'ধানমন্ডি', labelEn: 'Dhanmondi', query: 'Dhanmondi', districtId: 'dhaka' },
  { labelBn: 'মিরপুর', labelEn: 'Mirpur', query: 'Mirpur', districtId: 'dhaka' },
  { labelBn: 'উত্তরা', labelEn: 'Uttara', query: 'Uttara', districtId: 'dhaka' },
  { labelBn: 'চট্টগ্রাম (CMCH)', labelEn: 'Chattogram', query: 'CMCH', districtId: 'chattogram' },
];

const DonorSearchComponent: React.FC<DonorSearchProps> = ({
  donors,
  lang,
  presetGroup,
  presetDistrict,
  presetNonce,
  onRevealPhone,
  onOpenSOSModal,
  onStartChatWithDonor,
  onOpenRegister,
  unsuccessfulDonorIds: externalUnsuccessfulIds,
  confirmedDonorId,
  onRecordContactOutcome,
}) => {
  const t = getTranslation(lang);

  const [selectedGroup, setSelectedGroup] = useState<BloodGroup | 'ALL'>(
    presetGroup || 'ALL'
  );
  const [includeCompatible, setIncludeCompatible] = useState<boolean>(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string>(
    presetDistrict || 'ALL'
  );
  const [includeNearbyDistricts, setIncludeNearbyDistricts] = useState<boolean>(true);

  // Simple collapsible optional filters
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);
  const [onlyNightReady, setOnlyNightReady] = useState<boolean>(false);
  const [onlyCampusClub, setOnlyCampusClub] = useState<boolean>(false);
  const [onlyShortlisted, setOnlyShortlisted] = useState<boolean>(false);

  const [shortlistedIds, setShortlistedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_shortlisted_donors');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
      }
    } catch {}
    return [];
  });
  const [copiedDonorId, setCopiedDonorId] = useState<string | null>(null);

  // Smart Location / GPS State — manual by default, never auto-enables "GPS On"
  const [locationMode, setLocationMode] = useState<'GPS' | 'PLACE' | 'MANUAL'>('MANUAL');
  const [gpsAvailable, setGpsAvailable] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsFeedback, setGpsFeedback] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<Coordinates>(DEFAULT_BANGLADESH_COORDS);
  const [customPlaceCoords, setCustomPlaceCoords] = useState<Coordinates | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPlaceSuggestions, setShowPlaceSuggestions] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_CHUNK);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [showVoiceQuickTray, setShowVoiceQuickTray] = useState<boolean>(false);
  const speechRecRef = useRef<any>(null);

  // Unsuccessful attempt tracking
  const [localUnsuccessfulIds, setLocalUnsuccessfulIds] = useState<string[]>([]);
  const [outcomeBanner, setOutcomeBanner] = useState<string | null>(null);

  // Cache of authorized unmasked direct contacts for opted-in cloud donors
  const [resolvedDirectContacts, setResolvedDirectContacts] = useState<
    Record<
      string,
      {
        phone: string;
        whatsappPhone?: string;
        facebookUrl?: string;
        allowCall?: boolean;
        allowWhatsApp?: boolean;
        allowSms?: boolean;
      }
    >
  >({});

  const attemptedDirectContactIdsRef = useRef<Set<string>>(new Set());

  const isVerifiedSeeker = Boolean(
    isUserVerifiedForWrites(auth.currentUser) || getStoredDevOtpSandboxSession()
  );

  useEffect(() => {
    attemptedDirectContactIdsRef.current.clear();
  }, [isVerifiedSeeker]);

  useEffect(() => {
    if (presetGroup !== undefined) {
      setSelectedGroup(presetGroup);
    }
    if (presetDistrict !== undefined) {
      setSelectedDistrict(presetDistrict);
    }
  }, [presetGroup, presetDistrict, presetNonce]);

  const toggleShortlistDonor = useCallback((donorId: string) => {
    setShortlistedIds((prev) => {
      const next = prev.includes(donorId)
        ? prev.filter((id) => id !== donorId)
        : [donorId, ...prev];
      try {
        localStorage.setItem('bloodsearch_shortlisted_donors', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleCopyDirectPhone = useCallback((donorId: string, rawPhone: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(rawPhone).catch(() => {});
      setCopiedDonorId(donorId);
      window.setTimeout(() => {
        setCopiedDonorId((curr) => (curr === donorId ? null : curr));
      }, 2200);
    }
  }, []);

  // Resolve typed hospital / area automatically (even with typos like "Squire hospital"!)
  const resolvedTypedPlace = useMemo(
    () => (searchQuery.trim() ? resolvePlaceOrHospitalQuery(searchQuery) : null),
    [searchQuery]
  );

  const placeSuggestions = useMemo<LivePlaceSuggestion[]>(() => {
    if (!searchQuery.trim()) return [];
    return getInstantLocalPlaceSuggestions(searchQuery, lang).slice(0, 6);
  }, [searchQuery, lang]);

  const hasActiveLocationReference = Boolean(
    (locationMode === 'GPS' && gpsAvailable) ||
      (locationMode === 'PLACE' && customPlaceCoords) ||
      resolvedTypedPlace ||
      selectedDistrict !== 'ALL'
  );

  const effectiveOriginCoords = useMemo<Coordinates>(() => {
    if (customPlaceCoords && locationMode === 'PLACE') {
      return customPlaceCoords;
    }
    if (resolvedTypedPlace) {
      return resolvedTypedPlace.coords;
    }
    if (locationMode === 'GPS' && gpsAvailable) {
      return userCoords;
    }
    const anchorDist = selectedDistrict !== 'ALL' ? selectedDistrict : 'dhaka';
    return resolveBangladeshCoordinates({ district: anchorDist });
  }, [
    customPlaceCoords,
    locationMode,
    resolvedTypedPlace,
    gpsAvailable,
    userCoords,
    selectedDistrict,
  ]);

  const handleLocateLiveGps = async () => {
    if (locationMode === 'GPS' && gpsAvailable) {
      clearCachedDeviceGps();
      setLocationMode('MANUAL');
      setGpsAvailable(false);
      setGpsFeedback(
        lang === 'bn'
          ? 'লাইভ GPS বন্ধ করা হয়েছে — নিজের মতো হাসপাতাল, এলাকা বা জেলা বেছে নিন।'
          : 'Live GPS turned off — enter your hospital, area, or district manually.'
      );
      return;
    }

    setIsLocatingGps(true);
    setGpsFeedback(null);
    try {
      const res = await requestFreshHighAccuracyGPS();
      setUserCoords(res.coords);
      setGpsAvailable(res.isRealGps);
      if (res.isRealGps) {
        setLocationMode('GPS');
        setCustomPlaceCoords(null);
        const near = findNearestDistrictFromCoords(res.coords);
        setGpsFeedback(
          lang === 'bn'
            ? `আপনার লাইভ GPS যুক্ত হয়েছে (${near.nameBn}) — সবচেয়ে কাছের ডোনার উপরে দেখানো হচ্ছে`
            : `Live GPS locked (${near.nameEn}) — ranking nearest donors first`
        );
      } else {
        setLocationMode('MANUAL');
        setGpsFeedback(
          lang === 'bn'
            ? 'ব্রাউজারে GPS অনুমতি বন্ধ আছে — পাশের বক্সে হাসপাতালের নাম বা জেলা বেছে নিন।'
            : 'Browser GPS permission is off — type your hospital or pick your district.'
        );
      }
    } finally {
      setIsLocatingGps(false);
    }
  };

  useEffect(() => {
    setVisibleCount(PAGE_CHUNK);
  }, [
    selectedGroup,
    includeCompatible,
    selectedDistrict,
    includeNearbyDistricts,
    onlyAvailable,
    onlyVerified,
    onlyNightReady,
    onlyCampusClub,
    onlyShortlisted,
    searchQuery,
    locationMode,
  ]);

  const handleToggleVoice = () => {
    if (typeof window === 'undefined') return;

    if (isListening) {
      try {
        speechRecRef.current?.stop();
      } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShowVoiceQuickTray((prev) => !prev);
      setVoiceNotice(
        lang === 'bn'
          ? 'ব্রাউজারে মাইক্রোফোন সাপোর্ট বন্ধ — নিচের ১-ট্যাপ কুইক ভয়েস প্রিসেট ব্যবহার করুন।'
          : 'Microphone unavailable in this view — use 1-tap Quick Voice Presets below.'
      );
      setTimeout(() => setVoiceNotice(null), 4500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      speechRecRef.current = recognition;
      recognition.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setShowVoiceQuickTray(false);
      };
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setSearchQuery(transcript);
          const lower = transcript.toLowerCase();
          if (lower.includes('b+') || lower.includes('b positive') || lower.includes('বি পজিটিভ')) setSelectedGroup('B+');
          else if (lower.includes('o+') || lower.includes('o positive') || lower.includes('ও পজিটিভ')) setSelectedGroup('O+');
          else if (lower.includes('a+') || lower.includes('a positive') || lower.includes('এ পজিটিভ')) setSelectedGroup('A+');
          else if (lower.includes('ab+') || lower.includes('ab positive') || lower.includes('এবি পজিটিভ')) setSelectedGroup('AB+');
          else if (lower.includes('o-') || lower.includes('o negative') || lower.includes('ও নেগেটিভ')) setSelectedGroup('O-');
          else if (lower.includes('b-') || lower.includes('b negative') || lower.includes('বি নেগেটিভ')) setSelectedGroup('B-');
          else if (lower.includes('a-') || lower.includes('a negative') || lower.includes('এ নেগেটিভ')) setSelectedGroup('A-');
          else if (lower.includes('ab-') || lower.includes('ab negative') || lower.includes('এবি নেগেটিভ')) setSelectedGroup('AB-');
        }
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
        setShowVoiceQuickTray(true);
        setVoiceNotice(
          lang === 'bn'
            ? 'মাইক্রোফোন অনুমতি বন্ধ আছে — নিচের ১-ট্যাপ কুইক ভয়েস সার্চ বাটন ট্যাপ করুন।'
            : 'Microphone blocked by browser/preview — tap any Quick Voice Search preset below.'
        );
        setTimeout(() => setVoiceNotice(null), 5000);
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
      setShowVoiceQuickTray(true);
    }
  };

  const handleResetFilters = () => {
    clearCachedDeviceGps();
    setSelectedGroup('ALL');
    setSelectedDistrict('ALL');
    setIncludeCompatible(true);
    setIncludeNearbyDistricts(true);
    setSearchQuery('');
    setCustomPlaceCoords(null);
    setLocationMode('MANUAL');
    setGpsAvailable(false);
    setOnlyAvailable(false);
    setOnlyVerified(false);
    setOnlyNightReady(false);
    setOnlyCampusClub(false);
    setOnlyShortlisted(false);
    setGpsFeedback(null);
  };

  const activeMoreFilterCount = useMemo(() => {
    let count = 0;
    if (onlyVerified) count += 1;
    if (onlyNightReady) count += 1;
    if (onlyCampusClub) count += 1;
    return count;
  }, [onlyVerified, onlyNightReady, onlyCampusClub]);

  const combinedUnsuccessfulSet = useMemo(() => {
    const s = new Set<string>(localUnsuccessfulIds);
    (externalUnsuccessfulIds || []).forEach((id) => s.add(id));
    return s;
  }, [localUnsuccessfulIds, externalUnsuccessfulIds]);

  const handleMarkUnsuccessfulAndNext = useCallback(
    (donor: Donor) => {
      setLocalUnsuccessfulIds((prev) => (prev.includes(donor.id) ? prev : [...prev, donor.id]));
      if (onRecordContactOutcome) {
        onRecordContactOutcome(donor, 'NO_ANSWER');
      }
      setOutcomeBanner(
        lang === 'bn'
          ? `${donor.name}-কে নিচে সরানো হয়েছে — পরের রক্তদাতা উপরে এসেছে।`
          : `Moved ${donor.name} down and promoted the next best donor.`
      );
      window.setTimeout(() => setOutcomeBanner(null), 3500);
    },
    [lang, onRecordContactOutcome]
  );

  // Run multi-factor matcher + automatic Zero-Dead-End fallback so typing an unknown clinic name never traps user on 0 results!
  const { rankedResults, usedSmartNearbyFallback } = useMemo(() => {
    const shortlistSet = new Set(shortlistedIds);
    const prefiltered = donors.filter((donor) => {
      if (onlyShortlisted && !shortlistSet.has(donor.id)) return false;
      if (onlyVerified && !donor.verifiedBadge) return false;
      if (onlyNightReady) {
        const bioLower = `${donor.bio || ''} ${donor.hospitalAffiliation || ''}`.toLowerCase();
        const isNightVolunteer =
          donor.available &&
          (donor.verifiedBadge ||
            bioLower.includes('রাত') ||
            bioLower.includes('24') ||
            bioLower.includes('২৪') ||
            bioLower.includes('জরুরি') ||
            bioLower.includes('night') ||
            (donor.reliabilityScore || 0) >= 92);
        if (!isNightVolunteer) return false;
      }
      if (onlyCampusClub) {
        const affil = `${donor.hospitalAffiliation || ''} ${donor.bio || ''}`.toLowerCase();
        const isSquad =
          affil.includes('সন্ধানী') ||
          affil.includes('sandhani') ||
          affil.includes('বাঁধন') ||
          affil.includes('badhan') ||
          affil.includes('রেড ক্রিসেন্ট') ||
          affil.includes('red crescent') ||
          affil.includes('কোয়ান্টাম') ||
          affil.includes('quantum') ||
          affil.includes('মেডিকেল') ||
          affil.includes('medical') ||
          affil.includes('বিশ্ববিদ্যালয়') ||
          affil.includes('university') ||
          affil.includes('ক্লাব') ||
          donor.totalDonations >= 4;
        if (!isSquad) return false;
      }
      return true;
    });

    const primary = rankDonorsForSeeker(prefiltered, {
      bloodGroup: selectedGroup,
      compatibleMatchEnabled: includeCompatible,
      district: selectedDistrict,
      areaQuery: searchQuery,
      urgency: 'CRITICAL',
      requiredTimeWindow: 'IMMEDIATE_2H',
      originCoords: effectiveOriginCoords,
      includeNearbyDistricts,
      onlyConfirmedOrAvailable: onlyAvailable,
      seekerIsVerifiedUser: isVerifiedSeeker,
      unsuccessfulDonorIds: combinedUnsuccessfulSet,
      lang,
    });

    // Smart forgiving fallback: if user typed a custom hospital/clinic string that matched 0 donor names,
    // show nearby compatible donors sorted by distance instead of an empty dead-end screen!
    if (primary.length === 0 && searchQuery.trim().length > 0 && prefiltered.length > 0 && !onlyShortlisted) {
      const nearbyFallback = rankDonorsForSeeker(prefiltered, {
        bloodGroup: selectedGroup,
        compatibleMatchEnabled: includeCompatible,
        district: selectedDistrict,
        urgency: 'CRITICAL',
        requiredTimeWindow: 'IMMEDIATE_2H',
        originCoords: effectiveOriginCoords,
        includeNearbyDistricts: true,
        onlyConfirmedOrAvailable: onlyAvailable,
        seekerIsVerifiedUser: isVerifiedSeeker,
        unsuccessfulDonorIds: combinedUnsuccessfulSet,
        lang,
      });
      if (nearbyFallback.length > 0) {
        return { rankedResults: nearbyFallback, usedSmartNearbyFallback: true };
      }
    }

    return { rankedResults: primary, usedSmartNearbyFallback: false };
  }, [
    donors,
    onlyShortlisted,
    shortlistedIds,
    selectedGroup,
    includeCompatible,
    selectedDistrict,
    effectiveOriginCoords,
    includeNearbyDistricts,
    onlyAvailable,
    onlyVerified,
    onlyNightReady,
    onlyCampusClub,
    searchQuery,
    isVerifiedSeeker,
    combinedUnsuccessfulSet,
    lang,
  ]);

  const visibleRanked = useMemo(
    () => rankedResults.slice(0, visibleCount),
    [rankedResults, visibleCount]
  );

  // Pre-resolve authorized direct contacts for visible opted-in cloud donors (at most once per donor ID)
  useEffect(() => {
    let cancelled = false;
    const toResolve = visibleRanked
      .map((r) => r.donor)
      .filter((d) => {
        if (!isPhoneMaskedOrInvalid(d.phone)) return false;
        if (resolvedDirectContacts[d.id]) return false;
        if (attemptedDirectContactIdsRef.current.has(d.id)) return false;
        if (/^(d|donor-)\d+$/.test(d.id)) return false;
        return canSeekerViewDirectContact(d, isVerifiedSeeker).allowed;
      })
      .slice(0, 12);

    if (toResolve.length === 0) return;

    for (const d of toResolve) {
      attemptedDirectContactIdsRef.current.add(d.id);
    }

    Promise.all(
      toResolve.map(async (d) => {
        const contact = await fetchUnmaskedDonorContactIfAuthorized(d.id).catch(() => null);
        return { id: d.id, contact };
      })
    ).then((items) => {
      if (cancelled) return;
      const patch: typeof resolvedDirectContacts = {};
      let added = 0;
      for (const item of items) {
        if (item.contact && !isPhoneMaskedOrInvalid(item.contact.phone)) {
          patch[item.id] = {
            phone: item.contact.phone,
            whatsappPhone: item.contact.whatsappPhone,
            facebookUrl: item.contact.facebookUrl,
            allowCall: item.contact.allowCall,
            allowWhatsApp: item.contact.allowWhatsApp,
          };
          added += 1;
        }
      }
      if (added > 0) {
        setResolvedDirectContacts((prev) => ({ ...prev, ...patch }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visibleRanked, isVerifiedSeeker, resolvedDirectContacts]);

  const confirmedRecentCount = useMemo(
    () => rankedResults.filter((r) => r.availabilityConfidence === 'CONFIRMED_RECENT').length,
    [rankedResults]
  );

  return (
    <div
      className="space-y-4 text-left"
      onClick={() => showPlaceSuggestions && setShowPlaceSuggestions(false)}
    >
      {outcomeBanner && (
        <div className="p-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold">
          {outcomeBanner}
        </div>
      )}

      {/* CLEAN 2-STEP EASY DONOR FINDER CARD */}
      <div className="surface-card rounded-3xl overflow-hidden transition-colors">
        <div className="section-jewel-ocean text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
              {lang === 'bn' ? 'রক্তদাতা খুঁজুন (নিজের মতো সার্চ)' : 'Find Blood Donors Easily'}
            </h1>
            <p className="text-xs text-sky-100/90 mt-0.5">
              {lang === 'bn'
                ? '১) রক্তের গ্রুপ বেছে নিন · ২) নিজের মতো হাসপাতাল, এলাকা বা জেলা লিখে খুঁজুন'
                : '1) Pick blood group · 2) Enter your own hospital, area, or district'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onOpenRegister && (
              <button
                type="button"
                onClick={onOpenRegister}
                className="min-h-[42px] flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl btn-emerald cursor-pointer whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>{lang === 'bn' ? '+ ডোনার হোন' : '+ Become Donor'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenSOSModal({
                  bloodGroup: selectedGroup !== 'ALL' ? selectedGroup : undefined,
                  district:
                    resolvedTypedPlace?.districtId ||
                    (selectedDistrict !== 'ALL' ? selectedDistrict : undefined),
                  hospitalName: resolvedTypedPlace
                    ? lang === 'bn'
                      ? resolvedTypedPlace.labelBn
                      : resolvedTypedPlace.labelEn
                    : searchQuery.trim() || undefined,
                })
              }
              className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl btn-crimson cursor-pointer whitespace-nowrap shrink-0"
            >
              <Heart className="w-3.5 h-3.5 fill-white shrink-0" />
              <span>{lang === 'bn' ? 'রক্তের রিকোয়েস্ট দিন' : 'Request Blood'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
        {/* STEP 1: 1-TAP BLOOD GROUP SELECTOR */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-[#0b2239] dark:text-slate-200">
              {lang === 'bn' ? '১. কোন গ্রুপের রক্ত লাগবে?' : '1. Which blood group is needed?'}
            </label>
            {selectedGroup !== 'ALL' && (
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  id="search-include-compatible"
                  name="includeCompatible"
                  type="checkbox"
                  checked={includeCompatible}
                  onChange={(e) => setIncludeCompatible(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span>
                  {lang === 'bn' ? 'বিকল্প ম্যাচিং গ্রুপসহ' : 'Include compatible groups'}
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedGroup('ALL')}
              className={`min-h-[44px] px-3.5 sm:px-4 py-2 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                selectedGroup === 'ALL' ? 'btn-crimson' : 'btn-surface'
              }`}
            >
              {lang === 'bn' ? 'সব গ্রুপ' : 'All'}
            </button>

            {ALL_BLOOD_GROUPS.map((group) => {
              const isSelected = selectedGroup === group;
              return (
                <button
                  type="button"
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`min-h-[44px] min-w-[50px] px-3 py-2 text-xs sm:text-sm font-black rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected ? 'btn-crimson' : 'btn-surface'
                  }`}
                >
                  {group}
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: HOSPITAL / AREA SMART INPUT + DISTRICT + 1-TAP GPS */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
            {lang === 'bn'
              ? '২. কোন হাসপাতালে বা এলাকায় রক্ত লাগবে?'
              : '2. Which hospital or area?'}
          </label>

          <div className="grid grid-cols-1 @md:grid-cols-12 gap-2.5">
            {/* Smart Hospital / Area Autocomplete Box */}
            <div
              className="@md:col-span-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-rose-500 pointer-events-none" />
              <input
                id="donor-hospital-area-search"
                name="hospitalOrAreaQuery"
                type="text"
                placeholder={
                  isListening
                    ? lang === 'bn'
                      ? 'শুনছি... মুখে বলুন'
                      : 'Listening...'
                    : lang === 'bn'
                      ? 'হাসপাতাল বা এলাকা লিখুন (যেমন: Square Hospital, DMCH, ধানমন্ডি)...'
                      : 'Type hospital or area (e.g. Square Hospital, DMCH, Dhanmondi)...'
                }
                value={searchQuery}
                onFocus={() => setShowPlaceSuggestions(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCustomPlaceCoords(null);
                  if (locationMode === 'PLACE') setLocationMode('MANUAL');
                  setShowPlaceSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (placeSuggestions.length > 0) {
                      const top = placeSuggestions[0];
                      setSearchQuery(top.title);
                      setCustomPlaceCoords(top.coords);
                      setLocationMode('PLACE');
                    } else if (resolvedTypedPlace) {
                      setCustomPlaceCoords(resolvedTypedPlace.coords);
                      setLocationMode('PLACE');
                    }
                    setShowPlaceSuggestions(false);
                  }
                }}
                className={`w-full h-11 pl-10 pr-16 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#0d1322] text-slate-900 dark:text-white placeholder:text-slate-400 border transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isListening
                    ? 'border-rose-500 ring-2 ring-rose-500/30'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
              <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCustomPlaceCoords(null);
                      if (locationMode === 'PLACE') setLocationMode('MANUAL');
                      setShowPlaceSuggestions(false);
                    }}
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    isListening
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-rose-600 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                  title={lang === 'bn' ? 'ভয়েস সার্চ' : 'Voice Search'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              {showPlaceSuggestions && placeSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-12 z-40 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {placeSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery(item.title);
                        setCustomPlaceCoords(item.coords);
                        setLocationMode('PLACE');
                        setShowPlaceSuggestions(false);
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-sky-50/70 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.kind === 'HOSPITAL' ? (
                          <Hospital className="w-4 h-4 text-rose-500 shrink-0" />
                        ) : (
                          <MapPin className="w-4 h-4 text-sky-600 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 shrink-0">
                        {lang === 'bn' ? 'নির্বাচন' : 'Select'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Simple District Dropdown */}
            <div className="@md:col-span-3">
              <select
                id="donor-district-select"
                name="selectedDistrict"
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                aria-label="Select District"
                className="w-full h-11 px-3 text-xs sm:text-sm font-semibold rounded-xl bg-slate-50 dark:bg-[#0d1322] text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                <option value="ALL">
                  {lang === 'bn' ? 'সকল জেলা (All BD)' : 'All 64 Districts'}
                </option>
                {DISTRICTS.map((dist) => (
                  <option key={dist.id} value={dist.id}>
                    {lang === 'bn' ? dist.nameBn : dist.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* 1-Tap Live GPS Toggle + Reset */}
            <div className="@md:col-span-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleLocateLiveGps}
                disabled={isLocatingGps}
                title={
                  locationMode === 'GPS' && gpsAvailable
                    ? lang === 'bn'
                      ? 'GPS বন্ধ করতে ট্যাপ করুন'
                      : 'Tap to turn off GPS'
                    : lang === 'bn'
                      ? 'আপনার বর্তমান লোকেশন ব্যবহার করুন'
                      : 'Use your live device GPS'
                }
                className={`flex-1 min-h-[44px] px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  locationMode === 'GPS' && gpsAvailable ? 'btn-emerald' : 'btn-sky'
                }`}
              >
                <LocateFixed className={`w-3.5 h-3.5 shrink-0 ${isLocatingGps ? 'animate-spin' : ''}`} />
                <span>
                  {isLocatingGps
                    ? lang === 'bn'
                      ? 'খোঁজা হচ্ছে...'
                      : 'Locating...'
                    : locationMode === 'GPS' && gpsAvailable
                      ? lang === 'bn'
                        ? 'GPS চালু ✓'
                        : 'GPS On ✓'
                      : lang === 'bn'
                        ? 'আমার GPS'
                        : 'My GPS'}
                </span>
              </button>

              {(selectedGroup !== 'ALL' ||
                selectedDistrict !== 'ALL' ||
                searchQuery.trim() !== '' ||
                (locationMode === 'GPS' && gpsAvailable) ||
                onlyAvailable ||
                onlyShortlisted ||
                activeMoreFilterCount > 0) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="min-h-[44px] px-3 rounded-xl btn-surface text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                  title={lang === 'bn' ? 'সব রিসেট করুন' : 'Reset'}
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
                </button>
              )}
            </div>
          </div>

          {/* 1-Tap Popular Hospital & Area Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0 mr-1">
              {lang === 'bn' ? 'দ্রুত বাছাই:' : 'Quick pick:'}
            </span>
            {QUICK_HOSPITAL_CHIPS.map((chip) => {
              const active = searchQuery.toLowerCase() === chip.query.toLowerCase();
              return (
                <button
                  key={chip.query}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setSearchQuery('');
                      setCustomPlaceCoords(null);
                      if (locationMode === 'PLACE') setLocationMode('MANUAL');
                    } else {
                      setSearchQuery(chip.query);
                      const resolved = resolvePlaceOrHospitalQuery(chip.query);
                      if (resolved) {
                        setCustomPlaceCoords(resolved.coords);
                        setLocationMode('PLACE');
                      }
                      setSelectedDistrict('ALL');
                    }
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'btn-sky'
                      : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-[#0d1322] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  {lang === 'bn' ? chip.labelBn : chip.labelEn}
                </button>
              );
            })}
          </div>

          {voiceNotice && (
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              {voiceNotice}
            </p>
          )}

          {showVoiceQuickTray && (
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200/80 dark:border-rose-900/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
                  {lang === 'bn'
                    ? '🎙️ কুইক ভয়েস সার্চ প্রিসেট (১-ট্যাপে গ্রুপ + এলাকা বেছে নিন):'
                    : '🎙️ Quick Voice Search Presets (1-tap Blood Group + Area):'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowVoiceQuickTray(false)}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  {lang === 'bn' ? 'বন্ধ করুন ✕' : 'Close ✕'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { group: 'O+' as BloodGroup, query: 'Niketon', label: 'O+ Niketon' },
                    { group: 'A+' as BloodGroup, query: 'Dhanmondi', label: 'A+ Dhanmondi' },
                    { group: 'B+' as BloodGroup, query: 'Mirpur', label: 'B+ Mirpur' },
                    { group: 'O-' as BloodGroup, query: 'Uttara', label: 'O- Uttara' },
                    { group: 'AB+' as BloodGroup, query: 'Gulshan', label: 'AB+ Gulshan' },
                    { group: 'O+' as BloodGroup, query: 'LabAid Hospital', label: 'O+ LabAid Hospital' },
                    { group: 'A-' as BloodGroup, query: 'Square Hospital', label: 'A- Square Hospital' },
                    { group: 'B-' as BloodGroup, query: 'DMCH', label: 'B- DMCH' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setSelectedGroup(preset.group);
                      setSearchQuery(preset.query);
                      setSelectedDistrict('ALL');
                      setShowVoiceQuickTray(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0d1322] hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 text-slate-800 dark:text-slate-200 border border-rose-200 dark:border-rose-800/70 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gpsFeedback && (
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {gpsFeedback}
            </p>
          )}

          {/* Helpful Resolved Hospital / Location Banner */}
          {resolvedTypedPlace && (
            <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/70 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {lang === 'bn'
                    ? `${resolvedTypedPlace.labelBn}-এর সবচেয়ে কাছের ডোনারদের দূরত্ব অনুযায়ী দেখানো হচ্ছে`
                    : `Showing compatible donors closest to ${resolvedTypedPlace.labelEn}`}
                </span>
              </span>
            </div>
          )}

          {usedSmartNearbyFallback && !resolvedTypedPlace && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-950 dark:text-amber-200">
              {lang === 'bn'
                ? `"${searchQuery}" নামে সরাসরি কোনো প্রোফাইল নেই — তাই আপনার এলাকার সবচেয়ে কাছের সামঞ্জস্যপূর্ণ রক্তদাতাদের দেখানো হচ্ছে।`
                : `No exact profile text matched "${searchQuery}" — showing nearest compatible donors instead.`}
            </div>
          )}
        </div>

        {/* Minimal Footer Bar: Available Toggle + Saved + Optional More Filters + Count */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyAvailable((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                onlyAvailable ? 'btn-emerald' : 'btn-surface'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'bn' ? 'শুধু প্রস্তুত ডোনার' : 'Ready Now Only'}</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyShortlisted((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                onlyShortlisted ? 'btn-amber' : 'btn-surface'
              }`}
            >
              <Bookmark
                className={`w-3.5 h-3.5 shrink-0 ${onlyShortlisted ? 'fill-white' : ''}`}
              />
              <span className="tabular-nums">
                {lang === 'bn'
                  ? `সেভ করা (${shortlistedIds.length})`
                  : `Saved (${shortlistedIds.length})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowMoreFilters((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showMoreFilters || activeMoreFilterCount > 0 ? 'btn-indigo' : 'btn-surface'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>
                {lang === 'bn' ? 'আরও অপশন' : 'More'}
                {activeMoreFilterCount > 0 ? ` (${activeMoreFilterCount})` : ''}
              </span>
              {showMoreFilters ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>

          {/* Clean Tabular Count Summary */}
          <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span className="text-rose-600 dark:text-rose-400 font-bold text-sm">
              {rankedResults.length}
            </span>{' '}
            {t.donorsFound}
            {confirmedRecentCount > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {confirmedRecentCount}{' '}
                  {lang === 'bn' ? 'জন প্রস্তুত' : 'confirmed'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Helpful 1-Tap Banner when active Blood Group / District filter hides other registered donors */}
        {donors.length > rankedResults.length &&
          (selectedGroup !== 'ALL' ||
            selectedDistrict !== 'ALL' ||
            onlyAvailable ||
            onlyVerified ||
            searchQuery.trim() !== '') && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200/80 dark:border-sky-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-sky-950 dark:text-sky-200 font-semibold">
                {lang === 'bn'
                  ? `ডিরেক্টরিতে মোট ${donors.length} জন নিবন্ধিত রক্তদাতা আছেন (${selectedGroup !== 'ALL' ? `বর্তমানে ${selectedGroup} গ্রুপের ফিল্টার চালু` : 'ফিল্টার চালু'})।`
                  : `${donors.length} registered donors in directory (${selectedGroup !== 'ALL' ? `filtered for ${selectedGroup}` : 'filters active'}).`}
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[34px] px-3 py-1 rounded-lg btn-sky font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                {lang === 'bn'
                  ? `সব রক্তের গ্রুপ দেখুন (${donors.length} জন)`
                  : `Show All ${donors.length} Donors`}
              </button>
            </div>
          )}

        {/* Clean Optional More Filters (Collapsed by Default) */}
        {showMoreFilters && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setOnlyVerified((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                onlyVerified ? 'btn-sky' : 'btn-surface'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t.verifiedOnly}</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyNightReady((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                onlyNightReady ? 'btn-violet' : 'btn-surface'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'রাতে রক্তদানে প্রস্তুত' : 'Night Ready'}</span>
            </button>

            <button
              type="button"
              onClick={() => setOnlyCampusClub((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                onlyCampusClub ? 'btn-indigo' : 'btn-surface'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'সন্ধানী / বাঁধন / ক্লাব' : 'Campus & Clubs'}</span>
            </button>

            {selectedDistrict !== 'ALL' && (
              <button
                type="button"
                onClick={() => setIncludeNearbyDistricts((v) => !v)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  includeNearbyDistricts ? 'btn-teal' : 'btn-surface'
                }`}
              >
                <Expand className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {lang === 'bn' ? 'আশেপাশের জেলা যুক্ত' : 'Nearby Districts On'}
                </span>
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* DONORS CARD GRID */}
      {rankedResults.length === 0 ? (
        <div className="surface-card rounded-2xl p-8 sm:p-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {donors.length === 0
                ? lang === 'bn'
                  ? 'এখনো কোনো নিবন্ধিত রক্তদাতা যুক্ত হননি'
                  : 'No Registered Donors Yet'
                : lang === 'bn'
                  ? 'এই মুহূর্তে কোনো ম্যাচিং ডোনার পাওয়া যায়নি'
                  : 'No matching donors in this filter'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              {lang === 'bn'
                ? 'নিচের বাটনে চাপ দিয়ে সব এলাকার ডোনার দেখুন অথবা ১৫ সেকেন্ডে জরুরি রক্তের রিকোয়েস্ট পোস্ট করুন।'
                : 'Show all nearby donors in one tap or post a quick 15-second blood request below.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {donors.length > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[44px] px-4 py-2.5 btn-obsidian font-bold text-xs rounded-xl cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Expand className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'bn'
                    ? 'সকল রক্তদাতা দেখুন'
                    : 'Show All Available Donors'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenSOSModal({
                  bloodGroup: selectedGroup !== 'ALL' ? selectedGroup : undefined,
                  district: selectedDistrict !== 'ALL' ? selectedDistrict : undefined,
                  hospitalName: searchQuery.trim() || undefined,
                })
              }
              className="min-h-[44px] px-4 py-2.5 btn-crimson font-bold text-xs rounded-xl cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Heart className="w-4 h-4 fill-white shrink-0" />
              <span>
                {lang === 'bn' ? 'রক্তের রিকোয়েস্ট পোস্ট করুন' : 'Post Blood Request'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3.5">
            {visibleRanked.map((entry) => {
              const {
                donor,
                bloodMatchType,
                distanceKm,
                availabilityConfidence,
                isMedicallyEligible,
                recoveryDaysLeft,
                freshnessLabel,
                wasAttemptedUnsuccessfully,
              } = entry;

              const districtObj = DISTRICTS.find(
                (d) =>
                  d.id === donor.district.toLowerCase() ||
                  d.nameBn === donor.district.trim() ||
                  d.nameEn.toLowerCase() === donor.district.trim().toLowerCase()
              );
              const districtName = districtObj
                ? lang === 'bn'
                  ? districtObj.nameBn
                  : districtObj.nameEn
                : donor.district;
              const upazilaObj = districtObj?.upazilas.find(
                (u) =>
                  u.id === donor.upazila.toLowerCase() ||
                  u.nameBn === donor.upazila.trim() ||
                  u.nameEn.toLowerCase() === donor.upazila.trim().toLowerCase()
              );
              const upazilaName = upazilaObj
                ? lang === 'bn'
                  ? upazilaObj.nameBn
                  : upazilaObj.nameEn
                : donor.upazila;

              const consentCheck = canSeekerViewDirectContact(donor, isVerifiedSeeker);
              const cachedDirect = resolvedDirectContacts[donor.id];

              const effectiveRawPhone =
                cachedDirect?.phone ||
                (!isPhoneMaskedOrInvalid(donor.phone) && consentCheck.allowed
                  ? donor.phone
                  : null);
              const effectiveWaPhone =
                cachedDirect?.whatsappPhone ||
                (!isPhoneMaskedOrInvalid(donor.whatsappPhone) && consentCheck.allowed
                  ? donor.whatsappPhone
                  : effectiveRawPhone);

              const effectiveFacebookUrl = consentCheck.allowed
                ? normalizeFacebookProfileUrl(cachedDirect?.facebookUrl || donor.facebookUrl || '')
                : '';

              const allowCall = cachedDirect?.allowCall ?? donor.allowCall !== false;
              const allowWhatsApp =
                cachedDirect?.allowWhatsApp ?? donor.allowWhatsApp !== false;
              const allowSms = cachedDirect?.allowSms ?? donor.allowSms !== false;

              const emergencyQuickMsg =
                lang === 'bn'
                  ? `আসসালামু আলাইকুম ${donor.name}, জরুরি রক্তের (${donor.bloodGroup}) প্রয়োজনে BloodSearch থেকে যোগাযোগ করছি। আপনি কি রক্তদানে প্রস্তুত আছেন?`
                  : `Hello ${donor.name}, reaching out via BloodSearch for an urgent ${donor.bloodGroup} blood need. Are you currently available?`;

              const directCallHref =
                consentCheck.allowed && allowCall ? buildDirectCallHref(effectiveRawPhone) : null;
              const directWaHref =
                consentCheck.allowed && allowWhatsApp
                  ? buildWhatsAppHref(effectiveWaPhone, emergencyQuickMsg)
                  : null;
              const directSmsHref =
                consentCheck.allowed && allowSms
                  ? buildDirectSmsHref(effectiveRawPhone, emergencyQuickMsg)
                  : null;

              const isConfirmedMatch = confirmedDonorId === donor.id;
              const isAdminDonor =
                donor.panelType === 'ADMIN' ||
                Boolean(
                  donor.hospitalAffiliation?.includes('অ্যাডমিন') ||
                    donor.hospitalAffiliation?.toLowerCase().includes('admin')
                );
              const isShortlisted = shortlistedIds.includes(donor.id);

              return (
                <div
                  key={donor.id}
                  className={`cv-auto surface-card rounded-2xl p-4 sm:p-5 transition-colors flex flex-col justify-between ${
                    isConfirmedMatch
                      ? 'border-emerald-500 ring-1 ring-emerald-500'
                      : wasAttemptedUnsuccessfully
                        ? 'opacity-75'
                        : isAdminDonor
                          ? 'border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/25 dark:bg-indigo-950/20 hover:border-indigo-400 dark:hover:border-indigo-500'
                          : 'hover:border-emerald-400 dark:hover:border-emerald-600'
                  }`}
                >
                  <div>
                    {/* Top Row: Blood Group, Name & Conditional Honest Distance */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black text-lg tracking-tight shrink-0 ${
                            isAdminDonor ? 'btn-indigo' : 'btn-crimson'
                          }`}
                        >
                          <span>{donor.bloodGroup}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                              {donor.name}
                            </h3>
                            {isAdminDonor && (
                              <span
                                title={lang === 'bn' ? 'অ্যাডমিন ও রক্ত সমন্বয়ক' : 'Admin Coordinator'}
                                className="text-amber-500 dark:text-amber-400 shrink-0"
                              >
                                <ShieldCheck className="w-4 h-4" />
                              </span>
                            )}
                            {donor.verifiedBadge && (
                              <span
                                title={t.verifiedDonor}
                                className="text-sky-500 dark:text-sky-400 shrink-0"
                              >
                                <CheckCircle2 className="w-4 h-4 fill-sky-500 text-white dark:fill-sky-400 dark:text-slate-900" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {selectedGroup !== 'ALL' && (
                              <>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {bloodMatchType === 'EXACT'
                                    ? lang === 'bn'
                                      ? 'সরাসরি গ্রুপ ম্যাচ'
                                      : 'Exact Match'
                                    : lang === 'bn'
                                      ? 'বিকল্প ম্যাচিং গ্রুপ'
                                      : 'Compatible'}
                                </span>
                                <span aria-hidden="true"> · </span>
                              </>
                            )}
                            <span
                              className={
                                isAdminDonor
                                  ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                                  : 'font-medium text-emerald-700 dark:text-emerald-400'
                              }
                            >
                              {donor.hospitalAffiliation ||
                                (isAdminDonor
                                  ? lang === 'bn'
                                    ? 'অ্যাডমিন ও রক্ত সমন্বয়ক'
                                    : 'Admin Coordinator'
                                  : lang === 'bn'
                                    ? 'স্বেচ্ছাসেবী রক্তদাতা'
                                    : 'Volunteer Donor')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-start gap-2">
                        <div className="text-right">
                          {availabilityConfidence === 'CONFIRMED_RECENT' ? (
                            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                              {lang === 'bn' ? 'প্রস্তুত' : 'Available'}
                            </div>
                          ) : availabilityConfidence === 'UNKNOWN_UNCONFIRMED' ? (
                            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                              {lang === 'bn' ? 'সক্রিয়' : 'Active'}
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-slate-400">
                              {lang === 'bn' ? 'বিরতিতে' : 'Paused'}
                            </div>
                          )}
                          {hasActiveLocationReference && (
                            <div className="text-[11px] font-mono tabular-nums text-sky-700 dark:text-sky-400 font-bold mt-0.5">
                              ~{formatDistance(distanceKm, lang)}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleShortlistDonor(donor.id)}
                          aria-label={
                            isShortlisted
                              ? 'Remove from shortlist'
                              : 'Save donor to shortlist'
                          }
                          className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${
                            isShortlisted ? 'btn-amber' : 'btn-surface'
                          }`}
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              isShortlisted
                                ? 'fill-white text-white'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Unboxed Location & Freshness Metadata */}
                    <div className="py-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200 truncate">
                          <MapPin
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isAdminDonor ? 'text-indigo-500' : 'text-teal-600 dark:text-teal-400'
                            }`}
                          />
                          <span className="truncate">
                            {upazilaName ? `${upazilaName}, ${districtName}` : districtName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {donor.totalDonations > 0 && (
                            <>
                              <span>
                                {donor.totalDonations} {t.donationsCount}
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-bold">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {donor.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{freshnessLabel}</span>
                        </span>
                        <span>
                          {!isMedicallyEligible ? (
                            <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                              {lang === 'bn'
                                ? `বিরতি বাকি: ${recoveryDaysLeft} দিন`
                                : `Cooldown: ${recoveryDaysLeft}d left`}
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {lang === 'bn' ? 'রক্তদানে উপযুক্ত' : 'Eligible now'}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Direct 1-Tap Contact Actions */}
                  <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate">
                        {consentCheck.allowed
                          ? lang === 'bn'
                            ? 'সরাসরি কল, WhatsApp, SMS ও Facebook খোলা আছে'
                            : 'Direct Call, WhatsApp, SMS & Facebook ready'
                          : lang === 'bn'
                            ? 'ইন-অ্যাপ চ্যাট বা অনুমতির মাধ্যমে যোগাযোগ'
                            : 'Chat or request contact'}
                      </span>

                      {!wasAttemptedUnsuccessfully && availabilityConfidence !== 'DND' && (
                        <button
                          type="button"
                          onClick={() => handleMarkUnsuccessfulAndNext(donor)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <SkipForward className="w-3 h-3" />
                          <span>{lang === 'bn' ? 'ফোন ধরেনি? পরের জন' : 'No Answer? Next'}</span>
                        </button>
                      )}
                    </div>

                    {consentCheck.allowed ? (
                      <div
                        className={`grid gap-2 ${
                          effectiveFacebookUrl
                            ? 'grid-cols-2 sm:grid-cols-4'
                            : 'grid-cols-3'
                        }`}
                      >
                        {directCallHref ? (
                          <a
                            href={directCallHref}
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-crimson flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRevealPhone(donor)}
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-crimson flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                          </button>
                        )}

                        {directWaHref ? (
                          <a
                            href={directWaHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-emerald flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRevealPhone(donor)}
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-emerald flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </button>
                        )}

                        {directSmsHref ? (
                          <a
                            href={directSmsHref}
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-sky flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>SMS</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRevealPhone(donor)}
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-sky flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>SMS</span>
                          </button>
                        )}

                        {effectiveFacebookUrl && (
                          <a
                            href={effectiveFacebookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full min-h-[42px] px-2 py-2 text-xs font-bold rounded-xl btn-facebook flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span>Facebook</span>
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onRevealPhone(donor)}
                          disabled={availabilityConfidence === 'DND'}
                          className="w-full min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl btn-sky flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {lang === 'bn' ? 'নম্বর দেখুন' : 'Request Contact'}
                          </span>
                        </button>
                        {onStartChatWithDonor && (
                          <button
                            type="button"
                            onClick={() => onStartChatWithDonor(donor)}
                            className="w-full min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl btn-violet flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            <span>{lang === 'bn' ? 'মেসেজ দিন' : 'Chat'}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {rankedResults.length > visibleCount && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_CHUNK)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl btn-obsidian font-bold text-xs cursor-pointer"
              >
                {lang === 'bn'
                  ? `আরও রক্তদাতা দেখুন (${rankedResults.length - visibleCount} জন বাকি)`
                  : `Load More Donors (${rankedResults.length - visibleCount} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const DonorSearch = React.memo(DonorSearchComponent);
