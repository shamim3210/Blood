import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BloodRequest,
  BloodGroup,
  UrgencyLevel,
  Language,
  Donor,
  RequestAlertItem,
  RequestLifecycleState,
  LiveDonorTrip,
  LiveDonorTripStatus,
} from '../types';
import { ALL_BLOOD_GROUPS } from '../data/compatibility';
import { DISTRICTS } from '../data/bangladeshGeo';
import { getTranslation } from '../utils/translations';
import {
  auth,
  isUserVerifiedForWrites,
  getStoredDevOtpSandboxSession,
  signInWithGoogleReal,
  parseFirebaseAuthError,
  buildWhatsAppChatUrl,
  fetchRequestDirectContact,
  subscribeAlertsForAuthorRequests,
  escalateBloodRequestInFirestore,
  updateBloodRequestTrackingInFirestore,
} from '../services/bloodSearchService';
import {
  computeEscalationTargets,
  deriveRequestLifecycleState,
  rankDonorsForSeeker,
  canSeekerViewDirectContact,
  buildDirectCallHref,
  buildWhatsAppHref,
  isValidBangladeshMobilePhone,
  normalizeValidBangladeshMobileE164,
  formatBangladeshPhoneDisplay,
  isPhoneMaskedOrInvalid,
} from '../utils/donorMatcher';
import {
  resolveBangladeshCoordinates,
  formatDistance,
  formatTravelEta,
} from '../utils/geolocation';
import {
  buildOfflineEmergencySmsUri,
  copyTextReliable,
  shareOrCopyEmergencyText,
  formatRelativeRequestTime,
} from '../utils/sosAlertEngine';
import {
  MapPin,
  Phone,
  Clock,
  Users,
  Share2,
  UserCheck,
  Plus,
  CheckCircle,
  Hospital,
  ExternalLink,
  Mail,
  RefreshCw,
  Expand,
  XCircle,
  AlertTriangle,
  SkipForward,
  MessageSquare,
  Copy,
  Check,
  Trash2,
  ShieldCheck,
  Navigation,
  X,
} from 'lucide-react';

interface RequestsFeedProps {
  requests: BloodRequest[];
  donors?: Donor[];
  liveTrips?: LiveDonorTrip[];
  lang: Language;
  onOpenSOSModal: () => void;
  onRespondToRequest: (
    requestId: string,
    responderName: string,
    responderPhone: string,
    group: BloodGroup,
    note?: string
  ) => Promise<{
    ok: boolean;
    reason?: string;
    seekerContactName?: string;
    seekerContactPhone?: string;
    authorUid?: string;
  }>;
  onStartLiveTrip?: (
    req: BloodRequest,
    responderName: string,
    responderPhone: string,
    group: BloodGroup
  ) => Promise<LiveDonorTrip>;
  onUpdateLiveTripStatus?: (tripId: string, status: LiveDonorTripStatus) => Promise<void> | void;
  onTrackTripOnMap?: (tripId: string) => void;
  onRevealPhone?: (donor: Donor) => void;
  onUpdateRequestLocal?: (reqId: string, patch: Partial<BloodRequest>) => void;
  onDeleteRequest?: (reqId: string) => Promise<boolean>;
  onOpenAuthModal?: () => void;
  onStartChatWithRequester?: (req: BloodRequest) => void;
  initialRespondRequest?: BloodRequest | null;
  onClearInitialRespondRequest?: () => void;
}

const LIFECYCLE_LABELS: Record<
  RequestLifecycleState,
  { en: string; bn: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' }
> = {
  SEARCHING: { en: 'Searching', bn: 'রক্তদাতা খোঁজা হচ্ছে', tone: 'amber' },
  DONORS_NOTIFIED: { en: 'Donors Notified', bn: 'ডোনারদের নোটিফাই করা হয়েছে', tone: 'amber' },
  RESPONSES_RECEIVED: { en: 'Responses Received', bn: 'সাড়া পাওয়া গেছে', tone: 'emerald' },
  CONTACT_ATTEMPTED: { en: 'Contact Attempted', bn: 'যোগাযোগের চেষ্টা চলছে', tone: 'amber' },
  DONOR_CONFIRMED: { en: 'Donor Confirmed', bn: 'রক্তদাতা নিশ্চিত', tone: 'emerald' },
  FULFILLED: { en: 'Fulfilled', bn: 'রক্ত সংগৃহীত (সম্পন্ন)', tone: 'emerald' },
  NO_RESPONSE: { en: 'No Response Yet', bn: 'এখনও সাড়া মেলেনি', tone: 'rose' },
  CANCELLED: { en: 'Cancelled', bn: 'বাতিলকৃত', tone: 'slate' },
  EXPIRED: { en: 'Expired', bn: 'মেয়াদ উত্তীর্ণ', tone: 'slate' },
};

export const RequestsFeed: React.FC<RequestsFeedProps> = ({
  requests,
  donors = [],
  liveTrips = [],
  lang,
  onOpenSOSModal,
  onRespondToRequest,
  onStartLiveTrip,
  onUpdateLiveTripStatus,
  onTrackTripOnMap,
  onRevealPhone,
  onUpdateRequestLocal,
  onDeleteRequest,
  onOpenAuthModal,
  onStartChatWithRequester,
  initialRespondRequest,
  onClearInitialRespondRequest,
}) => {
  const t = getTranslation(lang);

  const [selectedGroup, setSelectedGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState<UrgencyLevel | 'ALL'>('ALL');
  const [showResolved, setShowResolved] = useState<boolean>(false);

  // Volunteer responder sheet state
  const [respondingToReq, setRespondingToReq] = useState<BloodRequest | null>(null);
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorGroup, setDonorGroup] = useState<BloodGroup>('O+');
  const [arrivalNote, setArrivalNote] = useState('');
  const [shareLiveLocation, setShareLiveLocation] = useState<boolean>(true);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Interactive Direct Call & SMS Modal state (works on Desktop, Mobile & Sandbox iFrame!)
  const [contactModalState, setContactModalState] = useState<{
    req: BloodRequest;
    mode: 'CALL' | 'SMS';
    resolvedPhone: string;
    resolvedContactName: string;
    isResolving: boolean;
  } | null>(null);
  const [copiedModalPhone, setCopiedModalPhone] = useState(false);
  const [copiedModalSms, setCopiedModalSms] = useState(false);

  const [shareSuccessId, setShareSuccessId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [myRequestAlerts, setMyRequestAlerts] = useState<RequestAlertItem[]>([]);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [unsuccessfulByReq, setUnsuccessfulByReq] = useState<Record<string, string[]>>({});
  const autoEscalatedStepRef = useRef<Record<string, number>>({});

  const cloudUid = auth.currentUser?.uid || null;
  const devOtpUid = getStoredDevOtpSandboxSession()?.uid || null;
  const currentUid = cloudUid || devOtpUid;
  const isVerifiedSeeker = Boolean(
    isUserVerifiedForWrites(auth.currentUser) || devOtpUid
  );

  // Refresh relative timestamps every 30s so "Just now" updates naturally
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Subscribe to real-time alert delivery & response states for requests owned by signed-in user
  useEffect(() => {
    if (!cloudUid) {
      setMyRequestAlerts([]);
      return;
    }
    const unsub = subscribeAlertsForAuthorRequests(cloudUid, (alerts) => {
      setMyRequestAlerts(alerts);
    });
    return () => unsub();
  }, [cloudUid]);

  const alertsByRequestId = useMemo(() => {
    const map = new Map<string, RequestAlertItem[]>();
    for (const a of myRequestAlerts) {
      const list = map.get(a.requestId) || [];
      list.push(a);
      map.set(a.requestId, list);
    }
    return map;
  }, [myRequestAlerts]);

  const showNotice = useCallback((msg: string) => {
    setActionToast(msg);
    window.setTimeout(() => setActionToast(null), 4500);
  }, []);

  const openContactModal = useCallback(
    async (req: BloodRequest, mode: 'CALL' | 'SMS') => {
      setCopiedModalPhone(false);
      setCopiedModalSms(false);
      const existingValid = !isPhoneMaskedOrInvalid(req.contactPhone) ? req.contactPhone : '';

      if (existingValid) {
        setContactModalState({
          req,
          mode,
          resolvedPhone: existingValid,
          resolvedContactName: req.contactName || req.patientName,
          isResolving: false,
        });
        return;
      }

      setContactModalState({
        req,
        mode,
        resolvedPhone: '',
        resolvedContactName: req.contactName || req.patientName,
        isResolving: true,
      });

      const direct = await fetchRequestDirectContact(req.id).catch(() => null);
      if (direct && !isPhoneMaskedOrInvalid(direct.contactPhone)) {
        onUpdateRequestLocal?.(req.id, {
          contactPhone: direct.contactPhone,
          contactName: direct.contactName || req.contactName,
        });
        setContactModalState((prev) =>
          prev && prev.req.id === req.id
            ? {
                ...prev,
                resolvedPhone: direct.contactPhone,
                resolvedContactName: direct.contactName || req.contactName || req.patientName,
                isResolving: false,
              }
            : prev
        );
      } else {
        setContactModalState((prev) =>
          prev && prev.req.id === req.id ? { ...prev, isResolving: false } : prev
        );
      }
    },
    [onUpdateRequestLocal]
  );

  const handleEscalateRequest = useCallback(
    async (req: BloodRequest, isAuto = false) => {
      if (req.status !== 'ACTIVE') return;
      const currentLevel = Number(req.escalationLevel) || 0;
      if (currentLevel >= 4) {
        if (!isAuto) {
          showNotice(
            lang === 'bn'
              ? 'সর্বোচ্চ সারাদেশ পরিধিতে ইতিমধ্যে সম্প্রচারিত হয়েছে।'
              : 'Already expanded to maximum nationwide radius.'
          );
        }
        return;
      }

      setEscalatingId(req.id);
      try {
        const existingAlerts = alertsByRequestId.get(req.id) || [];
        const alreadyNotified = existingAlerts.map((a) => a.donorUid);
        const nextLevel = currentLevel + 1;

        const plan = computeEscalationTargets({
          targetLevel: nextLevel,
          bloodGroup: req.bloodGroup,
          originDistrict: req.district,
          allDonors: donors,
          alreadyNotifiedDonorIds: alreadyNotified,
          excludeUid: currentUid || undefined,
          exchangeAllowed: req.exchangeAllowed,
        });

        const newIds = plan.eligibleDonorsToNotify.map((d) => d.id);
        const res = await escalateBloodRequestInFirestore({
          requestId: req.id,
          nextEscalationLevel: plan.nextLevel,
          nextRadiusKm: plan.radiusKm,
          additionalCloudDonorIds: newIds,
          seekerCallbackPhone: req.contactPhone,
        });

        const totalNotified = (req.notifiedCount || 0) + (res.newlyNotified || newIds.length);
        onUpdateRequestLocal?.(req.id, {
          escalationLevel: plan.nextLevel,
          searchRadiusKm: plan.radiusKm,
          notifiedCount: totalNotified,
          lifecycleState:
            (req.respondedCount || 0) > 0 || req.responders.length > 0
              ? 'RESPONSES_RECEIVED'
              : totalNotified > 0
              ? 'DONORS_NOTIFIED'
              : 'NO_RESPONSE',
        });

        showNotice(
          lang === 'bn'
            ? `সার্চ পরিধি প্রসারিত হয়েছে (${plan.tierLabelBn}) — নতুন ${res.newlyNotified || newIds.length} জন ডোনারকে নোটিফাই করা হয়েছে।`
            : `Expanded search to ${plan.tierLabelEn} — notified ${res.newlyNotified || newIds.length} additional matching donor(s).`
        );
      } finally {
        setEscalatingId(null);
      }
    },
    [alertsByRequestId, donors, currentUid, lang, onUpdateRequestLocal, showNotice]
  );

  // Automatic no-response radius escalation while seeker keeps feed open
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      for (const req of requests) {
        if (req.status !== 'ACTIVE') continue;
        const isMine =
          (currentUid && req.authorUid === currentUid) ||
          (!req.authorUid && req.id.startsWith('sos_'));
        if (!isMine) continue;

        const alerts = alertsByRequestId.get(req.id) || [];
        const hasAccepted =
          req.responders.length > 0 ||
          (req.respondedCount || 0) > 0 ||
          alerts.some((a) => a.deliveryState === 'RESPONDED_ACCEPT');
        if (hasAccepted || req.confirmedDonorId) continue;

        const intervalMs = (req.escalationIntervalMinutes || 10) * 60 * 1000;
        const createdMs = req.createdAtMs || 0;
        if (!createdMs) continue;

        const elapsed = now - createdMs;
        const expectedLevel = Math.min(4, Math.floor(elapsed / intervalMs));
        const currentLevel = req.escalationLevel || 0;
        const prevAuto = autoEscalatedStepRef.current[req.id] || 0;

        if (expectedLevel > currentLevel && expectedLevel > prevAuto) {
          autoEscalatedStepRef.current[req.id] = expectedLevel;
          handleEscalateRequest(req, true).catch(() => {});
        }
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [requests, currentUid, alertsByRequestId, handleEscalateRequest]);

  const handleLifecycleAction = async (
    req: BloodRequest,
    action: 'FULFILLED' | 'CANCELLED' | 'ATTEMPT' | 'CONFIRM_DONOR',
    donor?: Donor
  ) => {
    if (action === 'FULFILLED' || action === 'CANCELLED') {
      await updateBloodRequestTrackingInFirestore({
        requestId: req.id,
        status: action,
        lifecycleState: action,
      }).catch(() => false);
      onUpdateRequestLocal?.(req.id, {
        status: action,
        lifecycleState: action,
        unitsCollected: action === 'FULFILLED' ? req.unitsNeeded : req.unitsCollected,
      });
      const safeReqId = req.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      const terminalTripState: LiveDonorTripStatus =
        action === 'FULFILLED' ? 'COMPLETED' : 'CANCELLED';
      for (const tr of liveTrips) {
        if (
          tr.requestId === safeReqId &&
          (tr.tripStatus === 'ON_THE_WAY' || tr.tripStatus === 'ARRIVED')
        ) {
          onUpdateLiveTripStatus?.(tr.id, terminalTripState);
        }
      }
      showNotice(
        action === 'FULFILLED'
          ? lang === 'bn'
            ? '✓ আবেদনটি সম্পন্ন হিসেবে চিহ্নিত হয়েছে — পরবর্তী সকল অ্যালার্ট ও লাইভ ট্র্যাকিং সম্পন্ন হয়েছে।'
            : '✓ Request marked Fulfilled — all future alerts and live tracking halted.'
          : lang === 'bn'
          ? 'আবেদনটি বাতিল করা হয়েছে — পরবর্তী সকল অ্যালার্ট বন্ধ করা হয়েছে।'
          : 'Request Cancelled — all future alerts halted.'
      );
      return;
    }

    if (action === 'CONFIRM_DONOR' && donor) {
      await updateBloodRequestTrackingInFirestore({
        requestId: req.id,
        lifecycleState: 'DONOR_CONFIRMED',
        confirmedDonorId: donor.id,
        confirmedDonorName: donor.name,
      }).catch(() => false);
      onUpdateRequestLocal?.(req.id, {
        lifecycleState: 'DONOR_CONFIRMED',
        confirmedDonorId: donor.id,
        confirmedDonorName: donor.name,
      });
      showNotice(
        lang === 'bn'
          ? `✓ ${donor.name}-কে নিশ্চিত রক্তদাতা হিসেবে যুক্ত করা হয়েছে।`
          : `✓ Confirmed ${donor.name} for this request.`
      );
      return;
    }

    if (action === 'ATTEMPT') {
      if (donor) {
        setUnsuccessfulByReq((prev) => ({
          ...prev,
          [req.id]: [...(prev[req.id] || []), donor.id],
        }));
      }
      await updateBloodRequestTrackingInFirestore({
        requestId: req.id,
        lifecycleState: 'CONTACT_ATTEMPTED',
        incrementContactAttempt: true,
      }).catch(() => false);
      onUpdateRequestLocal?.(req.id, {
        lifecycleState: 'CONTACT_ATTEMPTED',
        contactAttemptsCount: (req.contactAttemptsCount || 0) + 1,
      });
      showNotice(
        lang === 'bn'
          ? 'যোগাযোগের চেষ্টা রেকর্ড হয়েছে — পরবর্তী উপলব্ধ ডোনার দেখানো হচ্ছে।'
          : 'Recorded unsuccessful attempt — advancing to next ranked donor.'
      );
    }
  };

  const handleRemoveOwnRequest = async (req: BloodRequest) => {
    if (!onDeleteRequest || deletingId === req.id) return;
    setDeletingId(req.id);
    try {
      await onDeleteRequest(req.id);
    } finally {
      setDeletingId(null);
    }
  };

  const openRespondSheetWithPrefill = useCallback((req: BloodRequest) => {
    setRespondError(null);
    setRespondingToReq(req);
    const devSess = getStoredDevOtpSandboxSession();
    let savedName = auth.currentUser?.displayName || '';
    let savedPhone = auth.currentUser?.phoneNumber || devSess?.phoneLocal || '';
    let savedGroup: BloodGroup = req.bloodGroup;
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name) savedName = parsed.name;
        if (parsed?.phone && !isPhoneMaskedOrInvalid(parsed.phone)) savedPhone = parsed.phone;
        if (parsed?.bloodGroup) savedGroup = parsed.bloodGroup;
      }
    } catch {}
    if (savedName) setDonorName(savedName);
    if (savedPhone) setDonorPhone(savedPhone);
    setDonorGroup(savedGroup);
    setShareLiveLocation(true);
  }, []);

  useEffect(() => {
    if (initialRespondRequest) {
      openRespondSheetWithPrefill(initialRespondRequest);
      if (onClearInitialRespondRequest) {
        onClearInitialRespondRequest();
      }
    }
  }, [initialRespondRequest, openRespondSheetWithPrefill, onClearInitialRespondRequest]);

  const filteredRequests = requests.filter((req) => {
    if (!showResolved && req.status !== 'ACTIVE') return false;
    if (selectedGroup !== 'ALL' && req.bloodGroup !== selectedGroup) return false;
    if (selectedUrgency !== 'ALL' && req.urgency !== selectedUrgency) return false;
    return true;
  });

  const handleConfirmResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondingToReq || isSubmittingResponse) return;
    setRespondError(null);

    const cleanName = donorName.trim();
    const normalizedPhone = normalizeValidBangladeshMobileE164(donorPhone);

    if (cleanName.length < 2) {
      setRespondError(
        lang === 'bn'
          ? 'অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।'
          : 'Please enter your full name.'
      );
      return;
    }

    if (!normalizedPhone || !isValidBangladeshMobilePhone(donorPhone)) {
      setRespondError(
        lang === 'bn'
          ? 'সঠিক ১১ ডিজিটের সচল বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 01712345678)।'
          : 'Please enter a valid 11-digit Bangladesh mobile number (e.g. 01712345678).'
      );
      return;
    }

    // Trigger Google popup synchronously ONLY if volunteer has neither Firebase Auth nor Dev OTP session on a cloud request
    const devSess = getStoredDevOtpSandboxSession();
    const isLocalOnlyReq =
      respondingToReq.id.startsWith('sos_') || respondingToReq.id.startsWith('req-');
    let pendingAuthPromise: Promise<any> | null = null;
    if (!auth.currentUser && !devSess && !isLocalOnlyReq) {
      pendingAuthPromise = signInWithGoogleReal();
    }

    setIsSubmittingResponse(true);
    try {
      if (pendingAuthPromise) {
        try {
          await pendingAuthPromise;
        } catch (authErr: any) {
          const parsed = parseFirebaseAuthError(authErr);
          setRespondError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
          setIsSubmittingResponse(false);
          return;
        }
      }

      const res = await onRespondToRequest(
        respondingToReq.id,
        cleanName,
        normalizedPhone,
        donorGroup,
        arrivalNote.trim() ||
          (lang === 'bn' ? 'আমি হাসপাতালে এসে রক্ত দিতে প্রস্তুত আছি।' : 'Ready to donate at the hospital.')
      );

      if (!res.ok) {
        if (res.reason === 'SELF_PLEDGE') {
          setRespondError(
            lang === 'bn'
              ? 'এটি আপনার নিজের পোস্ট করা আবেদন। নিজের আবেদনে স্বেচ্ছাসেবী হিসেবে নাম যোগ করা যাবে না।'
              : 'You cannot pledge as a volunteer on your own blood request.'
          );
          return;
        }
        if (res.reason === 'ALREADY_RESPONDED') {
          if (shareLiveLocation && onStartLiveTrip) {
            await onStartLiveTrip(
              respondingToReq,
              cleanName,
              normalizedPhone,
              donorGroup
            ).catch(() => null);
            setRespondingToReq(null);
            setArrivalNote('');
            showNotice(
              lang === 'bn'
                ? '✓ আপনার লাইভ অন-দ্য-ওয়ে রুট ও পৌঁছানোর সময় রোগীর স্বজনের জন্য চালু হয়েছে!'
                : '✓ Live on-the-way route & ETA tracking is now active for the patient family!'
            );
            return;
          }
          setRespondError(
            lang === 'bn'
              ? 'আপনি ইতিমধ্যে এই আবেদনে রক্তদানের সাড়া নিশ্চিত করেছেন।'
              : 'You have already responded to this blood request.'
          );
          return;
        }
        if (res.reason === 'ALREADY_FULFILLED') {
          setRespondError(
            lang === 'bn'
              ? 'এই আবেদনের রক্ত ইতিমধ্যে সংগৃহীত হয়েছে।'
              : 'This blood request has already been fulfilled.'
          );
          return;
        }
        if (res.reason === 'AUTH_REQUIRED') {
          setRespondError(
            lang === 'bn'
              ? 'রক্তদানে সাড়া নিশ্চিত করতে Google দিয়ে ভেরিফাইড লগইন সম্পন্ন করুন।'
              : 'Please sign in with Google to verify and record your donation pledge.'
          );
          if (onOpenAuthModal) onOpenAuthModal();
          return;
        }
      }

      const targetReqSnapshot = respondingToReq;

      if (shareLiveLocation && onStartLiveTrip) {
        await onStartLiveTrip(
          targetReqSnapshot,
          cleanName,
          normalizedPhone,
          donorGroup
        ).catch(() => null);
      }

      // Mutual Contact Exchange: Immediately reveal the Finder/Requester's phone, Call & WhatsApp to the willing donor!
      let finderPhone =
        res.seekerContactPhone ||
        (!isPhoneMaskedOrInvalid(targetReqSnapshot.contactPhone)
          ? targetReqSnapshot.contactPhone
          : '');
      let finderName =
        res.seekerContactName ||
        targetReqSnapshot.contactName ||
        targetReqSnapshot.patientName;

      if (!finderPhone) {
        const fetched = await fetchRequestDirectContact(targetReqSnapshot.id).catch(() => null);
        if (fetched?.contactPhone) {
          finderPhone = fetched.contactPhone;
          finderName = fetched.contactName || finderName;
        }
      }

      setRespondingToReq(null);
      setArrivalNote('');

      if (finderPhone) {
        setCopiedModalPhone(false);
        setCopiedModalSms(false);
        setContactModalState({
          req: targetReqSnapshot,
          mode: 'CALL',
          resolvedPhone: finderPhone,
          resolvedContactName: finderName,
          isResolving: false,
        });
      }

      showNotice(
        shareLiveLocation
          ? lang === 'bn'
            ? '✓ ধন্যবাদ! আপনার নম্বর রোগীর পরিবারের কাছে গেছে এবং রোগীর যোগাযোগের নম্বর আপনার স্ক্রিনে খোলা হয়েছে।'
            : '✓ Thank you! Both sides now have direct Call & WhatsApp contact details.'
          : lang === 'bn'
            ? '✓ ধন্যবাদ! আপনার রক্তদানের সাড়া ও নম্বর রোগীর পরিবারের কাছে পাঠানো হয়েছে এবং তাদের নম্বর নিচে দেখানো হচ্ছে।'
            : '✓ Thank you! Your callback phone was shared with the finder, and their direct contact is now unlocked.'
      );
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const handleShare = async (req: BloodRequest) => {
    const validPhone = !isPhoneMaskedOrInvalid(req.contactPhone)
      ? formatBangladeshPhoneDisplay(req.contactPhone)
      : '';
    const neededBags = Math.max(1, req.unitsNeeded - req.unitsCollected);
    const shareText =
      lang === 'bn'
        ? `জরুরি রক্তের প্রয়োজন: ${req.bloodGroup} (${neededBags} ব্যাগ)\nরোগী: ${req.patientName}\nহাসপাতাল: ${req.hospitalName} (${req.district})\n${validPhone ? `যোগাযোগ: ${validPhone}` : ''}`
        : `Emergency Blood Needed: ${req.bloodGroup} (${neededBags} bag(s))\nPatient: ${req.patientName}\nHospital: ${req.hospitalName} (${req.district})\n${validPhone ? `Contact: ${validPhone}` : ''}`;

    const outcome = await shareOrCopyEmergencyText({
      title: 'BloodSearch Emergency Blood Request',
      text: shareText,
      url: window.location.origin,
    });

    setShareSuccessId(req.id);
    window.setTimeout(() => setShareSuccessId(null), 2400);
    if (outcome === 'COPIED') {
      showNotice(
        lang === 'bn'
          ? '✓ জরুরি রক্তের আবেদনের তথ্য কপি হয়েছে — এখন ফেসবুক, মেসেঞ্জার বা WhatsApp-এ পেস্ট করুন।'
          : '✓ Emergency request copied to clipboard — paste it anywhere to share.'
      );
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* Medical Disclaimer */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300/80 dark:border-amber-800/70 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {lang === 'bn'
            ? 'জরুরি চিকিৎসা পরামর্শ: BloodSearch কোনো জরুরি হাসপাতাল বা অ্যাম্বুলেন্স সেবা নয় এবং রক্তের নিশ্চয়তা দেয় না। জরুরি অবস্থায় হাসপাতালের ব্লাড ব্যাংক, চিকিৎসক বা ৯৯৯-এ যোগাযোগ করুন।'
            : 'Medical Disclaimer: BloodSearch is not an emergency medical service and cannot guarantee blood availability. Always coordinate directly with your hospital blood bank, physician, or call 999.'}
        </p>
      </div>

      {actionToast && (
        <div className="p-3.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold shadow-sm">
          {actionToast}
        </div>
      )}

      {/* Feed Header */}
      <div className="surface-card rounded-3xl overflow-hidden transition-colors">
        <div className="section-jewel-ruby text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {t.navRequestsFeed}
            </h1>
            <p className="text-xs sm:text-sm text-rose-100/90 mt-1">
              {lang === 'bn'
                ? 'সক্রিয় রক্তের আবেদন, রিয়েল-টাইম সাড়া ট্র্যাকিং ও সরাসরি হাসপাতাল যোগাযোগ'
                : 'Verified emergency blood requests, real-time response tracking, and direct hospital contact'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-white cursor-pointer min-h-[44px] px-3 rounded-xl bg-white/12 hover:bg-white/20 border border-white/20">
              <input
                id="sos-feed-show-resolved"
                name="showResolved"
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="rounded border-white/40 text-rose-600 w-4 h-4"
              />
              <span className="whitespace-nowrap">
                {lang === 'bn' ? 'সম্পন্ন/বাতিল দেখান' : 'Show Resolved'}
              </span>
            </label>
            <button
              type="button"
              onClick={onOpenSOSModal}
              className="min-h-[44px] flex items-center gap-1.5 px-4 py-2.5 rounded-xl btn-crimson font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t.createSosTitle}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 sm:px-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedGroup('ALL')}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap ${
                selectedGroup === 'ALL' ? 'btn-crimson' : 'btn-surface'
              }`}
            >
              {t.allBloodGroups}
            </button>
            {ALL_BLOOD_GROUPS.map((bg) => (
              <button
                type="button"
                key={bg}
                onClick={() => setSelectedGroup(bg)}
                className={`min-h-[40px] min-w-[44px] px-3 py-1.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap ${
                  selectedGroup === bg ? 'btn-crimson' : 'btn-surface'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {(['ALL', 'CRITICAL', 'URGENT'] as (UrgencyLevel | 'ALL')[]).map((urg) => {
              const label =
                urg === 'ALL'
                  ? lang === 'bn'
                    ? 'সকল'
                    : 'All'
                  : urg === 'CRITICAL'
                  ? lang === 'bn'
                    ? 'অতি জরুরি'
                    : 'Critical'
                  : lang === 'bn'
                  ? 'জরুরি'
                  : 'Urgent';
              return (
                <button
                  type="button"
                  key={urg}
                  onClick={() => setSelectedUrgency(urg)}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap ${
                    selectedUrgency === urg ? 'btn-obsidian' : 'btn-surface'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Requests List or Clean Empty State */}
      {filteredRequests.length === 0 ? (
        <div className="surface-card rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600">
            <Hospital className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'এই মুহূর্তে কোনো সক্রিয় রক্তের আবেদন নেই'
                : 'No Active Blood Requests Right Now'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              {lang === 'bn'
                ? 'কোনো রোগীর জন্য জরুরি রক্তের প্রয়োজন হলে নিচের বাটনে ক্লিক করে ভেরিফাইড আবেদন পোস্ট করুন।'
                : 'If someone urgently needs blood, post a verified emergency request below.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {(selectedGroup !== 'ALL' || selectedUrgency !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGroup('ALL');
                  setSelectedUrgency('ALL');
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl btn-obsidian font-bold text-xs cursor-pointer whitespace-nowrap"
              >
                {lang === 'bn' ? 'সকল ফিল্টার রিসেট করুন' : 'Reset Filters'}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSOSModal}
              className="min-h-[44px] px-5 py-2.5 rounded-xl btn-crimson font-bold text-xs inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t.createSosTitle}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const districtObj = DISTRICTS.find(
              (d) =>
                d.id === req.district.toLowerCase() ||
                d.nameBn === req.district.trim() ||
                d.nameEn.toLowerCase() === req.district.trim().toLowerCase()
            );
            const districtName = districtObj
              ? lang === 'bn'
                ? districtObj.nameBn
                : districtObj.nameEn
              : req.district;
            const upazilaObj = districtObj?.upazilas.find(
              (u) =>
                u.id === req.upazila.toLowerCase() ||
                u.nameBn === req.upazila.trim() ||
                u.nameEn.toLowerCase() === req.upazila.trim().toLowerCase()
            );
            const upazilaName = upazilaObj
              ? lang === 'bn'
                ? upazilaObj.nameBn
                : upazilaObj.nameEn
              : req.upazila;

            const reqAlerts = alertsByRequestId.get(req.id) || [];
            const dispatchedCount = Math.max(req.notifiedCount || 0, reqAlerts.length);
            const viewedCount = Math.max(
              req.viewedCount || 0,
              reqAlerts.filter(
                (a) =>
                  a.deliveryState === 'VIEWED' ||
                  a.deliveryState === 'RESPONDED_ACCEPT' ||
                  a.deliveryState === 'RESPONDED_DECLINE'
              ).length
            );
            const acceptedAlerts = reqAlerts.filter(
              (a) => a.deliveryState === 'RESPONDED_ACCEPT'
            );
            const respondedCount = Math.max(
              req.respondedCount || 0,
              req.responders.length,
              acceptedAlerts.length
            );

            const effectiveLifecycle = deriveRequestLifecycleState({
              ...req,
              notifiedCount: dispatchedCount,
              viewedCount,
              respondedCount,
            });
            const lifecycleMeta = LIFECYCLE_LABELS[effectiveLifecycle];

            const isOwner =
              Boolean(currentUid && req.authorUid === currentUid) ||
              Boolean(!req.authorUid && req.id.startsWith('sos_'));
            const isActive = req.status === 'ACTIVE' && effectiveLifecycle !== 'EXPIRED';

            // Direct call matching opted-in donors for seeker while broadcast runs
            const directCallCandidates =
              isOwner && isActive
                ? rankDonorsForSeeker(donors, {
                    bloodGroup: req.bloodGroup,
                    compatibleMatchEnabled: true,
                    exchangeAllowed: req.exchangeAllowed,
                    district: req.district,
                    urgency: req.urgency,
                    originCoords: resolveBangladeshCoordinates({ district: req.district }),
                    includeNearbyDistricts: (req.escalationLevel || 0) >= 2,
                    onlyConfirmedOrAvailable: true,
                    seekerIsVerifiedUser: isVerifiedSeeker,
                    unsuccessfulDonorIds: unsuccessfulByReq[req.id] || [],
                    lang,
                  })
                    .filter((r) => canSeekerViewDirectContact(r.donor, isVerifiedSeeker).allowed)
                    .slice(0, 3)
                : [];

            const hasValidPhone = !isPhoneMaskedOrInvalid(req.contactPhone);
            const formattedContactDisplay = hasValidPhone
              ? formatBangladeshPhoneDisplay(req.contactPhone)
              : '';
            const hospitalMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${req.hospitalName} ${districtName} Bangladesh`
            )}`;

            const neededBags = Math.max(1, req.unitsNeeded - req.unitsCollected);
            const directDonorMsg =
              lang === 'bn'
                ? `আসসালামু আলাইকুম, আমি BloodSearch থেকে ${req.patientName}-এর জন্য ${req.bloodGroup} রক্তদানের বিষয়ে যোগাযোগ করছি (${req.hospitalName}, ${districtName})।`
                : `Hello, I am reaching out from BloodSearch regarding ${req.bloodGroup} blood donation for ${req.patientName} at ${req.hospitalName}, ${districtName}.`;

            const smsShareText =
              lang === 'bn'
                ? `জরুরি রক্তের প্রয়োজন: ${req.bloodGroup} (${neededBags} ব্যাগ) — ${req.hospitalName}, ${districtName}। রোগী: ${req.patientName}${hasValidPhone ? `, যোগাযোগ: ${formattedContactDisplay}` : ''}`
                : `Emergency Blood Request: ${req.bloodGroup} (${neededBags} bag(s)) at ${req.hospitalName}, ${districtName}. Patient: ${req.patientName}${hasValidPhone ? `, Contact: ${formattedContactDisplay}` : ''}`;

            const waTargetUrl = hasValidPhone
              ? buildWhatsAppChatUrl(req.contactPhone, directDonorMsg)
              : buildWhatsAppChatUrl('', smsShareText);

            const relativeTimeLabel = formatRelativeRequestTime(
              req.createdAtMs,
              req.createdAt,
              lang,
              nowTick
            );

            const isExchangeOk =
              Boolean(req.exchangeAllowed) ||
              (req.reason || '').includes('এক্সচেঞ্জ') ||
              (req.reason || '').toLowerCase().includes('exchange');

            return (
              <div
                key={req.id}
                className={`cv-auto surface-card rounded-2xl p-4 sm:p-5 transition-colors space-y-3.5 ${
                  !isActive
                    ? 'opacity-80'
                    : 'hover:border-rose-400 dark:hover:border-rose-600'
                }`}
              >
                {/* Top Row: Group, Patient, Lifecycle State & Units */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl btn-crimson flex flex-col items-center justify-center font-black text-lg shrink-0">
                      <span>{req.bloodGroup}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                          {req.patientName}
                        </h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          ({req.patientAge} {lang === 'bn' ? 'বছর' : 'y'})
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            req.urgency === 'CRITICAL'
                              ? 'text-red-600 dark:text-red-400'
                              : req.urgency === 'URGENT'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {req.urgency === 'CRITICAL'
                            ? lang === 'bn'
                              ? 'অতি জরুরি'
                              : 'Critical'
                            : req.urgency === 'URGENT'
                            ? lang === 'bn'
                              ? 'জরুরি'
                              : 'Urgent'
                            : lang === 'bn'
                            ? 'নির্ধারিত'
                            : 'Scheduled'}
                        </span>
                        {isExchangeOk && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                            · <RefreshCw className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'এক্সচেঞ্জ' : 'Exchange OK'}</span>
                          </span>
                        )}
                      </div>

                      {/* Clean Unboxed Lifecycle & Live Relative Time Metadata */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        <span
                          className={`font-bold ${
                            lifecycleMeta.tone === 'emerald'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : lifecycleMeta.tone === 'rose'
                              ? 'text-rose-600 dark:text-rose-400'
                              : lifecycleMeta.tone === 'amber'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {lang === 'bn' ? lifecycleMeta.bn : lifecycleMeta.en}
                        </span>
                        <span aria-hidden="true">·</span>
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{relativeTimeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-rose-600 dark:text-rose-400">
                          {req.requiredDate}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      {lang === 'bn' ? 'সংগ্রহ/প্রয়োজন' : 'Units'}
                    </div>
                    <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {req.unitsCollected}/{req.unitsNeeded}
                    </div>
                  </div>
                </div>

                {/* Hospital & Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-200 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Hospital className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="font-medium truncate">{req.hospitalName}</span>
                    </div>
                    <a
                      href={hospitalMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap"
                    >
                      <span>{lang === 'bn' ? 'ম্যাপ' : 'Map'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 min-w-0">
                    <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                    <span className="truncate">
                      {upazilaName}, {districtName}
                    </span>
                  </div>
                </div>

                {req.confirmedDonorName && (
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {lang === 'bn'
                      ? `✓ নিশ্চিতকৃত রক্তদাতা: ${req.confirmedDonorName}`
                      : `✓ Confirmed Donor: ${req.confirmedDonorName}`}
                  </div>
                )}

                {/* UBER / PATHAO-STYLE LIVE DONOR ON-THE-WAY TRACKER */}
                {(() => {
                  const safeReqId = req.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
                  const activeReqTrips = liveTrips.filter(
                    (tr) =>
                      tr.requestId === safeReqId &&
                      (tr.tripStatus === 'ON_THE_WAY' || tr.tripStatus === 'ARRIVED')
                  );
                  if (activeReqTrips.length === 0) return null;

                  return (
                    <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>
                            {lang === 'bn'
                              ? 'লাইভ রক্তদাতা হাসপাতালে আসছেন'
                              : 'Live Donor On the Way'}
                          </span>
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                          {activeReqTrips.length}{' '}
                          {lang === 'bn' ? 'জন পথে' : 'active'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {activeReqTrips.map((tr) => {
                          const isMyTrip =
                            Boolean(currentUid && tr.donorUid === currentUid) ||
                            tr.donorUid === 'local_donor';
                          const tripCallHref = !isPhoneMaskedOrInvalid(tr.responderPhone)
                            ? buildDirectCallHref(tr.responderPhone)
                            : null;

                          return (
                            <div
                              key={tr.id}
                              className="p-3 rounded-xl bg-white dark:bg-[#0f172a] border border-emerald-200/80 dark:border-emerald-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                  {tr.bloodGroup}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {tr.donorName}
                                  </div>
                                  <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                      {tr.tripStatus === 'ARRIVED'
                                        ? lang === 'bn'
                                          ? 'হাসপাতালে পৌঁছেছেন ✓'
                                          : 'Arrived at Hospital ✓'
                                        : lang === 'bn'
                                          ? 'পথে আছেন'
                                          : 'On the way'}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate max-w-[160px]">{tr.areaLabel}</span>
                                    {tr.tripStatus === 'ON_THE_WAY' && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <strong className="font-mono text-slate-900 dark:text-white">
                                          {formatTravelEta(tr.etaMinutes, lang)} (
                                          {formatDistance(tr.distanceKm, lang)})
                                        </strong>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                {onTrackTripOnMap && (
                                  <button
                                    type="button"
                                    onClick={() => onTrackTripOnMap(tr.id)}
                                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <Navigation className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600 shrink-0" />
                                    <span>
                                      {lang === 'bn' ? 'ম্যাপে লাইভ দেখুন' : 'Track on Map'}
                                    </span>
                                  </button>
                                )}

                                {tripCallHref && !isMyTrip && (
                                  <a
                                    href={tripCallHref}
                                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                                  >
                                    <Phone className="w-3.5 h-3.5 shrink-0" />
                                    <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                                  </a>
                                )}

                                {isMyTrip && tr.tripStatus === 'ON_THE_WAY' && onUpdateLiveTripStatus && (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateLiveTripStatus(tr.id, 'ARRIVED')}
                                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{lang === 'bn' ? 'পৌঁছে গেছি' : 'Arrived'}</span>
                                  </button>
                                )}

                                {isMyTrip && onUpdateLiveTripStatus && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateLiveTripStatus(
                                        tr.id,
                                        tr.tripStatus === 'ARRIVED' ? 'COMPLETED' : 'CANCELLED'
                                      )
                                    }
                                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl btn-surface font-semibold text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    <span>
                                      {tr.tripStatus === 'ARRIVED'
                                        ? lang === 'bn'
                                          ? 'রক্তদান সম্পন্ন'
                                          : 'Done'
                                        : lang === 'bn'
                                          ? 'লোকেশন বন্ধ'
                                          : 'Stop Sharing'}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Seeker Owner Panel: Honest Delivery Counts, Escalation, Parallel Direct Call & Lifecycle Controls */}
                {isOwner && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {lang === 'bn' ? 'আপনার আবেদনের অগ্রগতি' : 'Your Request Progress'}
                      </div>
                      {onDeleteRequest && (
                        <button
                          type="button"
                          disabled={deletingId === req.id}
                          onClick={() => handleRemoveOwnRequest(req)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>
                            {deletingId === req.id
                              ? lang === 'bn'
                                ? 'মুছে ফেলা হচ্ছে...'
                                : 'Deleting...'
                              : lang === 'bn'
                              ? 'আবেদন মুছে ফেলুন'
                              : 'Delete Post'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-xs py-1.5 border-y border-slate-200/70 dark:border-slate-800">
                      <div>
                        <div className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
                          {dispatchedCount}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lang === 'bn' ? 'প্রেরিত' : 'Dispatched'}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
                          {viewedCount}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lang === 'bn' ? 'দেখেছেন' : 'Viewed'}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono tabular-nums font-bold text-sm text-emerald-700 dark:text-emerald-400">
                          {respondedCount}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lang === 'bn' ? 'সাড়া দিয়েছেন' : 'Responded'}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono tabular-nums font-bold text-sm text-amber-700 dark:text-amber-400">
                          {req.contactAttemptsCount || 0}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lang === 'bn' ? 'কল চেষ্টা' : 'Attempts'}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'bn'
                        ? 'অপেক্ষা না করে নিচের উপলব্ধ রক্তদাতাদের সরাসরি কল বা মেসেজ করুন।'
                        : 'Call or message available opted-in donors below directly while alerts run.'}
                    </p>

                    {/* Accepted Donor Callbacks from Concurrent Alerts */}
                    {acceptedAlerts.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {lang === 'bn'
                            ? 'সাড়া দেওয়া রক্তদাতার কলব্যাক নম্বর:'
                            : 'Responded Donor Callback Numbers:'}
                        </div>
                        {acceptedAlerts.map((al) => {
                          const callUrl = buildDirectCallHref(al.responderPhone);
                          const waUrl = buildWhatsAppHref(
                            al.responderPhone,
                            lang === 'bn'
                              ? `আসসালামু আলাইকুম ${al.responderName || ''}, আমাদের জরুরি ${req.bloodGroup} রক্তের আবেদনে (${req.hospitalName}) সাড়া দেওয়ার জন্য ধন্যবাদ।`
                              : `Hello ${al.responderName || ''}, thank you for responding to our urgent ${req.bloodGroup} blood request at ${req.hospitalName}.`
                          );
                          return (
                            <div
                              key={al.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60"
                            >
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {al.responderName || 'Voluntary Donor'} ·{' '}
                                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatBangladeshPhoneDisplay(al.responderPhone)}
                                </span>
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (al.responderPhone) {
                                      await copyTextReliable(al.responderPhone);
                                      showNotice(
                                        lang === 'bn'
                                          ? '✓ রক্তদাতার নম্বর কপি হয়েছে!'
                                          : '✓ Donor phone copied!'
                                      );
                                    }
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg btn-surface font-bold text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{lang === 'bn' ? 'কপি' : 'Copy'}</span>
                                </button>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#25D366] hover:bg-emerald-500 text-slate-950 font-black text-xs inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <span>WhatsApp</span>
                                  </a>
                                )}
                                {callUrl && (
                                  <a
                                    href={callUrl}
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Parallel Direct Contact Candidates While Alerts Run */}
                    {isActive && directCallCandidates.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {lang === 'bn'
                            ? 'অ্যালার্ট চলাকালীন সরাসরি উপলব্ধ ডোনার:'
                            : 'Available Opted-In Donors to Contact Now:'}
                        </div>
                        {directCallCandidates.map(({ donor, freshnessLabel }) => {
                          const wHref = buildWhatsAppHref(
                            donor.whatsappPhone || donor.phone,
                            `Urgent ${req.bloodGroup} blood needed at ${req.hospitalName}`
                          );
                          return (
                            <div
                              key={donor.id}
                              className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {donor.name} ({donor.bloodGroup})
                                </span>
                                <span className="text-[11px] text-slate-500 block">
                                  {donor.upazila}, {donor.district} · {freshnessLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {onRevealPhone ? (
                                  <button
                                    type="button"
                                    onClick={() => onRevealPhone(donor)}
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>{lang === 'bn' ? 'কল / নম্বর' : 'Contact'}</span>
                                  </button>
                                ) : null}

                                {wHref && (
                                  <a
                                    href={wHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[34px] px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 whitespace-nowrap"
                                    title="Opens WhatsApp"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>WA</span>
                                  </a>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleLifecycleAction(req, 'CONFIRM_DONOR', donor)}
                                  className="min-h-[34px] px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                                >
                                  {lang === 'bn' ? '✓ নিশ্চিত' : '✓ Confirm'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleLifecycleAction(req, 'ATTEMPT', donor)}
                                  className="min-h-[34px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <SkipForward className="w-3 h-3" />
                                  <span>{lang === 'bn' ? 'পরের জন' : 'Next'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Seeker Escalation & Terminal Controls */}
                    {isActive && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={escalatingId === req.id || (req.escalationLevel || 0) >= 4}
                          onClick={() => handleEscalateRequest(req, false)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <Expand className="w-3.5 h-3.5" />
                          <span>
                            {escalatingId === req.id
                              ? lang === 'bn'
                                ? 'পরিধি বাড়ানো হচ্ছে...'
                                : 'Expanding...'
                              : lang === 'bn'
                              ? 'পরিধি ও পার্শ্ববর্তী জেলা বাড়ান'
                              : 'Expand Radius / Nearby Districts'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLifecycleAction(req, 'FULFILLED')}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'রক্ত পাওয়া গেছে' : 'Mark Fulfilled'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLifecycleAction(req, 'CANCELLED')}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'বাতিল করুন' : 'Cancel Request'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Medical Reason */}
                {req.reason && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {lang === 'bn' ? 'কারণ: ' : 'Reason: '}
                    </span>
                    {req.reason}
                  </p>
                )}

                {/* Public Responders & Volunteer Action Bar */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 mb-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Users className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="tabular-nums">
                        {respondedCount > 0
                          ? `${respondedCount} ${t.respondersCount}`
                          : t.noRespondersYet}
                      </span>
                    </div>
                    {hasValidPhone ? (
                      <button
                        type="button"
                        onClick={() => openContactModal(req, 'CALL')}
                        className="text-xs text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 font-mono tabular-nums font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Phone className="w-3 h-3 text-rose-500 shrink-0" />
                        <span>
                          {lang === 'bn' ? 'যোগাযোগ:' : 'Contact:'} {formattedContactDisplay}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {lang === 'bn' ? 'ভেরিফাইড হাসপাতাল যোগাযোগ' : 'Verified Hospital Contact'}
                      </span>
                    )}
                  </div>

                  {req.responders.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 mb-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                      {req.responders.map((resp) => (
                        <span key={resp.id} className="inline-flex items-center gap-1 font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{resp.name}</span>
                          <span className="text-slate-400">({resp.timestamp})</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {isActive && (
                    <div
                      className={`grid gap-2 pt-1 ${
                        isOwner ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-5'
                      }`}
                    >
                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => openRespondSheetWithPrefill(req)}
                          className="col-span-2 sm:col-span-1 min-h-[42px] px-2.5 py-2 rounded-xl btn-crimson font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <UserCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{t.iCanDonate}</span>
                        </button>
                      )}

                      {!isOwner && (
                        <button
                          type="button"
                          onClick={() => openContactModal(req, 'CALL')}
                          className="min-h-[42px] px-2.5 py-2 rounded-xl btn-surface font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Phone className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{lang === 'bn' ? 'কল করুন' : 'Call'}</span>
                        </button>
                      )}

                      <a
                        href={waTargetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] px-2.5 py-2 rounded-xl btn-emerald font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">WhatsApp</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => openContactModal(req, 'SMS')}
                        className="min-h-[42px] px-2.5 py-2 rounded-xl btn-obsidian font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {lang === 'bn' ? 'SMS / মেসেজ' : 'SMS / Message'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShare(req)}
                        className="min-h-[42px] px-2.5 py-2 rounded-xl btn-surface font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {shareSuccessId === req.id
                            ? lang === 'bn'
                              ? 'কপি হয়েছে ✓'
                              : 'Copied ✓'
                            : lang === 'bn'
                            ? 'শেয়ার'
                            : 'Share'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Direct Call & SMS Modal (Works across Mobile, Desktop & iFrame!) */}
      {contactModalState && (() => {
        const activeReq = contactModalState.req;
        const validPhone = !isPhoneMaskedOrInvalid(contactModalState.resolvedPhone)
          ? contactModalState.resolvedPhone
          : '';
        const prettyPhone = validPhone ? formatBangladeshPhoneDisplay(validPhone) : '';
        const callHref = validPhone ? buildDirectCallHref(validPhone) : null;
        const smsText =
          lang === 'bn'
            ? `আসসালামু আলাইকুম, আমি BloodSearch থেকে ${activeReq.patientName}-এর জন্য ${activeReq.bloodGroup} রক্তদানের বিষয়ে যোগাযোগ করছি (${activeReq.hospitalName})। রক্ত কি এখনও প্রয়োজন?`
            : `Hello, I am reaching out from BloodSearch to help with ${activeReq.bloodGroup} blood for ${activeReq.patientName} at ${activeReq.hospitalName}. Is blood still needed?`;
        const smsHref = validPhone ? buildOfflineEmergencySmsUri(validPhone, smsText) : null;
        const waHref = validPhone ? buildWhatsAppChatUrl(validPhone, smsText) : null;
        const canInAppChat = Boolean(
          onStartChatWithRequester &&
            activeReq.authorUid &&
            activeReq.authorUid !== currentUid
        );

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
            <div className="w-full max-w-md my-2 sm:my-auto rounded-2xl bg-white dark:bg-[#1e293b] p-5 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 text-left space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-slate-900 dark:text-white truncate">
                      {contactModalState.mode === 'SMS'
                        ? lang === 'bn'
                          ? 'জরুরি মেসেজ ও SMS যোগাযোগ'
                          : 'Emergency SMS & Direct Message'
                        : lang === 'bn'
                        ? 'সরাসরি কল ও হাসপাতাল যোগাযোগ'
                        : 'Direct Hospital Contact'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeReq.patientName} · {activeReq.bloodGroup} · {activeReq.hospitalName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setContactModalState(null)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Anti-bKash Scam Warning */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed">
                {lang === 'bn'
                  ? 'নিরাপত্তা সতর্কতা: রক্তদান সম্পূর্ণ বিনামূল্যে। হাসপাতালে সরাসরি রোগী ও ডাক্তারের রিকুইজিশন স্লিপ না দেখে কাউকে বিকাশ/নগদে টাকা পাঠাবেন না।'
                  : 'Safety Warning: Voluntary blood donation is 100% free. Never send money via bKash/Nagad; verify the hospital requisition slip in person.'}
              </div>

              {contactModalState.isResolving ? (
                <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {lang === 'bn'
                    ? 'ভেরিফাইড যোগাযোগ নম্বর লোড হচ্ছে...'
                    : 'Loading verified hospital contact number...'}
                </div>
              ) : validPhone ? (
                <div className="space-y-3.5">
                  {/* Verified Phone Box + 1-Click Copy */}
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                        {lang === 'bn'
                          ? `রোগীর স্বজন / যোগাযোগ (${contactModalState.resolvedContactName})`
                          : `Hospital Contact (${contactModalState.resolvedContactName})`}
                      </span>
                      <div className="text-lg sm:text-xl font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
                        {prettyPhone}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyTextReliable(validPhone);
                        if (ok) {
                          setCopiedModalPhone(true);
                          window.setTimeout(() => setCopiedModalPhone(false), 2200);
                        }
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      {copiedModalPhone ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'কপি হয়েছে' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'নম্বর কপি' : 'Copy Number'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Pre-written SMS Box + Copy SMS + Native SMS App */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {lang === 'bn' ? 'প্রস্তুতকৃত জরুরি মেসেজ:' : 'Ready-to-Send Message:'}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyTextReliable(smsText);
                          if (ok) {
                            setCopiedModalSms(true);
                            window.setTimeout(() => setCopiedModalSms(false), 2200);
                          }
                        }}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        {copiedModalSms ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>{lang === 'bn' ? 'মেসেজ কপি ✓' : 'Copied ✓'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'মেসেজ কপি' : 'Copy SMS'}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                      {smsText}
                    </p>
                  </div>

                  {/* Direct Action Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {callHref && (
                      <a
                        href={callHref}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>{lang === 'bn' ? 'ফোন কল' : 'Call Now'}</span>
                      </a>
                    )}
                    {waHref && (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {smsHref && (
                      <a
                        href={smsHref}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>{lang === 'bn' ? 'সিম SMS অ্যাপ' : 'Phone SMS App'}</span>
                      </a>
                    )}
                  </div>

                  {canInAppChat && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetReq = activeReq;
                        setContactModalState(null);
                        onStartChatWithRequester?.(targetReq);
                      }}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#075e54] hover:bg-[#064e46] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'bn'
                          ? 'ইন-অ্যাপ লাইভ চ্যাটে বিনামূল্যে মেসেজ পাঠান'
                          : 'Send Free Message via In-App Live Chat'}
                      </span>
                    </button>
                  )}

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {lang === 'bn'
                      ? 'টিপস: মোবাইলে "ফোন কল" বা "সিম SMS অ্যাপ" সরাসরি ফোনের ডায়ালার/মেসেজ অ্যাপ খুলবে। কম্পিউটার ব্রাউজারে নম্বর কপি করুন অথবা WhatsApp / ইন-অ্যাপ লাইভ চ্যাট ব্যবহার করুন।'
                      : 'Tip: On mobile phones, Call and Phone SMS open your native dialer/SMS app. On desktop browsers, copy the number above or use WhatsApp / In-App Live Chat.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {!auth.currentUser
                      ? lang === 'bn'
                        ? 'নিরাপত্তার স্বার্থে রোগীর স্বজনের সরাসরি নম্বর দেখতে অনুগ্রহ করে ১-ক্লিকে লগইন করুন অথবা "আমি রক্ত দিতে পারি" বাটনে আপনার নম্বর পাঠান।'
                        : 'For privacy protection, sign in with 1 click to view the hospital callback number, or tap "I Can Donate" to send your callback phone.'
                      : lang === 'bn'
                      ? 'এই আবেদনের সরাসরি নম্বরটি গোপন রাখা হয়েছে। নিচের ইন-অ্যাপ লাইভ চ্যাট অথবা "আমি রক্ত দিতে পারি" বাটনের মাধ্যমে সরাসরি যোগাযোগ করুন।'
                      : 'Direct phone is privacy-protected. Use In-App Live Chat or "I Can Donate" below to reach the requester immediately.'}
                  </div>

                  {!auth.currentUser && onOpenAuthModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setContactModalState(null);
                        onOpenAuthModal();
                      }}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      {lang === 'bn'
                        ? '১-ক্লিকে লগইন করে নম্বর দেখুন'
                        : 'Sign In (1-Click) to View Contact'}
                    </button>
                  )}

                  {canInAppChat && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetReq = activeReq;
                        setContactModalState(null);
                        onStartChatWithRequester?.(targetReq);
                      }}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#075e54] hover:bg-[#064e46] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'bn'
                          ? 'ইন-অ্যাপ লাইভ চ্যাটে বার্তা পাঠান'
                          : 'Message via In-App Live Chat'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const targetReq = activeReq;
                      setContactModalState(null);
                      openRespondSheetWithPrefill(targetReq);
                    }}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl btn-crimson font-bold text-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>{t.iCanDonate}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Responder Modal */}
      {respondingToReq && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
          <div className="w-full max-w-md my-2 sm:my-auto rounded-2xl bg-white dark:bg-[#1e293b] p-5 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-colors space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'রক্তদানে সাড়া দিন' : 'Step Forward to Donate'}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {respondingToReq.patientName} · {respondingToReq.bloodGroup} ·{' '}
                    {respondingToReq.hospitalName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRespondingToReq(null);
                  setRespondError(null);
                }}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
              {lang === 'bn'
                ? 'নিরাপত্তা নোট: রক্তদান সম্পূর্ণ মানবিক ও বিনামূল্যে। হাসপাতালে সরাসরি রোগীর স্বজন ও ডাক্তারের স্লিপ যাচাই করে রক্ত দিন।'
                : 'Safety Note: Voluntary blood donation is strictly free. Always verify the hospital requisition slip on arrival.'}
            </div>

            {!auth.currentUser && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                {lang === 'bn'
                  ? 'ফর্মটি সাবমিট করলে ফেইক সাড়া রোধে আপনার Google অ্যাকাউন্ট দিয়ে ১-ক্লিকে ভেরিফাই হয়ে ক্লাউডে সংরক্ষিত হবে।'
                  : 'Submitting will verify via 1-click Google Sign-In so your pledge is securely saved to the patient’s request.'}
              </div>
            )}

            <form onSubmit={handleConfirmResponse} className="space-y-3.5">
              <div>
                <label htmlFor="sos-respond-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'আপনার নাম' : 'Your Full Name'} *
                </label>
                <input
                  id="sos-respond-name"
                  name="responderName"
                  type="text"
                  required
                  placeholder={lang === 'bn' ? 'আপনার পূর্ণ নাম' : 'Full Name'}
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  className="w-full h-11 px-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label htmlFor="sos-respond-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'আপনার ১১ ডিজিটের মোবাইল নম্বর' : 'Your 11-Digit Mobile Number'} *
                </label>
                <input
                  id="sos-respond-phone"
                  name="responderPhone"
                  type="tel"
                  required
                  placeholder="01712345678"
                  value={donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  className="w-full h-11 px-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="sos-respond-group" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'bn' ? 'আপনার রক্তের গ্রুপ' : 'Your Blood Group'}
                </label>
                <select
                  id="sos-respond-group"
                  name="responderBloodGroup"
                  value={donorGroup}
                  onChange={(e) => setDonorGroup(e.target.value as BloodGroup)}
                  className="w-full h-11 px-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  {ALL_BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sos-respond-note" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'bn'
                    ? 'পৌঁছানোর আনুমানিক সময়'
                    : 'Arrival / Availability Note'}
                </label>
                <input
                  id="sos-respond-note"
                  name="arrivalNote"
                  type="text"
                  placeholder={
                    lang === 'bn'
                      ? 'যেমন: ৩০ মিনিটের মধ্যে হাসপাতালে পৌঁছাতে পারব'
                      : 'e.g. Can reach the hospital in 30 minutes'
                  }
                  value={arrivalNote}
                  onChange={(e) => setArrivalNote(e.target.value)}
                  className="w-full h-11 px-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 cursor-pointer">
                <input
                  id="sos-respond-share-live"
                  name="shareLiveLocation"
                  type="checkbox"
                  checked={shareLiveLocation}
                  onChange={(e) => setShareLiveLocation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-emerald-400 text-emerald-600 shrink-0"
                />
                <span className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                  <strong className="font-bold text-emerald-800 dark:text-emerald-300 block">
                    {lang === 'bn'
                      ? 'লাইভ রুট ও হাসপাতালে পৌঁছানোর সময় শেয়ার করুন'
                      : 'Share Live On-the-Way Route & Hospital ETA'}
                  </strong>
                  {lang === 'bn'
                    ? 'শুধু রোগীর পরিবার ম্যাপে দেখতে পাবেন আপনি কত মিনিটে হাসপাতালে পৌঁছাবেন। যেকোনো সময় ১-ট্যাপে বন্ধ করতে পারবেন।'
                    : 'Only the patient family will see your live road ETA on the map. Stop sharing anytime with 1 tap.'}
                </span>
              </label>

              {respondError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
                  {respondError}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingResponse}
                  className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isSubmittingResponse
                      ? lang === 'bn'
                        ? 'নিশ্চিত করা হচ্ছে...'
                        : 'Confirming...'
                      : !auth.currentUser
                      ? lang === 'bn'
                        ? 'Google ভেরিফাই করে সাড়া নিশ্চিত করুন'
                        : 'Verify with Google & Volunteer'
                      : lang === 'bn'
                      ? 'নিশ্চিত করুন ও নাম যোগ করুন'
                      : 'Confirm & Volunteer'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
