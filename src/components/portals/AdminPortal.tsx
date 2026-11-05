import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Donor, BloodRequest, AuditLogEntry, BloodGroup, Language } from '../../types';
import { ALL_BLOOD_GROUPS } from '../../data/compatibility';
import {
  isSeedDonorId,
} from '../../data/mockDonors';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogleReal,
  signInWithGoogleIdToken,
  GOOGLE_OAUTH_CLIENT_ID,
  signInAdminEmailPasswordStrict,
  refreshVerifiedEmailSessionWithPassword,
  sendRealPasswordReset,
  resendVerificationEmailForCurrentUser,
  signOutReal,
  computeAdminProofHashSync,
  grantAdminAccessWithInviteCode,
  parseFirebaseAuthError,
  checkIsVerifiedAdminInFirestore,
  isBootstrappedAdminUser,
  subscribeBloodStock,
  adminUpdateBloodStockInFirestore,
  adminToggleDonorVerifiedInFirestore,
  adminDeleteDonorInFirestore,
  adminMarkRequestFulfilledInFirestore,
  adminDeleteRequestInFirestore,
  subscribeOwnerAdminInviteLocks,
  ownerCreateAdminInviteLock,
  ownerToggleAdminInviteLock,
  ownerDeleteAdminInviteLock,
  subscribeAllRegisteredAdminsForOwner,
  ownerRevokeAdminAccess,
  subscribeActiveAnnouncements,
  adminPublishAnnouncementInFirestore,
  adminDeactivateAnnouncementInFirestore,
  subscribeRemoteAppUpdate,
  adminPublishAppUpdateInFirestore,
  adminDeactivateAppUpdateInFirestore,
  adminSetGlobalRealOnlyModeInFirestore,
  ownerWipeEntireDatabaseZeroSlateV6InFirestore,
  subscribeAdminScamReports,
  adminUpdateScamReportStatusInFirestore,
  adminDeleteScamReportInFirestore,
  OwnerAnnouncementItem,
  RemoteAppUpdateRelease,
  ScamReportItem,
  AdminInviteLockItem,
  RegisteredAdminItem,
  DATABASE_COLLECTION_ARCHITECTURES,
  SmartDatabaseHealthReport,
  adminSmartCleanupCompletedRequestsInFirestore,
  runSmartDatabaseHealthAndSecurityAudit,
  normalizeFacebookProfileUrl,
  User,
} from '../../services/bloodSearchService';
import { verifyAdminWithMainServer } from '../../utils/secureMainDbClient';
import { getSecurityDiagnostics, markRuntimeVerifiedAdminUid } from '../../utils/securityShield';
import { CURRENT_APP_VERSION } from '../../utils/appUpdateManager';
import { getStandaloneAdminFullUrl } from '../../utils/adminRoute';
import {
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  Minus,
  LogOut,
  Search,
  Hospital,
  Eye,
  EyeOff,
  ExternalLink,
  Smartphone,
  ShieldAlert,
  Megaphone,
  Database,
  RefreshCw,
  Copy,
  Check,
  Mail,
  Users,
  Activity,
  Droplets,
  FileText,
  ArrowUpRight,
} from 'lucide-react';

interface AdminPortalProps {
  lang: Language;
  darkMode?: boolean;
  donors: Donor[];
  setDonors: React.Dispatch<React.SetStateAction<Donor[]>>;
  requests: BloodRequest[];
  setRequests: React.Dispatch<React.SetStateAction<BloodRequest[]>>;
  auditLogs: AuditLogEntry[];
  onLogAudit: (action: any, details: string) => void;
  onExitAdmin: () => void;
  onOpenRegisterWithRole?: (role: 'USER' | 'ADMIN') => void;
  onOpenApkGuide?: () => void;
}

type AdminModuleId =
  | 'donors'
  | 'sos'
  | 'inventory'
  | 'megaphone'
  | 'scam'
  | 'database'
  | 'vault'
  | 'audit';

function maskEmailForAdminDisplay(email?: string | null): string {
  const clean = String(email || '').trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 1) return clean ? '***' : 'Authenticated Session';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const head = local.slice(0, Math.min(2, local.length));
  const tail = local.length > 3 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

function maskPhoneForAdminDisplay(phone?: string | null): string {
  const clean = String(phone || '').trim();
  if (!clean) return 'Hidden';
  if (clean.includes('*')) return clean;
  const digits = clean.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const prefix = clean.startsWith('+880') ? '+880' : digits.slice(0, 3);
  const last4 = digits.slice(-4);
  return `${prefix}****${last4}`;
}

type AdminSignInMethodTab = 'GOOGLE' | 'EMAIL' | 'CO_ADMIN';

export const AdminPortal: React.FC<AdminPortalProps> = ({
  lang,
  darkMode = true,
  donors,
  setDonors,
  requests,
  setRequests,
  auditLogs,
  onLogAudit,
  onExitAdmin,
  onOpenApkGuide,
}) => {
  const isEmbeddedIframe =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [isVerifiedCloudAdmin, setIsVerifiedCloudAdmin] = useState<boolean>(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [isPanelLockedBySession, setIsPanelLockedBySession] = useState<boolean>(false);

  // Smart default login tab: inside preview iframes default to popup-free Email/Password; in full tabs default to 1-Click Google
  const [signInTab, setSignInTab] = useState<AdminSignInMethodTab>(() =>
    isEmbeddedIframe ? 'EMAIL' : 'GOOGLE'
  );

  const gsiAdminRef = useRef<HTMLDivElement | null>(null);

  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isEmailSigningIn, setIsEmailSigningIn] = useState(false);
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);
  const [adminEmailNotice, setAdminEmailNotice] = useState<string | null>(null);
  const [pendingEmailVerifyCheck, setPendingEmailVerifyCheck] = useState(false);

  const [adminPinInput, setAdminPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showCoAdminCodeInput, setShowCoAdminCodeInput] = useState(false);
  const [copiedAdminUrl, setCopiedAdminUrl] = useState(false);
  const [isUnlockingCode, setIsUnlockingCode] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [adminToast, setAdminToast] = useState<string | null>(null);

  const [confirmDeleteDonorId, setConfirmDeleteDonorId] = useState<string | null>(null);
  const [confirmDeleteReqId, setConfirmDeleteReqId] = useState<string | null>(null);
  const [confirmRevokeAdminUid, setConfirmRevokeAdminUid] = useState<string | null>(null);

  const [adminTab, setAdminTab] = useState<AdminModuleId>('donors');
  const [searchDonorQuery, setSearchDonorQuery] = useState('');
  const [donorVerifyFilter, setDonorVerifyFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING'>('ALL');
  const [sosStatusFilter, setSosStatusFilter] = useState<'ALL' | 'ACTIVE' | 'FULFILLED'>('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  const [dbHealth, setDbHealth] = useState<SmartDatabaseHealthReport | null>(null);
  const [isScanningDb, setIsScanningDb] = useState(false);
  const [isCleaningFulfilled, setIsCleaningFulfilled] = useState(false);

  // Owner Megaphone & Anti-Scam Moderation States
  const [announcements, setAnnouncements] = useState<OwnerAnnouncementItem[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastUrgency, setBroadcastUrgency] = useState<'CRITICAL' | 'INFO' | 'CAMPAIGN'>(
    'CRITICAL'
  );
  const [isPublishingBroadcast, setIsPublishingBroadcast] = useState(false);
  const [liveAppRelease, setLiveAppRelease] = useState<RemoteAppUpdateRelease | null>(null);
  const [releaseVersionInput, setReleaseVersionInput] = useState(() => {
    const parts = CURRENT_APP_VERSION.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return `${parts[0] || 2}.${(parts[1] || 5) + 1}.0`;
  });
  const [releaseModeInput, setReleaseModeInput] = useState<'OPTIONAL' | 'REQUIRED'>('OPTIONAL');
  const [releaseNotesInput, setReleaseNotesInput] = useState('');
  const [releaseApkUrlInput, setReleaseApkUrlInput] = useState('');
  const [isPublishingAppUpdate, setIsPublishingAppUpdate] = useState(false);
  const [scamReports, setScamReports] = useState<ScamReportItem[]>([]);
  const [donorIdLookupQuery, setDonorIdLookupQuery] = useState('');
  const [confirmPurgeCloudTest, setConfirmPurgeCloudTest] = useState(false);
  const [isPurgingCloudTest, setIsPurgingCloudTest] = useState(false);

  // Owner Security Vault states (exclusively for verified Super Owner)
  const [inviteLocks, setInviteLocks] = useState<AdminInviteLockItem[]>([]);
  const [registeredAdmins, setRegisteredAdmins] = useState<RegisteredAdminItem[]>([]);
  const [newInviteCode, setNewInviteCode] = useState('');
  const [newInviteLabel, setNewInviteLabel] = useState('');
  const [isCreatingLock, setIsCreatingLock] = useState(false);

  const [bloodStock, setBloodStock] = useState<Record<BloodGroup, number>>({
    'A+': 0,
    'A-': 0,
    'B+': 0,
    'B-': 0,
    'AB+': 0,
    'AB-': 0,
    'O+': 0,
    'O-': 0,
  });

  const isSuperOwner = isBootstrappedAdminUser(firebaseUser);
  const secDiag = getSecurityDiagnostics();
  const fullAdminTabUrl = getStandaloneAdminFullUrl();

  // Zero-Trust Cloud Verification: NEVER trust sessionStorage or local flags
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (u) {
        const verifiedAdmin = await checkIsVerifiedAdminInFirestore(u);
        markRuntimeVerifiedAdminUid(verifiedAdmin ? u.uid : null);
        setIsVerifiedCloudAdmin(verifiedAdmin);
        setIsAdminAuthenticated(verifiedAdmin && !isPanelLockedBySession);
      } else {
        markRuntimeVerifiedAdminUid(null);
        setIsVerifiedCloudAdmin(false);
        setIsAdminAuthenticated(false);
      }
      setIsCheckingAuth(false);
    });
    return () => unsub();
  }, [isPanelLockedBySession]);

  // Subscribe to real-time Blood Stock from Cloud Firestore
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeBloodStock((updates) => {
        if (Object.keys(updates).length > 0) {
          setBloodStock((prev) => ({ ...prev, ...(updates as Record<BloodGroup, number>) }));
        }
      });
    } catch {}
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Subscribe to Owner-Exclusive Invite Vault & Admin Roster when signed in as Super Owner
  useEffect(() => {
    if (!firebaseUser || !isBootstrappedAdminUser(firebaseUser)) {
      setInviteLocks([]);
      setRegisteredAdmins([]);
      return;
    }
    let unsubLocks: (() => void) | null = null;
    let unsubAdmins: (() => void) | null = null;
    try {
      unsubLocks = subscribeOwnerAdminInviteLocks(setInviteLocks);
      unsubAdmins = subscribeAllRegisteredAdminsForOwner(setRegisteredAdmins);
    } catch {}
    return () => {
      if (unsubLocks) unsubLocks();
      if (unsubAdmins) unsubAdmins();
    };
  }, [firebaseUser]);

  // Subscribe to Active Announcements & Remote App Update Release
  useEffect(() => {
    let unsubAnn: (() => void) | null = null;
    let unsubAppUpd: (() => void) | null = null;
    try {
      unsubAnn = subscribeActiveAnnouncements(setAnnouncements);
      unsubAppUpd = subscribeRemoteAppUpdate(setLiveAppRelease);
    } catch {}
    return () => {
      if (unsubAnn) unsubAnn();
      if (unsubAppUpd) unsubAppUpd();
    };
  }, []);

  useEffect(() => {
    if (!isAdminAuthenticated) {
      setScamReports([]);
      return;
    }
    let unsubScam: (() => void) | null = null;
    try {
      unsubScam = subscribeAdminScamReports(setScamReports);
    } catch {}
    return () => {
      if (unsubScam) unsubScam();
    };
  }, [isAdminAuthenticated]);

  const showTempToast = (msg: string) => {
    setAdminToast(msg);
    setTimeout(() => setAdminToast(null), 2800);
  };

  const realDonorsCount = donors.filter((d) => !isSeedDonorId(d.id)).length;
  const verifiedDonorsCount = donors.filter((d) => d.verifiedBadge).length;
  const activeSosCount = requests.filter((r) => r.status === 'ACTIVE').length;
  const fulfilledSosCount = requests.filter((r) => r.status === 'FULFILLED').length;
  const totalStockUnits = Object.values(bloodStock).reduce((a: number, b: number) => a + b, 0);
  const lowStockGroupsCount = ALL_BLOOD_GROUPS.filter((g) => (bloodStock[g] || 0) < 10).length;
  const openScamCount = scamReports.filter((r) => r.status === 'OPEN').length;

  const handleCopyStandaloneUrl = () => {
    navigator.clipboard?.writeText(fullAdminTabUrl).catch(() => {});
    setCopiedAdminUrl(true);
    window.setTimeout(() => setCopiedAdminUrl(false), 2200);
  };

  const handleOwnerPurgeCloudTestData = async () => {
    if (!isSuperOwner || isPurgingCloudTest) return;
    setIsPurgingCloudTest(true);
    try {
      const res = await ownerWipeEntireDatabaseZeroSlateV6InFirestore(false);
      await adminSetGlobalRealOnlyModeInFirestore(true);
      setDonors([]);
      setRequests([]);
      setConfirmPurgeCloudTest(false);
      onLogAudit(
        'STATUS_CHANGE',
        `Wiped database to clean zero-slate (${res.deletedCount} records removed)`
      );
      showTempToast(
        lang === 'bn'
          ? `✓ ডাটাবেস সম্পূর্ণ পরিষ্কার করা হয়েছে (${res.deletedCount}টি রেকর্ড মুছে ফেলা হয়েছে)।`
          : `✓ Database reset complete (${res.deletedCount} records cleared).`
      );
    } catch {
      showTempToast(
        lang === 'bn' ? 'ডাটাবেস রিসেট সম্পন্ন করা যায়নি।' : 'Could not reset cloud database.'
      );
    } finally {
      setIsPurgingCloudTest(false);
    }
  };

  const handleRunSmartDbDiagnostic = async () => {
    setIsScanningDb(true);
    try {
      const report = await runSmartDatabaseHealthAndSecurityAudit();
      setDbHealth(report);
      onLogAudit(
        'STATUS_CHANGE',
        `Ran Smart Database Zero-Trust Penetration Audit (${report.latencyMs}ms)`
      );
    } catch {
      showTempToast(
        lang === 'bn' ? 'ডাটাবেস স্ক্যান সম্পন্ন করা যায়নি।' : 'Database diagnostic scan failed.'
      );
    } finally {
      setIsScanningDb(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated && adminTab === 'database' && !dbHealth && !isScanningDb) {
      handleRunSmartDbDiagnostic();
    }
  }, [isAdminAuthenticated, adminTab]);

  const handleSmartCleanCompletedSos = async () => {
    if (isCleaningFulfilled) return;
    setIsCleaningFulfilled(true);
    try {
      const removed = await adminSmartCleanupCompletedRequestsInFirestore();
      setRequests((prev) => prev.filter((r) => r.status === 'ACTIVE'));
      onLogAudit(
        'STATUS_CHANGE',
        `Smart DB Hygiene: cleaned ${removed} completed/cancelled SOS records`
      );
      showTempToast(
        lang === 'bn'
          ? `✓ ডাটাবেস অপ্টিমাইজড! ${removed}টি সম্পন্ন/বাতিল SOS রেকর্ড পরিষ্কার করা হয়েছে`
          : `✓ Database optimized! Cleaned ${removed} completed/cancelled SOS records`
      );
      await handleRunSmartDbDiagnostic();
    } catch {
      showTempToast(
        lang === 'bn'
          ? 'SOS ক্লিনআপ সম্পন্ন করা যায়নি।'
          : 'Failed to clean completed SOS requests.'
      );
    } finally {
      setIsCleaningFulfilled(false);
    }
  };

  // Bulk client-side .CSV / .JSON exports intentionally omitted from UI to prevent 1-click database scraping.
  // Authorized encrypted server-side backups run strictly via backend CLI (`npm run db:backup`).

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim() || isPublishingBroadcast) return;
    setIsPublishingBroadcast(true);
    try {
      await adminPublishAnnouncementInFirestore({
        title:
          broadcastTitle.trim() ||
          (broadcastUrgency === 'CRITICAL'
            ? 'জরুরি রক্তের ডাক'
            : broadcastUrgency === 'CAMPAIGN'
              ? 'রক্তদান ক্যাম্পেইন বিজ্ঞপ্তি'
              : 'অফিশিয়াল ঘোষণা'),
        message: broadcastMsg.trim(),
        urgency: broadcastUrgency,
      });
      setBroadcastTitle('');
      setBroadcastMsg('');
      onLogAudit('STATUS_CHANGE', `Published live megaphone broadcast (${broadcastUrgency})`);
      showTempToast(
        lang === 'bn'
          ? '✓ লাইভ মেগাফোন ঘোষণা পুরো অ্যাপে প্রকাশিত হয়েছে'
          : '✓ Live Megaphone Broadcast published across the app'
      );
    } catch {
      showTempToast(
        lang === 'bn'
          ? 'ঘোষণা প্রকাশ করা যায়নি। অ্যাডমিন অনুমতি চেক করুন।'
          : 'Failed to publish announcement.'
      );
    } finally {
      setIsPublishingBroadcast(false);
    }
  };

  const handlePublishAppUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseVersionInput.trim() || !releaseNotesInput.trim() || isPublishingAppUpdate) return;
    setIsPublishingAppUpdate(true);
    try {
      await adminPublishAppUpdateInFirestore({
        version: releaseVersionInput.trim(),
        mode: releaseModeInput,
        changelog: releaseNotesInput.trim(),
        apkUrl: releaseApkUrlInput.trim() || undefined,
      });
      setReleaseNotesInput('');
      onLogAudit(
        'STATUS_CHANGE',
        `Published App/APK Update v${releaseVersionInput.trim()} (${releaseModeInput})`
      );
      showTempToast(
        lang === 'bn'
          ? `✓ অ্যাপ আপডেট v${releaseVersionInput.trim()} সকল ইউজারের ফোনে পুশ করা হয়েছে`
          : `✓ App Update v${releaseVersionInput.trim()} pushed to all users`
      );
    } catch {
      showTempToast(
        lang === 'bn' ? 'অ্যাপ আপডেট প্রকাশ করা যায়নি।' : 'Failed to publish app update.'
      );
    } finally {
      setIsPublishingAppUpdate(false);
    }
  };

  const verifySignedInAdminCandidate = useCallback(
    async (u: User, methodLabel: string) => {
      setFirebaseUser(u);
      setIsPanelLockedBySession(false);
      const serverCheck = await verifyAdminWithMainServer();
      if (serverCheck.lockedOut) {
        markRuntimeVerifiedAdminUid(null);
        setIsVerifiedCloudAdmin(false);
        setIsAdminAuthenticated(false);
        setPinError(
          lang === 'bn'
            ? 'অতিরিক্ত ভুল অ্যাডমিন প্রবেশের চেষ্টার কারণে এই সেশন ১৫ মিনিটের জন্য ব্লক করা হয়েছে।'
            : 'Too many unauthorized admin sign-in attempts. Locked for 15 minutes.'
        );
        return false;
      }

      const verifiedAdmin =
        serverCheck.isAdmin || (await checkIsVerifiedAdminInFirestore(u));
      markRuntimeVerifiedAdminUid(verifiedAdmin ? u.uid : null);
      setIsVerifiedCloudAdmin(verifiedAdmin);
      if (verifiedAdmin) {
        setIsAdminAuthenticated(true);
        setPinError(null);
        setAdminEmailNotice(null);
        setPendingEmailVerifyCheck(false);
        onLogAudit('STATUS_CHANGE', `Verified Admin signed in (${methodLabel})`);
        return true;
      }

      if (u.email && !u.emailVerified) {
        setPendingEmailVerifyCheck(true);
        setAdminEmailNotice(
          lang === 'bn'
            ? `আপনার ইমেইলটি এখনো ভেরিফাই করা হয়নি। ইনবক্স থেকে ভেরিফিকেশন লিংক ক্লিক করে নিচের বাটনে চাপুন, অথবা Google ট্যাব ব্যবহার করুন।`
            : `Your email address is not verified yet. Verify your inbox link first, then click "I Verified — Enter Console" below, or use Google 1-Click.`
        );
        return false;
      }

      setPinError(
        lang === 'bn'
          ? 'প্রবেশাধিকার প্রত্যাখ্যাত! এই অ্যাকাউন্টটি অনুমোদিত অ্যাডমিন তালিকায় নেই।'
          : 'Access Denied! This account is not authorized for Admin Console access.'
      );
      return false;
    },
    [lang, onLogAudit]
  );

  // Mount Google Identity Services button when Google tab is active on full browser window
  useEffect(() => {
    if (isAdminAuthenticated || signInTab !== 'GOOGLE' || !GOOGLE_OAUTH_CLIENT_ID) return;
    let cancelled = false;

    const mountAdminGsi = () => {
      if (cancelled || !window.google?.accounts?.id || !gsiAdminRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          ux_mode: 'popup',
          cancel_on_tap_outside: false,
          callback: async (resp) => {
            if (!resp?.credential) return;
            setPinError(null);
            setAdminEmailNotice(null);
            try {
              const u = await signInWithGoogleIdToken(resp.credential);
              await verifySignedInAdminCandidate(u, 'Embedded Google GSI');
            } catch (err: any) {
              const parsed = parseFirebaseAuthError(err);
              setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
            }
          },
        });
        gsiAdminRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(gsiAdminRef.current, {
          theme: darkMode ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 340,
        });
      } catch {}
    };

    if (window.google?.accounts?.id) {
      mountAdminGsi();
    } else {
      const existingScript = document.getElementById(
        'google-gsi-client-script'
      ) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', mountAdminGsi);
        return () => {
          cancelled = true;
          existingScript.removeEventListener('load', mountAdminGsi);
        };
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = mountAdminGsi;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [
    isAdminAuthenticated,
    signInTab,
    darkMode,
    firebaseUser,
    isPanelLockedBySession,
    lang,
    verifySignedInAdminCandidate,
  ]);

  const handleAdminGoogleSignIn = () => {
    const popupPromise = signInWithGoogleReal();
    setPinError(null);
    setAdminEmailNotice(null);
    setIsPanelLockedBySession(false);
    popupPromise
      .then(async (u) => {
        await verifySignedInAdminCandidate(u, 'Google Popup');
      })
      .catch((err: any) => {
        const parsed = parseFirebaseAuthError(err);
        setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
      });
  };

  const handleAdminEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setAdminEmailNotice(null);
    setIsPanelLockedBySession(false);

    const cleanEmail = adminEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setPinError(
        lang === 'bn' ? 'সঠিক অ্যাডমিন ইমেইল লিখুন।' : 'Please enter a valid Admin email.'
      );
      return;
    }
    if (adminPasswordInput.length < 6) {
      setPinError(
        lang === 'bn'
          ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে। আগে পাসওয়ার্ড না দিয়ে থাকলে নিচে "Gmail-এ পাসওয়ার্ড সেট লিংক পাঠান" বাটনে ক্লিক করুন।'
          : 'Password must be at least 6 characters (or click "Send Password Setup Link to Gmail" below).'
      );
      return;
    }

    setIsEmailSigningIn(true);
    try {
      const signedInUser = await signInAdminEmailPasswordStrict(
        cleanEmail,
        adminPasswordInput
      );
      await verifySignedInAdminCandidate(signedInUser, 'Admin Email & Password');
    } catch (err: any) {
      const code = String(err?.code || '');
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found'
      ) {
        setPinError(
          lang === 'bn'
            ? 'ইমেইল বা পাসওয়ার্ড মেলেনি (অথবা এই অ্যাকাউন্টে পাসওয়ার্ড সেট করা নেই)। অনুমোদিত অ্যাডমিন হলে নিচে পাসওয়ার্ড রিসেট লিংক ব্যবহার করুন।'
            : 'Invalid admin credentials (or password not configured). Authorized admins can request a setup link below.'
        );
      } else {
        const parsed = parseFirebaseAuthError(err);
        setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
      }
    } finally {
      setIsEmailSigningIn(false);
    }
  };

  const handleSendAdminPasswordSetupEmail = async () => {
    setPinError(null);
    setAdminEmailNotice(null);
    const cleanEmail = adminEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setPinError(
        lang === 'bn'
          ? 'আগে উপরে আপনার অ্যাডমিন ইমেইল লিখুন।'
          : 'Enter your Admin email address above first.'
      );
      return;
    }
    setIsSendingResetLink(true);
    try {
      await sendRealPasswordReset(cleanEmail);
      setAdminEmailNotice(
        lang === 'bn'
          ? `✓ পাসওয়ার্ড সেট করার লিংক ${cleanEmail}-এ পাঠানো হয়েছে! আপনার Gmail ইনবক্স (বা Spam) খুলে নতুন পাসওয়ার্ড দিয়ে এখানে সাইন ইন করুন।`
          : `✓ Password setup link sent to ${cleanEmail}! Check your Gmail inbox, set a 6+ char password, and sign in above.`
      );
    } catch (err: any) {
      const parsed = parseFirebaseAuthError(err);
      setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
    } finally {
      setIsSendingResetLink(false);
    }
  };

  const handleAdminSecretUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setIsPanelLockedBySession(false);

    const syncCheck = computeAdminProofHashSync(adminPinInput);
    if (!syncCheck.wellFormed && !isBootstrappedAdminUser(auth.currentUser)) {
      setPinError(
        lang === 'bn'
          ? 'ভুল কোড! শুধুমাত্র সুপার ওনারের তৈরি করা কমপক্ষে ৬ অক্ষরের সক্রিয় কো-অ্যাডমিন কোড কাজ করবে।'
          : 'Invalid Code! Only an active Owner-issued Co-Admin Invite Code (min 6 chars) is accepted.'
      );
      return;
    }

    let pendingAuth: Promise<User> | null = null;
    if (!auth.currentUser) {
      pendingAuth = signInWithGoogleReal();
    }

    setIsUnlockingCode(true);
    try {
      let activeUser = auth.currentUser;
      if (pendingAuth) {
        activeUser = await pendingAuth;
        setFirebaseUser(activeUser);
      }
      if (!activeUser) {
        setIsUnlockingCode(false);
        return;
      }

      const granted = await grantAdminAccessWithInviteCode(adminPinInput);
      if (granted) {
        markRuntimeVerifiedAdminUid(activeUser.uid);
        setIsVerifiedCloudAdmin(true);
        setIsAdminAuthenticated(true);
        setAdminPinInput('');
        onLogAudit(
          'STATUS_CHANGE',
          `Admin Panel unlocked via verified Cloud Invite Lock (${activeUser.email || activeUser.uid})`
        );
      } else {
        setPinError(
          lang === 'bn'
            ? 'প্রবেশ প্রত্যাখ্যাত! এই কোডটি বৈধ নয় বা সুপার ওনার লক করে রেখেছেন।'
            : 'Access Denied! This code is invalid or locked by the Super Owner.'
        );
      }
    } catch (err: any) {
      const parsed = parseFirebaseAuthError(err);
      setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
    } finally {
      setIsUnlockingCode(false);
    }
  };

  const handleAdminLock = () => {
    setIsPanelLockedBySession(true);
    setIsAdminAuthenticated(false);
    setAdminPinInput('');
    onLogAudit('STATUS_CHANGE', 'Admin Command Suite session paused');
  };

  const handleResumeLockedSession = async () => {
    if (!firebaseUser) return;
    setIsCheckingAuth(true);
    const ok = await checkIsVerifiedAdminInFirestore(firebaseUser);
    markRuntimeVerifiedAdminUid(ok ? firebaseUser.uid : null);
    setIsCheckingAuth(false);
    if (ok) {
      setIsPanelLockedBySession(false);
      setIsAdminAuthenticated(true);
      onLogAudit('STATUS_CHANGE', 'Admin Command Suite session resumed');
    }
  };

  const handleCreateInviteLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperOwner) return;
    setIsCreatingLock(true);
    try {
      await ownerCreateAdminInviteLock(
        newInviteCode,
        newInviteLabel.trim() || 'জেলা কো-অর্ডিনেটর ইনভাইট'
      );
      setNewInviteCode('');
      setNewInviteLabel('');
      showTempToast(
        lang === 'bn'
          ? '✓ নতুন গোপন কো-অ্যাডমিন ইনভাইট কোড ক্লাউড ভল্টে সংরক্ষিত হয়েছে'
          : '✓ New Co-Admin Invite Code saved to Cloud Vault'
      );
    } catch (err: any) {
      showTempToast(err?.message || 'কোড তৈরিতে সমস্যা হয়েছে');
    } finally {
      setIsCreatingLock(false);
    }
  };

  const handleRevokeAdmin = async (targetUid: string, targetName: string) => {
    if (!isSuperOwner) return;
    try {
      await ownerRevokeAdminAccess(targetUid);
      setConfirmRevokeAdminUid(null);
      onLogAudit(
        'STATUS_CHANGE',
        `Super Owner revoked admin access for ${targetName} (${targetUid})`
      );
      showTempToast(
        lang === 'bn'
          ? `✓ ${targetName}-এর অ্যাডমিন ক্ষমতা তাৎক্ষণিকভাবে বাতিল করা হয়েছে`
          : `✓ Revoked admin access for ${targetName}`
      );
    } catch {
      showTempToast(lang === 'bn' ? 'বাতিল করতে সমস্যা হয়েছে' : 'Failed to revoke admin');
    }
  };

  const handleToggleVerify = async (donorId: string) => {
    setDonors((prev) =>
      prev.map((d) => {
        if (d.id === donorId) {
          const updated = !d.verifiedBadge;
          onLogAudit(
            'STATUS_CHANGE',
            `Admin ${updated ? 'verified' : 'unverified'} donor: ${d.name} (${d.bloodGroup})`
          );
          return { ...d, verifiedBadge: updated };
        }
        return d;
      })
    );
    try {
      await adminToggleDonorVerifiedInFirestore(donorId);
    } catch {}
    showTempToast(lang === 'bn' ? '✓ ডোনার স্ট্যাটাস আপডেট হয়েছে' : '✓ Donor status updated');
  };

  const handleConfirmDeleteDonor = async (donorId: string, donorName: string) => {
    setDonors((prev) => prev.filter((d) => d.id !== donorId));
    setConfirmDeleteDonorId(null);
    onLogAudit('STATUS_CHANGE', `Admin removed donor: ${donorName} (ID: ${donorId})`);
    try {
      await adminDeleteDonorInFirestore(donorId);
    } catch {}
    showTempToast(
      lang === 'bn' ? `✓ ${donorName}-কে তালিকা থেকে মুছে ফেলা হয়েছে` : `✓ Removed ${donorName}`
    );
  };

  const handleConfirmDeleteRequest = async (reqId: string, patientName: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== reqId));
    setConfirmDeleteReqId(null);
    onLogAudit('STATUS_CHANGE', `Admin deleted blood request for ${patientName}`);
    try {
      await adminDeleteRequestInFirestore(reqId);
    } catch {}
    showTempToast(lang === 'bn' ? '✓ রক্তের আবেদন মুছে ফেলা হয়েছে' : '✓ Request deleted');
  };

  const handleMarkFulfilled = async (reqId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === reqId ? { ...r, status: 'FULFILLED', unitsCollected: r.unitsNeeded } : r
      )
    );
    onLogAudit('STATUS_CHANGE', `Admin marked request ${reqId} as FULFILLED`);
    try {
      await adminMarkRequestFulfilledInFirestore(reqId);
    } catch {}
    showTempToast(
      lang === 'bn' ? '✓ আবেদনটি সম্পন্ন চিহ্নিত হয়েছে' : '✓ Marked as Fulfilled'
    );
  };

  const handleStockChange = async (grp: BloodGroup, delta: number) => {
    const nextVal = Math.max(0, (bloodStock[grp] || 0) + delta);
    setBloodStock((prev) => ({
      ...prev,
      [grp]: nextVal,
    }));
    onLogAudit(
      'STOCK_UPDATE',
      `Admin modified ${grp} stock by ${delta > 0 ? `+${delta}` : delta} units (Now: ${nextVal})`
    );
    try {
      await adminUpdateBloodStockInFirestore(grp, nextVal);
    } catch {}
  };

  const filteredDonors = donors.filter((d) => {
    if (donorVerifyFilter === 'VERIFIED' && !d.verifiedBadge) return false;
    if (donorVerifyFilter === 'PENDING' && d.verifiedBadge) return false;
    if (!searchDonorQuery.trim()) return true;
    const q = searchDonorQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.phone.includes(q) ||
      d.bloodGroup.toLowerCase().includes(q) ||
      d.district.toLowerCase().includes(q)
    );
  });

  const filteredRequests = requests.filter((r) => {
    if (sosStatusFilter === 'ACTIVE') return r.status === 'ACTIVE';
    if (sosStatusFilter === 'FULFILLED') return r.status === 'FULFILLED';
    return true;
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!auditSearchQuery.trim()) return true;
    const q = auditSearchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.targetDetails.toLowerCase().includes(q) ||
      log.timestamp.toLowerCase().includes(q)
    );
  });

  // =========================================================================
  // 1. STANDALONE SOVEREIGN GATEWAY (/admin) — UNIQUE EXECUTIVE SIGN-IN
  // =========================================================================
  if (!isAdminAuthenticated) {
    const isLockedVerifiedSession =
      Boolean(firebaseUser) && isVerifiedCloudAdmin && isPanelLockedBySession;
    const isRegularNonAdminUser =
      Boolean(firebaseUser) && !isCheckingAuth && !isVerifiedCloudAdmin;

    // Case A: Verified Admin paused/locked the session -> Quick 1-Click Resume Screen
    if (isLockedVerifiedSession) {
      return (
        <div className="py-10 sm:py-16 max-w-md mx-auto text-left">
          <div className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight pt-1">
                {lang === 'bn' ? 'অ্যাডমিন সেশন লক করা আছে' : 'Command Session Locked'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                {maskEmailForAdminDisplay(firebaseUser?.email)} · {isSuperOwner ? 'Super Owner' : 'Verified Co-Admin'}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleResumeLockedSession}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Unlock className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'bn' ? 'আনলক করে প্যানেলে ফিরে যান' : 'Unlock & Resume Console'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPanelLockedBySession(false);
                  signOutReal().catch(() => {});
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{lang === 'bn' ? 'সম্পূর্ণ সাইন আউট করুন' : 'Sign Out Completely'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Case B: Signed into User App with a non-admin account -> Clear Account Switcher + Optional Co-Admin Invite Key
    if (isRegularNonAdminUser) {
      return (
        <div className="py-10 sm:py-16 max-w-lg mx-auto text-left">
          <div className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl space-y-5">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight pt-1">
                {lang === 'bn'
                  ? 'অন্য অ্যাকাউন্ট দিয়ে সাইন ইন করা আছে'
                  : 'Signed In With Non-Admin Account'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {lang === 'bn'
                  ? `বর্তমান অ্যাকাউন্ট (${firebaseUser?.email || firebaseUser?.phoneNumber}) অ্যাডমিন কনসোলের জন্য অনুমোদিত নয়। অনুমোদিত অ্যাডমিন অ্যাকাউন্টে সুইচ করতে নিচের বাটনে চাপুন।`
                  : `Current session (${firebaseUser?.email || firebaseUser?.phoneNumber}) is not authorized for Admin Console access. Switch to an authorized Admin account below.`}
              </p>
            </div>

            {pinError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{pinError}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await signOutReal();
                  } catch {}
                }}
                className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'bn'
                    ? 'অনুমোদিত অ্যাডমিন অ্যাকাউন্টে সুইচ করুন'
                    : 'Switch to Authorized Admin Account'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowCoAdminCodeInput((prev) => !prev)}
                className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                {lang === 'bn'
                  ? 'সুপার ওনারের দেওয়া কো-অ্যাডমিন ইনভাইট কোড আছে?'
                  : 'Hold an Owner-Issued Co-Admin Invite Code?'}
              </button>

              {showCoAdminCodeInput && (
                <form onSubmit={handleAdminSecretUnlock} className="space-y-2.5 pt-1">
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-coadmin-switch-code"
                      name="coAdminInviteCode"
                      type={showPin ? 'text' : 'password'}
                      required
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'ওনারের দেওয়া কো-অ্যাডমিন কোড লিখুন...'
                          : 'Enter Owner-issued Co-Admin Code...'
                      }
                      className="w-full h-11 pl-10 pr-10 text-xs rounded-xl bg-slate-50 dark:bg-[#080d19] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isUnlockingCode}
                    className="w-full min-h-[44px] py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-600 dark:hover:bg-amber-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {isUnlockingCode
                        ? lang === 'bn'
                          ? 'যাচাই হচ্ছে...'
                          : 'Verifying...'
                        : lang === 'bn'
                          ? 'কোড ভেরিফাই করে প্রবেশ করুন'
                          : 'Verify Invite Code & Enter'}
                    </span>
                  </button>
                </form>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onExitAdmin}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-medium cursor-pointer"
                >
                  ← {lang === 'bn' ? 'পাবলিক ইউজার অ্যাপে ফিরে যান' : 'Return to Public User App'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Case C: Main Asymmetric 2-Column Sovereign Gateway (Signed Out)
    return (
      <div className="py-4 sm:py-10 max-w-5xl mx-auto text-left">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0c1322] shadow-xl transition-colors">
          {/* Left Architectural Identity & Governance Column (Full Light & Dark Theme Support) */}
          <div className="lg:col-span-5 bg-slate-50 dark:bg-[#0a101d] text-slate-900 dark:text-slate-100 p-6 sm:p-9 flex flex-col justify-between gap-8 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/90 transition-colors">
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div className="space-y-3">
                <div className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400">
                  BloodSearch Bangladesh · /admin
                </div>
                <h1
                  className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight"
                  style={{ textWrap: 'balance' }}
                >
                  {lang === 'bn'
                    ? 'অ্যাডমিন কন্ট্রোল ও মডারেশন প্যানেল'
                    : 'Admin Control & Moderation Console'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {lang === 'bn'
                    ? 'পাবলিক ইউজার অ্যাপ থেকে সম্পূর্ণ আলাদা ও সুরক্ষিত অ্যাডমিন কন্ট্রোল রুম। আপনার সুপার ওনার অ্যাকাউন্টের জন্য কোনো Vault Code প্রয়োজন নেই।'
                    : 'Completely isolated from the public donor app. As the verified Super Owner, you never need any Vault Code—sign in via Email or Google.'}
                </p>
              </div>

              {/* Clean Editorial Capability Index */}
              <div className="pt-2 space-y-3.5 border-t border-slate-200 dark:border-slate-800/90 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {lang === 'bn'
                      ? '01. ডোনার ও জরুরি SOS মডারেশন'
                      : '01. Live Donor & SOS Governance'}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'ভেরিফাইড ব্যাজ অনুমোদন, প্রোফাইল নিয়ন্ত্রণ ও ব্লাড স্টক আপডেট'
                      : 'Approve verified badges, moderate requests, and manage reserve stock'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {lang === 'bn'
                      ? '02. লাইভ মেগাফোন ও OTA অ্যাপ আপডেট'
                      : '02. OTA Releases & Live Broadcast'}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    {lang === 'bn'
                      ? '১-ক্লিকে সকল ইউজারের ফোনে জরুরি ঘোষণা ও APK আপডেট পুশ'
                      : 'Push nationwide emergency banners and APK releases instantaneously'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {lang === 'bn'
                      ? '03. জিরো-ট্রাস্ট ডাটাবেস ও মালিকানা ভল্ট'
                      : '03. Cloud Firewall & Ownership Lock'}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 font-mono text-[11px] truncate">
                    Zero-Trust PostgreSQL + Server Token Gate
                  </div>
                </div>
              </div>
            </div>

            {/* Bookmarkable Standalone URL Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-slate-600 dark:text-slate-400 truncate">
                {fullAdminTabUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyStandaloneUrl}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300 font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                {copiedAdminUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedAdminUrl ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Right Interactive Guided Sign-In Column */}
          <div className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-center space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {lang === 'bn' ? 'অ্যাডমিন অ্যাকাউন্টে প্রবেশ করুন' : 'Sign In to Admin Suite'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'আপনার সুবিধামতো পাসওয়ার্ড অথবা ১-ক্লিক Google পদ্ধতি বেছে নিন'
                  : 'Choose your preferred authentication method below'}
              </p>
            </div>

            {/* Clean Segmented Login Method Switcher */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSignInTab('EMAIL');
                  setPinError(null);
                }}
                className={`min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  signInTab === 'EMAIL'
                    ? 'bg-white dark:bg-[#162033] text-slate-900 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bn' ? 'ইমেইল ও পাসওয়ার্ড' : 'Email & Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignInTab('GOOGLE');
                  setPinError(null);
                }}
                className={`min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  signInTab === 'GOOGLE'
                    ? 'bg-white dark:bg-[#162033] text-slate-900 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bn' ? 'Google ১-ক্লিক' : 'Google 1-Click'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSignInTab('CO_ADMIN');
                  setPinError(null);
                }}
                className={`min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  signInTab === 'CO_ADMIN'
                    ? 'bg-white dark:bg-[#162033] text-slate-900 dark:text-amber-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'bn' ? 'কো-অ্যাডমিন কোড' : 'Co-Admin Key'}
              </button>
            </div>

            {isCheckingAuth && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'ক্লাউড সিকিউরিটি সেশন যাচাই হচ্ছে...'
                  : 'Checking active cloud session...'}
              </div>
            )}

            {/* METHOD 1: POPUP-FREE EMAIL & PASSWORD (WORKS EVERYWHERE INCLUDING PREVIEW IFRAME!) */}
            {signInTab === 'EMAIL' && (
              <form onSubmit={handleAdminEmailPasswordSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'bn' ? 'অনুমোদিত অ্যাডমিন ইমেইল' : 'Authorized Admin Email'}
                    </label>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-login-email"
                      name="adminEmail"
                      type="email"
                      required
                      autoComplete="off"
                      value={adminEmailInput}
                      onChange={(e) => setAdminEmailInput(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'আপনার অনুমোদিত অ্যাডমিন ইমেইল লিখুন...'
                          : 'Enter authorized admin email...'
                      }
                      className="w-full h-11 pl-10 pr-3.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700/90 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'অ্যাডমিন পাসওয়ার্ড' : 'Admin Password'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-login-password"
                      name="adminPassword"
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'আপনার পাসওয়ার্ড লিখুন (কমপক্ষে ৬ অক্ষর)...'
                          : 'Enter your password (min 6 characters)...'
                      }
                      className="w-full h-11 pl-10 pr-10 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700/90 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((p) => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      {showAdminPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isEmailSigningIn}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isEmailSigningIn
                      ? lang === 'bn'
                        ? 'যাচাই হচ্ছে...'
                        : 'Authenticating...'
                      : lang === 'bn'
                        ? 'অ্যাডমিন প্যানেলে প্রবেশ করুন'
                        : 'Enter Admin Command Suite'}
                  </span>
                </button>

                {/* Clean 1-Click First-Time Password Setup Helper */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'আগে পাসওয়ার্ড সেট করেননি বা ভুলে গেছেন?'
                      : 'First time using password or forgot it?'}
                  </span>
                  <button
                    type="button"
                    disabled={isSendingResetLink}
                    onClick={handleSendAdminPasswordSetupEmail}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isSendingResetLink
                        ? lang === 'bn'
                          ? 'পাঠানো হচ্ছে...'
                          : 'Sending...'
                        : lang === 'bn'
                          ? 'Gmail-এ পাসওয়ার্ড সেট লিংক নিন'
                          : 'Send Setup Link to Gmail'}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* METHOD 2: 1-CLICK GOOGLE SIGN-IN (SMART IFRAME DETECTION) */}
            {signInTab === 'GOOGLE' && (
              <div className="space-y-4">
                {isEmbeddedIframe ? (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 space-y-3.5">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {lang === 'bn'
                          ? '১-ক্লিকে Google লগইন (পাসওয়ার্ড ছাড়াই সরাসরি প্রবেশ)'
                          : '1-Click Google Login (Zero Password Needed)'}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {lang === 'bn'
                          ? 'প্রিভিউ বক্সের ভেতরে ব্রাউজার সিকিউরিটির কারণে পপ-আপ ব্লক থাকে। নিচের বাটনে চাপলে নতুন ট্যাবে /admin খুলবে—সেখানে আপনার অনুমোদিত অ্যাডমিন Google অ্যাকাউন্ট দিয়ে সরাসরি প্রবেশ করতে পারবেন।'
                          : 'Preview frames block Google OAuth popups. Open /admin in a full browser tab below and sign in with your authorized Admin Google account.'}
                      </p>
                    </div>

                    <a
                      href={fullAdminTabUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'bn'
                          ? 'নতুন ব্রাউজার ট্যাবে /admin খুলে Google লগইন করুন'
                          : 'Open /admin in Full Browser Tab for Google Login'}
                      </span>
                    </a>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {lang === 'bn'
                        ? 'নিচের বাটনে ক্লিক করে আপনার অনুমোদিত অ্যাডমিন Google অ্যাকাউন্ট সিলেক্ট করুন—সার্ভার ভেরিফিকেশনের মাধ্যমে সরাসরি প্রবেশ করবেন।'
                        : 'Select your authorized Admin Google account below for server-verified passwordless access.'}
                    </p>

                    <button
                      type="button"
                      onClick={handleAdminGoogleSignIn}
                      className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 cursor-pointer transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>
                        {lang === 'bn'
                          ? 'অনুমোদিত Google অ্যাকাউন্ট দিয়ে প্রবেশ করুন'
                          : 'Continue with Authorized Admin Google'}
                      </span>
                    </button>

                    <div
                      ref={gsiAdminRef}
                      className="w-full flex items-center justify-center min-h-[44px]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* METHOD 3: INVITED CO-ADMIN VAULT CODE (CLEARLY MARKED OPTIONAL / NON-OWNER) */}
            {signInTab === 'CO_ADMIN' && (
              <form onSubmit={handleAdminSecretUnlock} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {lang === 'bn'
                    ? 'নোট: মূল সুপার ওনারের কোনো কোড লাগবে না—"ইমেইল ও পাসওয়ার্ড" বা "Google ১-ক্লিক" ট্যাব থেকে সরাসরি লগইন করুন। এই ঘরটি শুধুমাত্র আমন্ত্রিত কো-অ্যাডমিনদের জন্য।'
                    : 'Note: The Super Owner never needs a code—use "Email & Password" or "Google 1-Click". This tab is exclusively for invited Co-Admins holding an Owner-issued key.'}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-coadmin-key" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'bn' ? 'কো-অ্যাডমিন ইনভাইট কোড' : 'Co-Admin Invite Key'}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-coadmin-key"
                      name="coAdminKey"
                      type={showPin ? 'text' : 'password'}
                      required
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'সুপার ওনারের দেওয়া ৬+ অক্ষরের কোড...'
                          : 'Enter 6+ char Owner-issued Invite Key...'
                      }
                      className="w-full h-11 pl-10 pr-10 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUnlockingCode}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isUnlockingCode
                      ? lang === 'bn'
                        ? 'ক্লাউডে যাচাই হচ্ছে...'
                        : 'Verifying Key...'
                      : lang === 'bn'
                        ? 'কোড ভেরিফাই করে কো-অ্যাডমিন প্রবেশ করুন'
                        : 'Verify Key & Enter as Co-Admin'}
                  </span>
                </button>
              </form>
            )}

            {/* Status / Verification / Error Feedback */}
            {adminEmailNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-2.5">
                <div>{adminEmailNotice}</div>
                {pendingEmailVerifyCheck && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const refreshed = await refreshVerifiedEmailSessionWithPassword(
                            adminEmailInput,
                            adminPasswordInput
                          );
                          await verifySignedInAdminCandidate(refreshed, 'Verified Admin Email');
                        } catch (err: any) {
                          const parsed = parseFirebaseAuthError(err);
                          setPinError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                    >
                      {lang === 'bn'
                        ? '✓ ভেরিফাই সম্পন্ন — প্রবেশ করুন'
                        : '✓ I Verified — Enter Console'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resendVerificationEmailForCurrentUser().catch(() => {});
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs cursor-pointer"
                    >
                      {lang === 'bn' ? 'আবার লিংক পাঠান' : 'Resend Link'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {pinError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <span>{pinError}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onExitAdmin}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white font-semibold cursor-pointer"
              >
                ← {lang === 'bn' ? 'পাবলিক ডোনার অ্যাপে যান' : 'Back to Public Donor App'}
              </button>
              <span className="font-mono text-[11px] text-slate-400">Zero-Trust Auth</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. UNLOCKED EXECUTIVE COMMAND SUITE — SIDEBAR + OPERATIONS WORKSPACE
  // =========================================================================
  const navGroups: {
    groupLabel: string;
    items: {
      id: AdminModuleId;
      label: string;
      count?: number;
      icon: React.FC<{ className?: string }>;
    }[];
  }[] = [
    {
      groupLabel: lang === 'bn' ? '01. অপারেশনস' : '01. Operations',
      items: [
        {
          id: 'donors',
          label: lang === 'bn' ? 'রক্তদাতা ডিরেক্টরি' : 'Donor Registry',
          count: donors.length,
          icon: Users,
        },
        {
          id: 'sos',
          label: lang === 'bn' ? 'জরুরি SOS মডারেশন' : 'Emergency SOS',
          count: activeSosCount,
          icon: Activity,
        },
        {
          id: 'inventory',
          label: lang === 'bn' ? 'ব্লাড ব্যাংক স্টক' : 'Blood Reserve',
          count: totalStockUnits,
          icon: Droplets,
        },
      ],
    },
    {
      groupLabel: lang === 'bn' ? '02. ব্রডকাস্ট ও সুরক্ষা' : '02. Broadcast & Trust',
      items: [
        {
          id: 'megaphone',
          label: lang === 'bn' ? 'OTA আপডেট ও মেগাফোন' : 'OTA & Broadcast',
          count: announcements.length,
          icon: Megaphone,
        },
        {
          id: 'scam',
          label: lang === 'bn' ? 'স্ক্যাম ও আইডি যাচাই' : 'Scam & ID Check',
          count: openScamCount,
          icon: ShieldAlert,
        },
      ],
    },
    {
      groupLabel: lang === 'bn' ? '03. অবকাঠামো ও ভল্ট' : '03. Sovereign Vault',
      items: [
        {
          id: 'database',
          label: lang === 'bn' ? 'ক্লাউড ডাটাবেস ও শিল্ড' : 'Cloud DB & Shield',
          count: DATABASE_COLLECTION_ARCHITECTURES.length,
          icon: Database,
        },
        {
          id: 'vault',
          label: lang === 'bn' ? 'ওনার সিকিউরিটি ভল্ট' : 'Ownership Vault',
          count: registeredAdmins.length,
          icon: KeyRound,
        },
        {
          id: 'audit',
          label: lang === 'bn' ? 'অ্যাক্টিভিটি অডিট লগ' : 'Audit Ledger',
          count: auditLogs.length,
          icon: FileText,
        },
      ],
    },
  ];

  return (
    <div className="text-left pb-12">
      {adminToast && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 text-xs font-bold flex items-center justify-between gap-3">
          <span>{adminToast}</span>
          <button
            type="button"
            onClick={() => setAdminToast(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-80 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)] gap-6 items-start">
        {/* LEFT EXECUTIVE COMMAND RAIL */}
        <aside className="lg:sticky lg:top-24 rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-4 space-y-5">
          {/* Owner Identity Block */}
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800/90 space-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center shrink-0">
                {isSuperOwner ? 'SO' : 'CA'}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {isSuperOwner
                    ? lang === 'bn'
                      ? 'সুপার ওনার'
                      : 'Super Owner'
                    : lang === 'bn'
                      ? 'কো-অ্যাডমিন'
                      : 'Verified Co-Admin'}
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {firebaseUser?.email
                    ? maskEmailForAdminDisplay(firebaseUser.email)
                    : firebaseUser?.uid
                      ? `UID:${firebaseUser.uid.slice(0, 8)}...`
                      : ''}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleAdminLock}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{lang === 'bn' ? 'লক করুন' : 'Lock'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  signOutReal().catch(() => {});
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'bn' ? 'লগআউট' : 'Sign Out'}</span>
              </button>
            </div>
          </div>

          {/* Mobile Horizontal Quick Module Selector */}
          <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1">
            {navGroups
              .flatMap((g) => g.items)
              .map((item) => {
                const Icon = item.icon;
                const active = adminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAdminTab(item.id)}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                    {typeof item.count === 'number' && (
                      <span className="font-mono tabular-nums opacity-80">({item.count})</span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Desktop Grouped Command Rail */}
          <nav className="hidden lg:block space-y-5">
            {navGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  {group.groupLabel}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = adminTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAdminTab(item.id)}
                      className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        active
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {typeof item.count === 'number' && (
                        <span
                          className={`text-[11px] font-mono tabular-nums ${
                            active ? 'text-slate-950 font-bold' : 'text-slate-400'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Deploy Guide Footer (Bulk CSV/JSON export intentionally disabled to prevent raw DB exfiltration) */}
          {onOpenApkGuide && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/90">
              <button
                type="button"
                onClick={onOpenApkGuide}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'bn' ? 'APK ও ডিপ্লয় গাইড' : 'APK & Deploy Guide'}</span>
              </button>
            </div>
          )}
        </aside>

        {/* RIGHT MAIN OPERATIONS CANVAS */}
        <div className="space-y-6 min-w-0">
          {/* Executive Telemetry Ledger Strip (Unboxed Hairline Dividers + Tabular Numerals) */}
          <div className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800/90">
            <div className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'নিবন্ধিত রক্তদাতা' : 'Registered Donors'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {donors.length}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {verifiedDonorsCount} {lang === 'bn' ? 'ভেরিফাইড' : 'verified'} · {realDonorsCount}{' '}
                {lang === 'bn' ? 'রিয়েল' : 'real'}
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'সক্রিয় SOS আবেদন' : 'Active SOS Queue'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {activeSosCount}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {fulfilledSosCount} {lang === 'bn' ? 'সম্পন্ন আবেদন' : 'fulfilled'}
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'রিজার্ভ রক্ত ইউনিট' : 'Reserve Blood Units'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {totalStockUnits}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {lowStockGroupsCount}{' '}
                {lang === 'bn' ? 'টি গ্রুপে স্টক কম' : 'groups below 10 bags'}
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn' ? 'অ্যাডমিন ও স্ক্যাম রিপোর্ট' : 'Admins & Scam Queue'}
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {Math.max(1, registeredAdmins.length)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                {openScamCount} {lang === 'bn' ? 'স্ক্যাম রিপোর্ট' : 'open scam reports'}
              </div>
            </div>
          </div>

          {/* MODULE 1: DONOR REGISTRY & VERIFICATION */}
          {adminTab === 'donors' && (
            <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/90">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'রক্তদাতা অনুমোদন ও ডিরেক্টরি নিয়ন্ত্রণ'
                      : 'Donor Verification & Directory Governance'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? `মোট ${realDonorsCount} জন নিবন্ধিত রক্তদাতা · ভেরিফাইড ব্যাজ প্রদান বা প্রোফাইল রিমুভ করুন`
                      : `${realDonorsCount} registered donors · Approve verified badges or remove invalid entries`}
                  </p>
                </div>

                {isSuperOwner && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {confirmPurgeCloudTest ? (
                      <>
                        <button
                          type="button"
                          disabled={isPurgingCloudTest}
                          onClick={handleOwnerPurgeCloudTestData}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                        >
                          {isPurgingCloudTest
                            ? lang === 'bn'
                              ? 'রিসেট হচ্ছে...'
                              : 'Resetting...'
                            : lang === 'bn'
                              ? 'নিশ্চিত? সব ডাটা মুছুন'
                              : 'Confirm Full Wipe'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPurgeCloudTest(false)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                        >
                          {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmPurgeCloudTest(true)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer transition-colors"
                      >
                        {lang === 'bn' ? 'ডাটাবেস জিরো-রিসেট' : 'Zero-Slate Reset'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Search & Segmented Status Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 self-start">
                  {(
                    [
                      { id: 'ALL', label: lang === 'bn' ? 'সব ডোনার' : 'All Donors' },
                      { id: 'VERIFIED', label: lang === 'bn' ? 'ভেরিফাইড' : 'Verified' },
                      { id: 'PENDING', label: lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setDonorVerifyFilter(f.id)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        donorVerifyFilter === f.id
                          ? 'bg-white dark:bg-[#162033] text-slate-900 dark:text-amber-300 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="w-full sm:w-72 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-search-donor"
                    name="searchDonorQuery"
                    type="text"
                    value={searchDonorQuery}
                    onChange={(e) => setSearchDonorQuery(e.target.value)}
                    placeholder={
                      lang === 'bn'
                        ? 'নাম, ব্লাড গ্রুপ, জেলা বা ফোন...'
                        : 'Search name, blood group, district...'
                    }
                    className="w-full h-10 pl-9 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {filteredDonors.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'এই ফিল্টারে কোনো রক্তদাতা পাওয়া যায়নি।'
                    : 'No donor records match the current filter.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 max-h-[540px] overflow-y-auto">
                  {filteredDonors.map((donor) => (
                    <div
                      key={donor.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-rose-600 text-white font-black text-xs font-mono flex items-center justify-center shrink-0">
                          {donor.bloodGroup}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {donor.name}
                            </span>
                            <span className="text-xs text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                donor.verifiedBadge
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {donor.verifiedBadge
                                ? lang === 'bn'
                                  ? 'ভেরিফাইড'
                                  : 'Verified'
                                : lang === 'bn'
                                  ? 'অপেক্ষমাণ'
                                  : 'Pending'}
                            </span>
                            {normalizeFacebookProfileUrl(donor.facebookUrl) && (
                              <>
                                <span className="text-xs text-slate-400" aria-hidden="true">
                                  ·
                                </span>
                                <a
                                  href={normalizeFacebookProfileUrl(donor.facebookUrl)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-0.5"
                                >
                                  <span>Facebook</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </a>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                            {maskPhoneForAdminDisplay(donor.phone)} ·{' '}
                            <span className="font-sans capitalize">
                              {donor.upazila}, {donor.district}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleToggleVerify(donor.id)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 transition-colors ${
                            donor.verifiedBadge
                              ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {donor.verifiedBadge
                              ? lang === 'bn'
                                ? 'ব্যাজ তুলে নিন'
                                : 'Revoke Badge'
                              : lang === 'bn'
                                ? 'ভেরিফাই করুন'
                                : 'Approve Badge'}
                          </span>
                        </button>

                        {confirmDeleteDonorId === donor.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteDonor(donor.id, donor.name)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                            >
                              {lang === 'bn' ? 'নিশ্চিত মুছুন' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDonorId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDonorId(donor.id)}
                            className="min-h-[38px] min-w-[38px] rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer transition-colors"
                            title={lang === 'bn' ? 'ডোনার মুছুন' : 'Delete Donor'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* MODULE 2: SOS REQUESTS MODERATION */}
          {adminTab === 'sos' && (
            <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/90">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'জরুরি রক্তের আবেদন (SOS) মডারেশন' : 'Emergency SOS Moderation'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'রক্তের ব্যবস্থা হয়ে গেলে সম্পন্ন চিহ্নিত করুন অথবা ভুয়া পোস্ট মুছে ফেলুন'
                      : 'Mark fulfilled emergencies or remove invalid blood requests'}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 self-start">
                  {(
                    [
                      { id: 'ALL', label: lang === 'bn' ? 'সব' : 'All' },
                      { id: 'ACTIVE', label: lang === 'bn' ? 'সক্রিয়' : 'Active' },
                      { id: 'FULFILLED', label: lang === 'bn' ? 'সম্পন্ন' : 'Fulfilled' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSosStatusFilter(f.id)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        sosStatusFilter === f.id
                          ? 'bg-white dark:bg-[#162033] text-slate-900 dark:text-amber-300 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'কোনো SOS আবেদন পাওয়া যায়নি।' : 'No SOS requests in this view.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 max-h-[540px] overflow-y-auto">
                  {filteredRequests.map((req) => (
                    <div
                      key={req.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-rose-600 text-white font-black text-xs font-mono flex items-center justify-center shrink-0">
                          {req.bloodGroup}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {req.patientName}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {req.unitsNeeded} {lang === 'bn' ? 'ব্যাগ' : 'bag(s)'}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                req.status === 'FULFILLED'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Hospital className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {req.hospitalName} · <span className="capitalize">{req.district}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        {req.status !== 'FULFILLED' && (
                          <button
                            type="button"
                            onClick={() => handleMarkFulfilled(req.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors"
                          >
                            {lang === 'bn' ? 'সম্পন্ন চিহ্নিত করুন' : 'Mark Fulfilled'}
                          </button>
                        )}

                        {confirmDeleteReqId === req.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteRequest(req.id, req.patientName)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              {lang === 'bn' ? 'নিশ্চিত মুছুন' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteReqId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteReqId(req.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 text-rose-600 dark:text-rose-400 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{lang === 'bn' ? 'মুছুন' : 'Delete'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* MODULE 3: BLOOD BANK RESERVE INVENTORY */}
          {adminTab === 'inventory' && (
            <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-5">
              <div className="pb-4 border-b border-slate-200 dark:border-slate-800/90 space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'লাইভ ব্লাড ব্যাংক রিজার্ভ ইনভেন্টরি'
                    : 'Live Blood Reserve Inventory'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'প্রতিটি গ্রুপের বর্তমান ইউনিট সংখ্যা আপডেট করলে সাথে সাথে ক্লাউডে সিঙ্ক হবে'
                    : 'Adjust blood bag counts in real time across all 8 blood groups'}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {ALL_BLOOD_GROUPS.map((grp) => {
                  const count = bloodStock[grp] || 0;
                  const isLow = count < 10;
                  const barPct = Math.min(100, Math.round((count / 40) * 100));
                  return (
                    <div
                      key={grp}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 space-y-3"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-extrabold text-xl font-mono text-rose-600 dark:text-rose-400">
                          {grp}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isLow
                            ? lang === 'bn'
                              ? 'স্টক কম'
                              : 'Low Reserve'
                            : lang === 'bn'
                              ? 'পর্যাপ্ত'
                              : 'Optimal'}
                        </span>
                      </div>

                      <div className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                        {count}{' '}
                        <span className="text-xs font-sans font-normal text-slate-400">
                          {lang === 'bn' ? 'ব্যাগ' : 'bags'}
                        </span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isLow ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleStockChange(grp, -1)}
                          className="min-h-[38px] rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
                          aria-label={`Decrease ${grp}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStockChange(grp, 1)}
                          className="min-h-[38px] rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold cursor-pointer transition-colors"
                          aria-label={`Increase ${grp}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStockChange(grp, 5)}
                          className="min-h-[38px] rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-mono font-bold cursor-pointer transition-colors"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* MODULE 4: OTA APP UPDATE & MEGAPHONE BROADCAST */}
          {adminTab === 'megaphone' && (
            <div className="space-y-6">
              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-4">
                <div className="border-b border-slate-200 dark:border-slate-800/90 pb-4 space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'লাইভ অ্যাপ ও APK আপডেট রিলিজ সেন্টার'
                      : 'OTA App & APK Release Studio'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Current Build: v{CURRENT_APP_VERSION}
                  </p>
                </div>

                {liveAppRelease?.active && (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-emerald-950 dark:text-emerald-200 font-mono tabular-nums">
                        Active Release: v{liveAppRelease.version} · {liveAppRelease.mode}
                      </div>
                      <p className="text-xs text-emerald-900 dark:text-emerald-300">
                        {liveAppRelease.changelog}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        adminDeactivateAppUpdateInFirestore()
                          .then(() =>
                            showTempToast(
                              lang === 'bn'
                                ? '✓ রিমোট আপডেট নোটিশ বন্ধ করা হয়েছে'
                                : '✓ Deactivated remote update prompt'
                            )
                          )
                          .catch(() => {});
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      {lang === 'bn' ? 'আপডেট নোটিশ বন্ধ করুন' : 'Stop Prompt'}
                    </button>
                  </div>
                )}

                <form onSubmit={handlePublishAppUpdate} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="admin-release-version" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        {lang === 'bn' ? 'নতুন ভার্সন নম্বর *' : 'New Version *'}
                      </label>
                      <input
                        id="admin-release-version"
                        name="releaseVersion"
                        type="text"
                        required
                        maxLength={20}
                        value={releaseVersionInput}
                        onChange={(e) => setReleaseVersionInput(e.target.value)}
                        placeholder="2.6.0"
                        className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        {lang === 'bn' ? 'আপডেট মোড' : 'Release Enforcement'}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setReleaseModeInput('OPTIONAL')}
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                            releaseModeInput === 'OPTIONAL'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-100 dark:bg-[#070c17] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {lang === 'bn' ? 'ঐচ্ছিক আপডেট' : 'Optional Prompt'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReleaseModeInput('REQUIRED')}
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                            releaseModeInput === 'REQUIRED'
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-100 dark:bg-[#070c17] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {lang === 'bn' ? 'বাধ্যতামূলক আপডেট' : 'Required Force Update'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="admin-release-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'পরিবর্তন তালিকা (Changelog) *' : 'Release Notes *'}
                    </label>
                    <input
                      id="admin-release-notes"
                      name="releaseNotes"
                      type="text"
                      required
                      maxLength={360}
                      value={releaseNotesInput}
                      onChange={(e) => setReleaseNotesInput(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'যেমন: দ্রুত ডোনার সার্চ ও নতুন সিকিউরিটি আপডেট যুক্ত হয়েছে।'
                          : 'e.g. Faster donor lookup and improved emergency notifications.'
                      }
                      className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-release-apk-url" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn'
                        ? 'সরাসরি .APK ডাউনলোড লিংক (ঐচ্ছিক)'
                        : 'Direct .APK / Store URL (Optional)'}
                    </label>
                    <input
                      id="admin-release-apk-url"
                      name="releaseApkUrl"
                      type="url"
                      maxLength={200}
                      value={releaseApkUrlInput}
                      onChange={(e) => setReleaseApkUrlInput(e.target.value)}
                      placeholder="https://example.com/bloodsearch-latest.apk"
                      className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isPublishingAppUpdate || !releaseNotesInput.trim()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>
                      {isPublishingAppUpdate
                        ? lang === 'bn'
                          ? 'পুশ হচ্ছে...'
                          : 'Publishing...'
                        : lang === 'bn'
                          ? 'সকল ইউজারের কাছে আপডেট পুশ করুন'
                          : 'Push Update to All Users'}
                    </span>
                  </button>
                </form>
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-4">
                <div className="border-b border-slate-200 dark:border-slate-800/90 pb-4 space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'লাইভ মেগাফোন ঘোষণা (সকল ইউজারের স্ক্রিনে ব্যানার)'
                      : 'Global Megaphone Broadcast'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'জরুরি রক্তের ডাক বা রক্তদান ক্যাম্পের ঘোষণা তাৎক্ষণিকভাবে পুরো অ্যাপে পাঠান'
                      : 'Broadcast real-time banners to every active user across the network'}
                  </p>
                </div>

                <form onSubmit={handlePublishAnnouncement} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'CRITICAL', label: 'CRITICAL · জরুরি ডাক' },
                        { id: 'CAMPAIGN', label: 'CAMPAIGN · রক্তদান ক্যাম্প' },
                        { id: 'INFO', label: 'INFO · সাধারণ বিজ্ঞপ্তি' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBroadcastUrgency(p.id)}
                        className={`min-h-[42px] py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                          broadcastUrgency === p.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-100 dark:bg-[#070c17] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label htmlFor="admin-broadcast-title" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'শিরোনাম (ঐচ্ছিক)' : 'Headline (Optional)'}
                    </label>
                    <input
                      id="admin-broadcast-title"
                      name="broadcastTitle"
                      type="text"
                      maxLength={120}
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'যেমন: জরুরি প্লাটিলেট ও রক্তের ডাক — ঢাকা'
                          : 'e.g. Urgent Platelet & O- Donors Needed'
                      }
                      className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-broadcast-msg" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'ঘোষণার মূল বার্তা *' : 'Broadcast Message *'}
                    </label>
                    <input
                      id="admin-broadcast-msg"
                      name="broadcastMessage"
                      type="text"
                      required
                      maxLength={500}
                      value={broadcastMsg}
                      onChange={(e) => setBroadcastMsg(e.target.value)}
                      placeholder={
                        lang === 'bn'
                          ? 'আপনার বার্তা লিখুন...'
                          : 'Write the live announcement message...'
                      }
                      className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isPublishingBroadcast || !broadcastMsg.trim()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors"
                  >
                    {isPublishingBroadcast
                      ? lang === 'bn'
                        ? 'প্রকাশিত হচ্ছে...'
                        : 'Publishing...'
                      : lang === 'bn'
                        ? 'লাইভ ঘোষণা প্রকাশ করুন'
                        : 'Publish Live Broadcast'}
                  </button>
                </form>

                {announcements.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800/90 divide-y divide-slate-200 dark:divide-slate-800">
                    {announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                            {ann.urgency} · {ann.title} · {ann.updatedAtLabel}
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                            {ann.message}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            adminDeactivateAnnouncementInFirestore(ann.id)
                              .then(() =>
                                showTempToast(
                                  lang === 'bn'
                                    ? '✓ ঘোষণা বন্ধ করা হয়েছে'
                                    : '✓ Broadcast deactivated'
                                )
                              )
                              .catch(() => {});
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 font-bold shrink-0 cursor-pointer"
                        >
                          {lang === 'bn' ? 'বন্ধ করুন' : 'Stop'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* MODULE 5: SCAM REPORT MODERATION & SMART DONOR ID VERIFIER */}
          {adminTab === 'scam' && (
            <div className="space-y-6">
              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-3.5">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'স্মার্ট ডোনার আইডি ও ফোন ভেরিফিকেশন চেকার'
                    : 'Smart Donor ID & Phone Verifier'}
                </h2>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-donor-id-lookup"
                    name="donorIdLookup"
                    type="text"
                    value={donorIdLookupQuery}
                    onChange={(e) => setDonorIdLookupQuery(e.target.value)}
                    placeholder={
                      lang === 'bn'
                        ? 'ডোনার আইডি, নাম বা ফোন নম্বর লিখে সত্যতা যাচাই করুন...'
                        : 'Enter Donor ID, name, or phone number to verify...'
                    }
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                {donorIdLookupQuery.trim() && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {donors
                      .filter((d) => {
                        const q = donorIdLookupQuery.trim().toLowerCase();
                        return (
                          d.id.toLowerCase().includes(q) ||
                          d.name.toLowerCase().includes(q) ||
                          d.phone.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 6)
                      .map((d) => (
                        <div
                          key={d.id}
                          className="py-3 flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {d.name} · {d.bloodGroup}
                            </span>
                            <span className="block text-[11px] font-mono text-slate-500">
                              ID: {d.id} · {d.district} · {d.totalDonations} donations
                            </span>
                          </div>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {d.verifiedBadge ? 'Verified Donor' : 'Registered'}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'প্রতারক ও অগ্রিম বিকাশ ভাড়া দাবি রিপোর্ট তালিকা'
                      : 'Anti-Scam & Advance Fare Report Queue'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'সন্দেহজনক নম্বর যাচাই করে ব্লকলিস্টে যুক্ত করুন'
                      : 'Review and block reported scam numbers or suspicious profiles'}
                  </p>
                </div>

                {scamReports.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    {lang === 'bn'
                      ? '✓ কোনো অমীমাংসিত প্রতারণার রিপোর্ট নেই।'
                      : '✓ Zero pending scam reports.'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {scamReports.map((rep) => (
                      <div
                        key={rep.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {rep.suspectName} ·{' '}
                            <span className="font-mono">{rep.suspectPhone}</span> ·{' '}
                            <span className="text-rose-600 dark:text-rose-400">{rep.status}</span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">{rep.reason}</p>
                          <div className="text-[11px] text-slate-500">
                            Reported by {rep.reporterName} · {rep.createdAtLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              adminUpdateScamReportStatusInFirestore(rep.id, 'BLOCKED')
                                .then(() => showTempToast('✓ প্রতারক ব্লকলিস্টে যুক্ত হয়েছে'))
                                .catch(() => {});
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                          >
                            {lang === 'bn' ? 'ব্লক করুন' : 'Block'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              adminUpdateScamReportStatusInFirestore(rep.id, 'DISMISSED')
                                .then(() => showTempToast('✓ রিপোর্ট নিষ্পত্তি হয়েছে'))
                                .catch(() => {});
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold cursor-pointer"
                          >
                            {lang === 'bn' ? 'বাতিল' : 'Dismiss'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              adminDeleteScamReportInFirestore(rep.id).catch(() => {});
                            }}
                            className="min-h-[36px] min-w-[36px] rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* MODULE 6: SMART CLOUD DATABASE & ZERO-TRUST PENETRATION SHIELD */}
          {adminTab === 'database' && (
            <div className="space-y-6">
              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/90">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      {lang === 'bn'
                        ? 'লাইভ ক্লাউড ডাটাবেস ও ফায়ারওয়াল অডিট'
                        : 'Live Cloud Database & Firewall Audit'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono truncate">
                      PostgreSQL Primary Engine (/api/v1/*) · Zero-Trust Firewall Active
                    </p>
                  </div>
                </div>

                {/* Live Cloud Counts */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  {[
                    {
                      label: lang === 'bn' ? 'সার্ভার পিং' : 'Latency',
                      val: dbHealth ? `${dbHealth.latencyMs} ms` : '—',
                    },
                    {
                      label: lang === 'bn' ? 'ক্লাউড ডোনার' : 'Cloud Donors',
                      val: dbHealth ? dbHealth.counts.publicDonors : '—',
                    },
                    {
                      label: lang === 'bn' ? 'মোট SOS' : 'Cloud SOS',
                      val: dbHealth ? dbHealth.counts.publicRequests : '—',
                    },
                    {
                      label: lang === 'bn' ? 'সম্পন্ন SOS' : 'Completed SOS',
                      val: dbHealth ? dbHealth.counts.fulfilledOrCancelledRequests : '—',
                    },
                    {
                      label: lang === 'bn' ? 'চ্যাট মেসেজ' : 'Community Msgs',
                      val: dbHealth ? dbHealth.counts.communityMessages : '—',
                    },
                    {
                      label: lang === 'bn' ? 'কৃতজ্ঞতা নোট' : 'Gratitude',
                      val: dbHealth ? dbHealth.counts.gratitudeNotes : '—',
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800"
                    >
                      <span className="text-[11px] text-slate-500 block">{m.label}</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {m.val}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleRunSmartDbDiagnostic}
                    disabled={isScanningDb}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningDb ? 'animate-spin' : ''}`} />
                    <span>
                      {isScanningDb
                        ? lang === 'bn'
                          ? 'স্ক্যান চলছে...'
                          : 'Scanning...'
                        : lang === 'bn'
                          ? 'পেনিট্রেশন টেস্ট চালান'
                          : 'Run Penetration Test'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSmartCleanCompletedSos}
                    disabled={isCleaningFulfilled}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {isCleaningFulfilled
                        ? lang === 'bn'
                          ? 'পরিষ্কার হচ্ছে...'
                          : 'Cleaning...'
                        : lang === 'bn'
                          ? 'সম্পন্ন SOS অটো-ক্লিন'
                          : 'Clean Completed SOS'}
                    </span>
                  </button>
                </div>

                {dbHealth && (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-[#070c17] border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <th className="py-2.5 px-3.5 font-semibold">
                            {lang === 'bn' ? 'সিকিউরিটি প্রোব' : 'Security Probe'}
                          </th>
                          <th className="py-2.5 px-3.5 font-semibold font-mono">
                            {lang === 'bn' ? 'অ্যাটাক ভেক্টর' : 'Vector'}
                          </th>
                          <th className="py-2.5 px-3.5 font-semibold">
                            {lang === 'bn' ? 'সার্ভার ফলাফল' : 'Server Verdict'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {dbHealth.probes.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-white">
                              {lang === 'bn' ? p.nameBn : p.nameEn}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono text-slate-600 dark:text-slate-400">
                              {p.attackVector}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono font-bold">
                              <span
                                className={
                                  p.blockedAsExpected
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }
                              >
                                {p.blockedAsExpected ? '✓ ' : '✕ '}
                                {p.serverVerdict}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-4">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? `কালেকশন আর্কিটেকচার ম্যাপ (${DATABASE_COLLECTION_ARCHITECTURES.length}টি পাথ)`
                    : `Firestore Security Schema (${DATABASE_COLLECTION_ARCHITECTURES.length} Paths)`}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">Collection Path</th>
                        <th className="py-2.5 px-3 font-semibold">Access Policy</th>
                        <th className="py-2.5 px-3 font-semibold">Firewall Enforcement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {DATABASE_COLLECTION_ARCHITECTURES.map((col) => (
                        <tr key={col.id} className="align-top">
                          <td className="py-3 px-3 min-w-[200px]">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {lang === 'bn' ? col.titleBn : col.titleEn}
                            </div>
                            <div className="font-mono text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                              {col.path}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300">
                            {lang === 'bn' ? col.tierLabelBn : col.tierLabelEn}
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-400 leading-relaxed min-w-[240px]">
                            {lang === 'bn' ? col.smartBehaviorBn : col.smartBehaviorEn}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* MODULE 7: OWNER ANTI-HIJACK SECURITY VAULT */}
          {adminTab === 'vault' && (
            <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-6">
              <div className="pb-4 border-b border-slate-200 dark:border-slate-800/90 space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'ওনার মালিকানা সুরক্ষা ও কো-অ্যাডমিন ভল্ট'
                    : 'Sovereign Ownership & Co-Admin Vault'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {lang === 'bn'
                    ? 'সার্ভার-ভেরিফাইড সুপার ওনার ভল্ট · আপনি কাউকে ইনভাইট কোড না দিলে অন্য কেউ কখনোই অ্যাডমিন হতে পারবে না।'
                    : 'Server-verified Super Owner Vault · Nobody can claim admin rights unless issued a key below.'}
                </p>
              </div>

              {/* Standalone Admin URL Copy Bar */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {lang === 'bn'
                      ? 'আপনার গোপন অ্যাডমিন কনসোল লিংক'
                      : 'Dedicated Standalone Admin Console Link'}
                  </div>
                  <div className="text-xs font-mono text-amber-600 dark:text-amber-400 truncate">
                    {fullAdminTabUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyStandaloneUrl}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedAdminUrl ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedAdminUrl
                      ? lang === 'bn'
                        ? 'কপি হয়েছে'
                        : 'Copied'
                      : lang === 'bn'
                        ? 'লিংক কপি করুন'
                        : 'Copy Admin URL'}
                  </span>
                </button>
              </div>

              {!isSuperOwner ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                  {lang === 'bn'
                    ? 'শুধুমাত্র সুপার ওনার নতুন ইনভাইট কোড তৈরি বা কো-অ্যাডমিন বাতিল করতে পারবেন।'
                    : 'Only the verified Super Owner can create invite keys or revoke co-admins.'}
                </div>
              ) : (
                <>
                  <form
                    onSubmit={handleCreateInviteLock}
                    className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800/90"
                  >
                    <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {lang === 'bn'
                        ? '01. নতুন কো-অ্যাডমিন ইনভাইট কোড তৈরি করুন (ঐচ্ছিক)'
                        : '01. Issue New Co-Admin Invite Key (Optional)'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        id="admin-new-invite-code"
                        name="newInviteCode"
                        type="text"
                        required
                        minLength={6}
                        value={newInviteCode}
                        onChange={(e) => setNewInviteCode(e.target.value)}
                        placeholder={
                          lang === 'bn'
                            ? 'নতুন গোপন কোড (কমপক্ষে ৬ অক্ষর)'
                            : 'Secret key (min 6 chars)'
                        }
                        className="h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                      <input
                        id="admin-new-invite-label"
                        name="newInviteLabel"
                        type="text"
                        value={newInviteLabel}
                        onChange={(e) => setNewInviteLabel(e.target.value)}
                        placeholder={
                          lang === 'bn' ? 'টিম লেবেল (যেমন: ঢাকা টিম)' : 'Team label (e.g. Dhaka Team)'
                        }
                        className="h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isCreatingLock}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 text-white font-bold text-xs cursor-pointer transition-colors"
                    >
                      {isCreatingLock
                        ? lang === 'bn'
                          ? 'সংরক্ষণ হচ্ছে...'
                          : 'Saving...'
                        : lang === 'bn'
                          ? '+ ভল্টে কোড সংরক্ষণ করুন'
                          : '+ Save Key to Cloud Vault'}
                    </button>

                    {inviteLocks.length > 0 && (
                      <div className="pt-3 divide-y divide-slate-200 dark:divide-slate-800">
                        {inviteLocks.map((lock) => (
                          <div
                            key={lock.proofHash}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {lock.label}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono block truncate">
                                SHA256: {lock.proofHash.slice(0, 14)}... ·{' '}
                                {lock.active ? 'Active' : 'Paused'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  ownerToggleAdminInviteLock(
                                    lock.proofHash,
                                    !lock.active,
                                    lock.label
                                  )
                                }
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs cursor-pointer"
                              >
                                {lock.active
                                  ? lang === 'bn'
                                    ? 'পজ করুন'
                                    : 'Pause'
                                  : lang === 'bn'
                                    ? 'চালু করুন'
                                    : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => ownerDeleteAdminInviteLock(lock.proofHash)}
                                className="min-h-[34px] min-w-[34px] rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </form>

                  <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800/90">
                    <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {lang === 'bn'
                        ? `02. নিবন্ধিত কো-অ্যাডমিন তালিকা (${registeredAdmins.length})`
                        : `02. Active Co-Admins (${registeredAdmins.length})`}
                    </div>
                    {registeredAdmins.length === 0 ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {lang === 'bn'
                          ? '✓ বর্তমানে আপনি ছাড়া অন্য কোনো কো-অ্যাডমিন নেই।'
                          : '✓ Zero external co-admins registered. 100% exclusive control is yours.'}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {registeredAdmins.map((adm) => (
                          <div
                            key={adm.uid}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {adm.name}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono block truncate">
                                {adm.idCardNumber} · UID: {adm.uid.slice(0, 10)}...
                              </span>
                            </div>
                            {adm.uid === firebaseUser?.uid ? (
                              <span className="text-xs font-semibold text-emerald-600">Owner</span>
                            ) : confirmRevokeAdminUid === adm.uid ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeAdmin(adm.uid, adm.name)}
                                className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
                              >
                                {lang === 'bn' ? 'নিশ্চিত বাতিল' : 'Confirm Revoke'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRevokeAdminUid(adm.uid)}
                                className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 font-semibold text-xs cursor-pointer"
                              >
                                {lang === 'bn' ? 'বাতিল করুন' : 'Revoke'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-1.5 pt-4 border-t border-slate-200 dark:border-slate-800/90">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? '03. অরিজিন ও এপিআই ফায়ারওয়াল স্ট্যাটাস'
                    : '03. Origin & API Firewall Status'}
                </div>
                <p className="text-xs text-slate-500 font-mono truncate">
                  Origin: {secDiag.origin} · CSRF + Scanner Shield Active
                </p>
              </div>
            </section>
          )}

          {/* MODULE 8: ACTIVITY AUDIT LEDGER */}
          {adminTab === 'audit' && (
            <section className="rounded-2xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-800/90 p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/90">
                <div className="space-y-0.5">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {lang === 'bn' ? 'অ্যাডমিন অ্যাক্টিভিটি অডিট লগ' : 'Activity Audit Ledger'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'অ্যাডমিন সেশনের সকল পরিবর্তনের কালানুক্রমিক রেকর্ড'
                      : 'Chronological ledger of administrative actions'}
                  </p>
                </div>

                <div className="w-full sm:w-64 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-audit-search"
                    name="auditSearchQuery"
                    type="text"
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    placeholder={lang === 'bn' ? 'লগ খুঁজুন...' : 'Filter audit events...'}
                    className="w-full h-10 pl-9 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-[#070c17] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto font-mono text-xs">
                {filteredAuditLogs.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 font-sans">
                    {lang === 'bn' ? 'কোনো অডিট লগ পাওয়া যায়নি।' : 'No matching audit entries.'}
                  </div>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <div key={log.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {log.action}
                        </span>
                        <span className="text-slate-400 tabular-nums">{log.timestamp}</span>
                      </div>
                      <div className="text-slate-800 dark:text-slate-200 font-sans text-xs">
                        {log.targetDetails}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
