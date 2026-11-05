import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import {
  BloodRequest,
  BloodGroup,
  Donor,
  Language,
} from '../../types';
import { isSeedDonorId, isSeedRequestId } from '../../data/mockDonors';
import { DISTRICTS } from '../../data/bangladeshGeo';
import {
  requestRealDeviceGPSWithStatus,
  resolveBangladeshCoordinates,
  calculateHaversineDistance,
  formatDistance,
  Coordinates,
  DEFAULT_BANGLADESH_COORDS,
} from '../../utils/geolocation';
import { isPhoneMaskedOrInvalid } from '../../utils/donorMatcher';
import {
  calculateRecoveryCountdown,
  getStoredDonationLogs,
  canDonorGiveToPatient,
  DonationIntervalType,
  formatRelativeRequestTime,
  copyTextReliable,
} from '../../utils/sosAlertEngine';
import {
  auth,
  onAuthStateChanged,
  recordCompletedDonationInFirestore,
  User as FirebaseUser,
} from '../../services/bloodSearchService';
import {
  Megaphone,
  ChevronRight,
  CheckCircle2,
  Droplet,
  Hospital,
  Share2,
  MapPin,
  Search,
  Compass,
  Phone,
  ExternalLink,
  Navigation,
  Building2,
  UserPlus,
  MessageSquare,
  CalendarCheck,
  Clock,
  Stethoscope,
  FlaskConical,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import type { CareSuiteTab } from '../ecosystem/EmergencyCareSuiteModal';

interface DonorHomeViewProps {
  donors?: Donor[];
  requests: BloodRequest[];
  lang: Language;
  onOpenSOSWizard: (context?: { bloodGroup?: BloodGroup; district?: string }) => void;
  onOpenRegister: (role?: 'USER' | 'ADMIN') => void;
  onSelectRequest: (req: BloodRequest) => void;
  onQuickDonate: (req: BloodRequest) => void;
  onNavigateTab: (tab: any) => void;
  onFocusMapLocation?: (locationId?: string) => void;
  onQuickSearchByGroup?: (group: BloodGroup | 'ALL', district?: string) => void;
  onOpenDirectory?: () => void;
  onOpenPoster?: () => void;
  onOpenThalassemia?: () => void;
  onOpenPlayStore?: () => void;
  onOpenCareSuite?: (tab?: CareSuiteTab) => void;
}

interface MiniMapPin {
  id: string;
  name: string;
  label: string;
  type: 'DONOR' | 'SOS' | 'HOSPITAL';
  statusLabel: string;
  district: string;
  phone?: string;
  canDirectCall: boolean;
  lat: number;
  lng: number;
}

const VERIFIED_HOSPITAL_MINI_PINS: Omit<MiniMapPin, 'statusLabel'>[] = [
  {
    id: 'hosp-dmch',
    name: 'ঢাকা মেডিকেল কলেজ ব্লাড ব্যাংক (DMCH)',
    label: 'DMCH',
    type: 'HOSPITAL',
    district: 'শাহবাগ, ঢাকা',
    phone: '+880255165088',
    canDirectCall: true,
    lat: 23.7260,
    lng: 90.3976,
  },
  {
    id: 'hosp-bsmmu',
    name: 'বিএসএমএমইউ ট্রান্সফিউশন মেডিসিন (BSMMU)',
    label: 'BSMMU',
    type: 'HOSPITAL',
    district: 'শাহবাগ, ঢাকা',
    phone: '+880255165760',
    canDirectCall: true,
    lat: 23.7389,
    lng: 90.3958,
  },
  {
    id: 'hosp-nicvd',
    name: 'জাতীয় হৃদরোগ ইনস্টিটিউট ব্লাড ব্যাংক (NICVD)',
    label: 'NICVD',
    type: 'HOSPITAL',
    district: 'শের-ই-বাংলা নগর, ঢাকা',
    phone: '+88029122560',
    canDirectCall: true,
    lat: 23.7708,
    lng: 90.3695,
  },
];

function escapeMiniPinHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALL_BLOOD_GROUPS: BloodGroup[] = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-', 'AB-'];

const DonorHomeViewInner: React.FC<DonorHomeViewProps> = ({
  donors = [],
  requests,
  lang,
  onOpenSOSWizard,
  onOpenRegister,
  onSelectRequest,
  onQuickDonate,
  onNavigateTab,
  onFocusMapLocation,
  onQuickSearchByGroup,
  onOpenDirectory,
  onOpenPlayStore,
}) => {
  const [rareOnlyFilter, setRareOnlyFilter] = useState(false);
  const [expressGroup, setExpressGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [expressDistrict, setExpressDistrict] = useState<string>('ALL');

  const totalReadyDonors = useMemo(
    () => donors.filter((d) => !isSeedDonorId(d.id) && d.available).length,
    [donors]
  );

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_current_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [clockTick, setClockTick] = useState(0);
  const [copiedPinPhone, setCopiedPinPhone] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
    });
    const handleUserUpdate = () => {
      try {
        const saved = localStorage.getItem('bloodsearch_current_user');
        setCurrentUser(saved ? JSON.parse(saved) : null);
      } catch {}
    };
    window.addEventListener('bloodsearch_user_changed', handleUserUpdate);
    window.addEventListener('storage', handleUserUpdate);
    return () => {
      unsubAuth();
      window.removeEventListener('bloodsearch_user_changed', handleUserUpdate);
      window.removeEventListener('storage', handleUserUpdate);
    };
  }, []);

  const isLoggedIn = Boolean(currentUser || firebaseUser);
  const displayGroup: BloodGroup = currentUser?.bloodGroup || 'B+';

  const activeRequestsAll = useMemo(
    () => requests.filter((r) => !isSeedRequestId(r.id) && r.status === 'ACTIVE'),
    [requests]
  );

  const activeRequests = useMemo(() => {
    const filtered = rareOnlyFilter
      ? activeRequestsAll.filter((r) => r.bloodGroup.endsWith('-'))
      : activeRequestsAll;
    return filtered.slice(0, 4);
  }, [activeRequestsAll, rareOnlyFilter]);

  const [recoveryMode, setRecoveryMode] = useState<DonationIntervalType>(() => {
    const logs = getStoredDonationLogs();
    return currentUser?.lastDonationType || logs[0]?.type || 'WHOLE_BLOOD';
  });
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [logDateInput, setLogDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [logHospitalInput, setLogHospitalInput] = useState('');
  const [isSavingDonation, setIsSavingDonation] = useState(false);

  const recovery = useMemo(() => {
    void clockTick;
    const logs = getStoredDonationLogs();
    const lastIso = currentUser?.lastDonationDate || logs[0]?.date || '';
    return calculateRecoveryCountdown(lastIso, recoveryMode, lang);
  }, [currentUser, recoveryMode, lang, clockTick]);

  const [showReadinessCheck, setShowReadinessCheck] = useState(false);
  const [showCrossMatchGuide, setShowCrossMatchGuide] = useState(false);
  const [readinessChecks, setReadinessChecks] = useState({
    slept6Hrs: true,
    ateMeal: true,
    hydrated: true,
    noAntibiotics7d: true,
  });
  const readinessAllGood = Object.values(readinessChecks).every(Boolean);

  const [userCoords, setUserCoords] = useState<Coordinates>(DEFAULT_BANGLADESH_COORDS);
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);

  const miniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const miniMapInstanceRef = useRef<L.Map | null>(null);
  const miniMarkersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let mounted = true;
    requestRealDeviceGPSWithStatus().then(({ coords, isRealGps }) => {
      if (mounted) {
        setUserCoords(coords);
        setIsGpsActive(isRealGps);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const liveMiniPins = useMemo<MiniMapPin[]>(() => {
    const realItems: MiniMapPin[] = [];
    for (const req of activeRequestsAll) {
      if (realItems.length < 5) {
        const coords = resolveBangladeshCoordinates({
          district: req.district,
          upazila: req.upazila,
          division: req.division || 'dhaka',
          seedKey: `sos-${req.id}`,
        });
        const cleanCallable = !isPhoneMaskedOrInvalid(req.contactPhone);
        const km = calculateHaversineDistance(userCoords, coords);
        realItems.push({
          id: `real-map-sos-${req.id}`,
          name: req.hospitalName,
          label: req.bloodGroup,
          type: 'SOS',
          statusLabel: `${lang === 'bn' ? 'সক্রিয় SOS' : 'Active SOS'} · ${formatDistance(km, lang)}`,
          district: req.upazila ? `${req.upazila}, ${req.district}` : req.district,
          phone: cleanCallable ? req.contactPhone : undefined,
          canDirectCall: cleanCallable,
          lat: coords.latitude,
          lng: coords.longitude,
        });
      }
    }
    for (const d of donors) {
      if (!isSeedDonorId(d.id) && d.available && realItems.length < 5) {
        const coords = resolveBangladeshCoordinates({
          district: d.district,
          upazila: d.upazila,
          division: d.division || 'dhaka',
          seedKey: `donor-${d.id}`,
        });
        const allowDirect =
          d.shareDirectContact !== false &&
          d.allowCall !== false &&
          !isPhoneMaskedOrInvalid(d.phone);
        const km = calculateHaversineDistance(userCoords, coords);
        realItems.push({
          id: `real-map-donor-${d.id}`,
          name: d.name,
          label: d.bloodGroup,
          type: 'DONOR',
          statusLabel: `${lang === 'bn' ? 'প্রস্তুত ডোনার' : 'Ready Donor'} · ${formatDistance(km, lang)}`,
          district: `${d.upazila || ''}${d.upazila ? ', ' : ''}${d.district}`,
          phone: allowDirect ? d.phone : undefined,
          canDirectCall: allowDirect,
          lat: coords.latitude,
          lng: coords.longitude,
        });
      }
    }
    const hospitalPins: MiniMapPin[] = VERIFIED_HOSPITAL_MINI_PINS.map((h) => {
      const km = calculateHaversineDistance(userCoords, { latitude: h.lat, longitude: h.lng });
      return {
        ...h,
        statusLabel: `${lang === 'bn' ? 'সরকারি কেন্দ্র' : '24/7 Center'} · ${formatDistance(km, lang)}`,
      };
    });
    return [...realItems, ...hospitalPins].slice(0, 8);
  }, [donors, activeRequestsAll, userCoords, lang]);

  const [selectedPin, setSelectedPin] = useState<MiniMapPin | null>(null);
  const activeSelectedPin = useMemo(
    () =>
      (selectedPin && liveMiniPins.find((p) => p.id === selectedPin.id)) ||
      liveMiniPins[0] ||
      null,
    [selectedPin, liveMiniPins]
  );

  // Mount real interactive Leaflet street preview inside the Home Map card
  useEffect(() => {
    if (!miniMapContainerRef.current || miniMapInstanceRef.current) return;

    const map = L.map(miniMapContainerRef.current, {
      center: [23.7485, 90.3885],
      zoom: 12,
      minZoom: 6,
      maxZoom: 17,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    let tileErrors = 0;
    let usedFallback = false;
    const primaryTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    primaryTiles.on('tileerror', () => {
      tileErrors += 1;
      if (!usedFallback && tileErrors >= 4 && miniMapInstanceRef.current === map) {
        usedFallback = true;
        map.removeLayer(primaryTiles);
        L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);
      }
    });

    primaryTiles.addTo(map);
    const markersGroup = L.layerGroup().addTo(map);

    miniMapInstanceRef.current = map;
    miniMarkersLayerRef.current = markersGroup;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(miniMapContainerRef.current);

    const t1 = window.setTimeout(() => map.invalidateSize(), 100);
    const t2 = window.setTimeout(() => map.invalidateSize(), 350);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      map.remove();
      miniMapInstanceRef.current = null;
      miniMarkersLayerRef.current = null;
    };
  }, []);

  // Sync live pins and optional real GPS dot on Home mini-map
  useEffect(() => {
    const map = miniMapInstanceRef.current;
    const group = miniMarkersLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (isGpsActive) {
      const gpsIcon = L.divIcon({
        className: 'bsbd-leaflet-pin',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<div class="w-5 h-5 flex items-center justify-center"><span class="w-3.5 h-3.5 rounded-full bg-sky-600 border-2 border-white shadow ring-4 ring-sky-500/25"></span></div>`,
      });
      L.marker([userCoords.latitude, userCoords.longitude], {
        icon: gpsIcon,
        zIndexOffset: 850,
      })
        .bindTooltip(lang === 'bn' ? 'আপনার বর্তমান লোকেশন' : 'Your GPS Location', {
          direction: 'top',
          offset: [0, -8],
        })
        .addTo(group);
    }

    liveMiniPins.forEach((pin) => {
      const isSelected = activeSelectedPin?.id === pin.id;
      const safeLabel = escapeMiniPinHtml(pin.label);
      const bgClass = isSelected
        ? 'bg-rose-600 ring-2 ring-white shadow-lg scale-110'
        : pin.type === 'SOS'
          ? 'bg-red-600 ring-2 ring-white/90 shadow-md'
          : pin.type === 'DONOR'
            ? 'bg-emerald-600 ring-2 ring-white/90 shadow-md'
            : 'bg-slate-800 ring-2 ring-white/90 shadow-md';

      const icon = L.divIcon({
        className: 'bsbd-leaflet-pin',
        iconSize: [52, 28],
        iconAnchor: [26, 14],
        html: `
          <div class="w-[52px] h-[28px] flex items-center justify-center select-none">
            <div class="px-2 h-6 min-w-[30px] rounded-md text-white font-extrabold text-[10px] tracking-tight flex items-center justify-center whitespace-nowrap transition-transform ${bgClass}">
              ${safeLabel}
            </div>
          </div>
        `,
      });

      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : pin.type === 'SOS' ? 600 : pin.type === 'DONOR' ? 400 : 200,
      });

      marker.bindTooltip(`${pin.name}`, {
        direction: 'top',
        offset: [0, -12],
      });

      marker.on('click', () => {
        setSelectedPin(pin);
        map.panTo([pin.lat, pin.lng], { animate: true, duration: 0.45 });
      });

      marker.addTo(group);
    });
  }, [liveMiniPins, activeSelectedPin?.id, isGpsActive, userCoords, lang]);

  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  const showTempNotice = (msg: string) => {
    setHomeNotice(msg);
    setTimeout(() => setHomeNotice(null), 3800);
  };

  const handleRecordDonationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingDonation) return;
    setIsSavingDonation(true);
    try {
      const res = await recordCompletedDonationInFirestore({
        donationDate: logDateInput,
        donationType: recoveryMode,
        hospitalName:
          logHospitalInput.trim() ||
          (lang === 'bn' ? 'রক্ত সঞ্চালন কেন্দ্র' : 'Hospital Blood Unit'),
      });
      setShowLogDrawer(false);
      setLogHospitalInput('');
      showTempNotice(
        lang === 'bn'
          ? `রক্তদান লগ সম্পন্ন। মোট রক্তদান: ${res.totalDonations} বার। আপনার ${
              recoveryMode === 'PLATELET' ? '১৪ দিনের প্লাটিলেট' : '৯০ দিনের'
            } রিকভারি টাইমার চালু হয়েছে।`
          : `Donation recorded (${res.totalDonations} total). Recovery timer started.`
      );
    } finally {
      setIsSavingDonation(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto text-left pb-8">
      {homeNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200 text-xs font-semibold">
          {homeNotice}
        </div>
      )}

      {/* 1. Signature Brand Hero Command Card (Deep Navy + Crimson) */}
      <section className="rounded-3xl hero-brand-surface text-white overflow-hidden">
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            <div className="flex items-start gap-3.5 sm:gap-4">
              <BrandLogo
                variant="card"
                className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 shadow-lg"
              />
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="text-xs font-bold text-rose-300 tracking-tight">
                  {lang === 'bn'
                    ? 'বাংলাদেশ জরুরি রক্তদাতা সংযোগ নেটওয়ার্ক · ৬৪ জেলা'
                    : 'Bangladesh Direct Blood Donor Network · 64 Districts'}
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                  {lang === 'bn'
                    ? 'জরুরি মুহূর্তে সরাসরি প্রস্তুত রক্তদাতার সাথে যোগাযোগ করুন'
                    : 'Find Verified Blood Donors & Contact Directly in Minutes'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed max-w-2xl">
                  {lang === 'bn'
                    ? 'রক্তের গ্রুপ ও জেলা নির্বাচন করে ১ ক্লিকেই নিকটস্থ প্রস্তুত রক্তদাতাদের সরাসরি কল বা WhatsApp করুন, অথবা জরুরি SOS ব্রডকাস্ট পাঠান।'
                    : 'Pick blood group & district below to call or WhatsApp available donors in one tap, or broadcast an emergency SOS alert.'}
                </p>
              </div>
            </div>

            {/* Instant 1-Step High-Contrast Express Blood Group & District Finder */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/96 dark:bg-[#0d1527]/95 text-slate-900 dark:text-white border border-white/60 dark:border-slate-700/80 shadow-lg space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#0b2239] dark:text-slate-200">
                  {lang === 'bn'
                    ? 'দ্রুত রক্তের গ্রুপ নির্বাচন করুন'
                    : 'Select Blood Group Needed'}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? '১ ক্লিকে সরাসরি সার্চ' : '1-Tap Instant Search'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setExpressGroup('ALL')}
                  className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer whitespace-nowrap shrink-0 ${
                    expressGroup === 'ALL' ? 'btn-crimson' : 'btn-surface'
                  }`}
                >
                  {lang === 'bn' ? 'সব গ্রুপ' : 'All'}
                </button>
                {ALL_BLOOD_GROUPS.map((grp) => {
                  const selected = expressGroup === grp;
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setExpressGroup(grp)}
                      className={`min-h-[42px] min-w-[46px] px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer whitespace-nowrap shrink-0 ${
                        selected ? 'btn-crimson' : 'btn-surface'
                      }`}
                    >
                      {grp}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  id="home-express-district"
                  name="expressDistrict"
                  value={expressDistrict}
                  onChange={(e) => setExpressDistrict(e.target.value)}
                  aria-label="Express District Selector"
                  className="sm:col-span-5 h-11 px-3 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#111b30] text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                >
                  <option value="ALL">
                    {lang === 'bn' ? 'সকল জেলা (সমগ্র বাংলাদেশ)' : 'All 64 Districts'}
                  </option>
                  {DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {lang === 'bn' ? d.nameBn : d.nameEn}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (onQuickSearchByGroup) {
                      onQuickSearchByGroup(expressGroup, expressDistrict);
                    } else {
                      onNavigateTab('search');
                    }
                  }}
                  className="sm:col-span-4 min-h-[44px] px-4 py-2 rounded-xl btn-crimson font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span>
                    {expressGroup === 'ALL'
                      ? lang === 'bn'
                        ? 'সব ডোনার খুঁজুন'
                        : 'Find All Donors'
                      : lang === 'bn'
                        ? `${expressGroup} ডোনার খুঁজুন`
                        : `Find ${expressGroup} Donors`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenSOSWizard({
                      bloodGroup: expressGroup !== 'ALL' ? expressGroup : undefined,
                      district: expressDistrict !== 'ALL' ? expressDistrict : undefined,
                    })
                  }
                  className="sm:col-span-3 min-h-[44px] px-3 py-2 rounded-xl btn-obsidian font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Megaphone className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{lang === 'bn' ? 'SOS পোস্ট' : 'Post SOS'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Live Real Metrics & Quick Shortcuts */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-2.5 content-between">
            <button
              type="button"
              onClick={() => {
                if (onQuickSearchByGroup) onQuickSearchByGroup('ALL', 'ALL');
                else onNavigateTab('search');
              }}
              className="p-3.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/16 text-left transition-colors cursor-pointer backdrop-blur-xs"
            >
              <div className="text-[11px] font-semibold text-slate-200">
                {lang === 'bn' ? 'প্রস্তুত রক্তদাতা' : 'Ready Donors'}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums mt-0.5">
                {totalReadyDonors}
              </div>
              <div className="text-[11px] text-emerald-300 font-bold mt-1 flex items-center gap-1 whitespace-nowrap">
                <span>{lang === 'bn' ? 'ডিরেক্টরি দেখুন' : 'Browse directory'}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('requests')}
              className="p-3.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/28 border border-rose-300/25 text-left transition-colors cursor-pointer backdrop-blur-xs"
            >
              <div className="text-[11px] font-semibold text-rose-100">
                {lang === 'bn' ? 'সক্রিয় জরুরি আবেদন' : 'Active SOS Requests'}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white font-mono tabular-nums mt-0.5">
                {activeRequestsAll.length}
              </div>
              <div className="text-[11px] text-rose-200 font-bold mt-1 flex items-center gap-1 whitespace-nowrap">
                <span>{lang === 'bn' ? 'সকল আবেদন দেখুন' : 'View requests'}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('chat')}
              className="p-3.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/16 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer backdrop-blur-xs"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {lang === 'bn' ? 'লাইভ চ্যাট ও GPS' : 'Live Chat & GPS'}
                </div>
                <div className="text-[11px] text-slate-300 truncate mt-0.5">
                  {lang === 'bn' ? 'স্লিপ ছবি ও লোকেশন' : 'Slip & location'}
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenRegister('USER')}
              className="p-3.5 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/16 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer backdrop-blur-xs"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {isLoggedIn
                    ? lang === 'bn'
                      ? 'ডোনার কার্ড আপডেট'
                      : 'Update Donor ID'
                    : lang === 'bn'
                    ? 'ডোনার নিবন্ধন'
                    : 'Join as Donor'}
                </div>
                <div className="text-[11px] text-slate-300 truncate mt-0.5">
                  {lang === 'bn' ? 'স্মার্ট আইডি ও সেটিংস' : 'Smart ID & privacy'}
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-rose-500/25 text-rose-200 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
            </button>

            {onOpenPlayStore && (
              <button
                type="button"
                onClick={onOpenPlayStore}
                className="col-span-2 min-h-[44px] px-3.5 py-2 rounded-2xl bg-white/12 hover:bg-white/20 border border-white/18 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Download className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span className="text-xs font-bold text-white truncate">
                    {lang === 'bn'
                      ? 'BloodSearch অ্যাপ ইনস্টল করুন'
                      : 'Install BloodSearch App'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-200 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Active Emergency Blood Requests Section — Signature Ruby-Burgundy Jewel Theme */}
      <section className="rounded-3xl section-jewel-ruby p-4 sm:p-6 space-y-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
              {lang === 'bn' ? 'সক্রিয় জরুরি রক্তের আবেদনসমূহ' : 'Active Emergency Blood Requests'}
            </h3>
            <p className="text-xs text-rose-200/90">
              {lang === 'bn'
                ? 'রিয়েল-টাইম যাচাইকৃত জরুরি রক্তের চাহিদা'
                : 'Real-time verified urgent blood requests'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRareOnlyFilter(!rareOnlyFilter)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border whitespace-nowrap ${
                rareOnlyFilter
                  ? 'bg-white text-rose-900 border-white shadow-sm'
                  : 'bg-white/12 text-rose-100 border-white/25 hover:bg-white/22'
              }`}
            >
              {lang === 'bn' ? 'নেগেটিভ গ্রুপ' : 'Negative Only'}
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('requests')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-500/25 hover:bg-rose-500/45 border border-rose-300/35 text-white cursor-pointer whitespace-nowrap transition-colors"
            >
              {lang === 'bn' ? 'সব দেখুন →' : 'See All →'}
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {activeRequests.length === 0 ? (
            <div className="p-6 rounded-2xl surface-card text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-[#dc2626] dark:text-rose-400 flex items-center justify-center mx-auto">
                <Droplet className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#0b2239] dark:text-white">
                  {rareOnlyFilter
                    ? lang === 'bn'
                      ? 'এই মুহূর্তে কোনো নেগেটিভ গ্রুপের সক্রিয় আবেদন নেই'
                      : 'No active negative blood group requests right now'
                    : lang === 'bn'
                    ? 'এই মুহূর্তে কোনো সক্রিয় জরুরি রক্তের আবেদন নেই'
                    : 'No active emergency blood requests right now'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {lang === 'bn'
                    ? 'কারো জরুরি রক্তের প্রয়োজন হলে নিচের বাটনে ক্লিক করে আবেদন পোস্ট করুন — নিকটস্থ প্রস্তুত ডোনাররা সাথে সাথে নোটিফিকেশন পাবেন।'
                    : 'Need blood urgently? Post a verified request below to alert matching donors immediately.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                {rareOnlyFilter && (
                  <button
                    type="button"
                    onClick={() => setRareOnlyFilter(false)}
                    className="min-h-[44px] px-4 py-2 rounded-xl btn-surface text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {lang === 'bn' ? 'সকল গ্রুপ দেখুন' : 'Show All Groups'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenSOSWizard()}
                  className="min-h-[44px] px-4 py-2 rounded-xl btn-crimson text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Megaphone className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {lang === 'bn' ? 'জরুরি রক্তের আবেদন পোস্ট করুন' : 'Post Blood Request'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            activeRequests.map((req) => {
              const isCompatibleForMe = canDonorGiveToPatient(displayGroup, req.bloodGroup);
              const isMyOwnRequest = Boolean(
                (firebaseUser?.uid && req.authorUid === firebaseUser.uid) ||
                  (!req.authorUid && req.id.startsWith('sos_'))
              );
              const liveTime = formatRelativeRequestTime(
                req.createdAtMs,
                req.createdAt,
                lang,
                Date.now() + clockTick * 0
              );
              return (
                <div
                  key={req.id}
                  className="bg-white/97 dark:bg-[#11192c]/95 border border-white/70 dark:border-rose-900/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md hover:bg-white dark:hover:bg-[#162038] transition-all"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl btn-crimson flex flex-col items-center justify-center font-black text-base shrink-0">
                      <span>{req.bloodGroup}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                          {req.hospitalName}
                        </h4>
                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                          ·{' '}
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
                        {isCompatibleForMe && !isMyOwnRequest && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            · {lang === 'bn' ? 'আপনার গ্রুপ ম্যাচ করে' : 'Matches You'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-1 flex-wrap tabular-nums">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{req.district}</span>
                        </span>
                        <span>·</span>
                        <span>{liveTime}</span>
                        <span>·</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {Math.max(1, req.unitsNeeded - req.unitsCollected)}{' '}
                          {lang === 'bn' ? 'ব্যাগ প্রয়োজন' : 'bag(s) needed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {isMyOwnRequest ? (
                      <button
                        type="button"
                        onClick={() => onNavigateTab('requests')}
                        className="min-h-[42px] px-4 py-2 btn-obsidian font-bold text-xs rounded-xl cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'bn' ? 'আপনার আবেদন দেখুন' : 'Manage Request'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onQuickDonate(req)}
                        className="min-h-[42px] px-4 py-2 btn-crimson font-bold text-xs rounded-xl cursor-pointer whitespace-nowrap"
                      >
                        {lang === 'bn' ? 'আমি রক্ত দেব' : 'Respond to Donate'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectRequest(req)}
                      className="min-h-[42px] w-10 rounded-xl btn-surface flex items-center justify-center cursor-pointer shrink-0"
                      title={lang === 'bn' ? 'শেয়ার করুন' : 'Share'}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3 & 4. Two-Column Ocean-Sapphire Live Map + Forest-Emerald Readiness Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Live Interactive Street Map Preview Card — Ocean Sapphire Jewel Theme */}
        <section className="section-jewel-ocean rounded-3xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 text-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-sky-500/25 border border-sky-300/35 text-sky-200 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-sm sm:text-base text-white truncate">
                  {lang === 'bn' ? 'লাইভ হাসপাতাল ও ডোনার ম্যাপ' : 'Live Hospital & Donor Map'}
                </h3>
                <p className="text-[11px] text-sky-200/90 truncate">
                  {isGpsActive
                    ? lang === 'bn'
                      ? 'GPS সক্রিয় · সরকারি ব্লাড ব্যাংক ও প্রস্তুত ডোনার'
                      : 'GPS Active · Verified centers & ready donors'
                    : lang === 'bn'
                    ? 'ঢাকা ও ৬৪ জেলা · সরকারি ব্লাড ব্যাংক ও প্রস্তুত ডোনার'
                    : 'Dhaka & 64 Districts · Verified centers & ready donors'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (onFocusMapLocation) {
                  onFocusMapLocation(activeSelectedPin?.id);
                } else {
                  onNavigateTab('map');
                }
              }}
              className="min-h-[38px] px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              {lang === 'bn' ? 'পূর্ণ ম্যাপ →' : 'Open Map →'}
            </button>
          </div>

          <div className="relative w-full h-48 sm:h-52 rounded-2xl overflow-hidden border border-white/20 bg-slate-100 dark:bg-slate-900">
            <div ref={miniMapContainerRef} className="w-full h-full z-0" />

            <div className="absolute top-2.5 left-2.5 z-[400] flex items-center gap-1 pointer-events-auto">
              <button
                type="button"
                onClick={() => miniMapInstanceRef.current?.zoomIn()}
                className="w-7 h-7 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center shadow-xs cursor-pointer"
                title="Zoom In"
                aria-label="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => miniMapInstanceRef.current?.zoomOut()}
                className="w-7 h-7 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm flex items-center justify-center shadow-xs cursor-pointer"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                −
              </button>
            </div>

            <div className="absolute top-2.5 right-2.5 z-[400] px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-100 text-[10px] font-semibold font-mono tabular-nums pointer-events-none">
              {liveMiniPins.length} {lang === 'bn' ? 'লোকেশন' : 'pins'}
            </div>
          </div>

          {activeSelectedPin && (
            <div className="p-3 rounded-xl bg-white/95 dark:bg-slate-950/80 border border-white/40 dark:border-slate-800 flex items-center justify-between gap-2.5 text-slate-900 dark:text-white">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`px-2.5 h-9 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                    activeSelectedPin.type === 'DONOR'
                      ? 'bg-emerald-600'
                      : activeSelectedPin.type === 'SOS'
                      ? 'bg-rose-600'
                      : 'bg-slate-800'
                  }`}
                >
                  <span>{activeSelectedPin.label}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight truncate">
                    {activeSelectedPin.name}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate tabular-nums">
                    <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                    <span className="truncate">{activeSelectedPin.district}</span>
                    <span>·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                      {activeSelectedPin.statusLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeSelectedPin.canDirectCall && activeSelectedPin.phone ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        if (activeSelectedPin.phone) {
                          const ok = await copyTextReliable(activeSelectedPin.phone);
                          if (ok) {
                            setCopiedPinPhone(true);
                            window.setTimeout(() => setCopiedPinPhone(false), 2000);
                          }
                        }
                      }}
                      className="hidden sm:flex min-h-[36px] px-2 py-1 btn-surface font-bold text-[11px] rounded-lg items-center gap-1 cursor-pointer whitespace-nowrap"
                      title={activeSelectedPin.phone}
                    >
                      {copiedPinPhone ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="font-mono tabular-nums">{activeSelectedPin.phone}</span>
                    </button>
                    <a
                      href={`tel:${activeSelectedPin.phone}`}
                      className="min-h-[36px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                    </a>
                  </>
                ) : null}

                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activeSelectedPin.lat},${activeSelectedPin.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] w-9 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg flex items-center justify-center cursor-pointer"
                  title={lang === 'bn' ? 'Google Maps ডিরেকশন' : 'Google Maps Directions'}
                >
                  <Navigation className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    if (onFocusMapLocation) {
                      onFocusMapLocation(activeSelectedPin.id);
                    } else {
                      onNavigateTab('map');
                    }
                  }}
                  className="min-h-[36px] w-9 bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                  title={lang === 'bn' ? 'পূর্ণ ম্যাপে দেখুন' : 'Focus in Full Map'}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 90-Day Whole Blood & 14-Day Platelet Readiness Tracker — Forest Emerald Jewel Theme */}
        <section className="section-jewel-emerald rounded-3xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 text-white">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    recovery.isEligible
                      ? 'bg-emerald-400/20 border-emerald-300/35 text-emerald-200'
                      : 'bg-amber-400/20 border-amber-300/35 text-amber-200'
                  }`}
                >
                  {recovery.isEligible ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Clock className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-sm sm:text-base text-white leading-snug">
                    {recovery.isEligible
                      ? lang === 'bn'
                        ? 'রক্তদানের জন্য প্রস্তুত'
                        : 'Eligible to Donate Today'
                      : lang === 'bn'
                      ? 'রক্তদান পরবর্তী রিকভারি বিশ্রাম'
                      : 'Post-Donation Recovery Active'}
                  </h3>
                  <p className="text-[11px] text-emerald-200/90 mt-0.5 truncate">
                    {lang === 'bn'
                      ? `সর্বশেষ: ${recovery.lastDonatedLabel} · পরবর্তী: ${recovery.nextEligibleDateLabel}`
                      : `Last: ${recovery.lastDonatedLabel} · Next: ${recovery.nextEligibleDateLabel}`}
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-white/12 border border-white/20 text-[11px] font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setRecoveryMode('WHOLE_BLOOD')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                    recoveryMode === 'WHOLE_BLOOD'
                      ? 'bg-white text-emerald-950 shadow-2xs'
                      : 'text-emerald-100 hover:bg-white/15'
                  }`}
                >
                  {lang === 'bn' ? 'পূর্ণ রক্ত (৯০ দিন)' : 'Whole (90d)'}
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryMode('PLATELET')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                    recoveryMode === 'PLATELET'
                      ? 'bg-white text-emerald-950 shadow-2xs'
                      : 'text-emerald-100 hover:bg-white/15'
                  }`}
                >
                  {lang === 'bn' ? 'প্লাটিলেট (১৪ দিন)' : 'Platelet (14d)'}
                </button>
              </div>
            </div>

            {/* Readiness Status OR Active Countdown Progress */}
            {recovery.isEligible ? (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-white/12 border border-emerald-300/30 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-white">
                      {recovery.daysSinceLast !== null
                        ? lang === 'bn'
                          ? 'রিকভারি বিরতি ১০০% সম্পন্ন'
                          : '100% Recovery Interval Complete'
                        : lang === 'bn'
                        ? 'বর্তমান স্ট্যাটাস: রক্তদানে প্রস্তুত'
                        : 'Current Status: Ready to Donate'}
                    </span>
                    <span className="font-mono font-bold text-[11px] text-emerald-200 tabular-nums">
                      {recoveryMode === 'PLATELET'
                        ? lang === 'bn'
                          ? '১৪ দিনের চক্র'
                          : '14-Day Cycle'
                        : lang === 'bn'
                        ? '৯০ দিনের চক্র'
                        : '90-Day Cycle'}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full w-full bg-emerald-400" />
                  </div>
                </div>

                {/* 3-Column Clinical Readiness Standards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'নিরাপদ বিরতি' : 'Min. Interval'}
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums mt-0.5">
                      {recovery.intervalDays} {lang === 'bn' ? 'দিন' : 'Days'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'বয়স ও ওজন' : 'Age & Weight'}
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums mt-0.5">
                      {lang === 'bn' ? '১৮–৬০ · ৫০+কেজি' : '18–60y · ≥50kg'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'হিমোগ্লোবিন' : 'Hemoglobin'}
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums mt-0.5">
                      ≥12.5 g/dL
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-emerald-100/90 leading-relaxed">
                  {recovery.daysSinceLast !== null
                    ? lang === 'bn'
                      ? `সর্বশেষ রক্তদানের পর ${recovery.daysSinceLast} দিন অতিবাহিত হয়েছে। রক্ত দেওয়ার আগে ৬+ ঘণ্টা ঘুম ও হালকা খাবার নিশ্চিত করুন।`
                      : `${recovery.daysSinceLast} days since your last donation. Ensure 6+ hrs sleep and a meal before donating.`
                    : lang === 'bn'
                    ? 'সম্প্রতি রক্তদান করে থাকলে নিচের "রক্তদান লগ করুন" বাটনে তারিখ সংরক্ষণ করুন — পরবর্তী নিরাপদ তারিখ স্বয়ংক্রিয়ভাবে হিসাব হবে।'
                    : 'Donated recently? Tap "Log Donation" below to track your automatic 90-day or 14-day recovery schedule.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-amber-400/15 border border-amber-300/35 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-200">
                      {lang === 'bn' ? 'রিকভারি কাউন্টডাউন' : 'Recovery Countdown'}
                    </span>
                    <div className="font-mono font-bold text-white tabular-nums">
                      {String(recovery.remainingDays).padStart(2, '0')}d :{' '}
                      {String(recovery.remainingHours).padStart(2, '0')}h :{' '}
                      {String(recovery.remainingMinutes).padStart(2, '0')}m
                    </div>
                  </div>
                  <progress
                    value={recovery.progressPercent}
                    max={100}
                    className="w-full h-2 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-amber-400 [&::-moz-progress-bar]:bg-amber-400"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'সম্পন্ন দিন' : 'Completed'}
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white font-mono tabular-nums mt-0.5">
                      {recovery.daysSinceLast ?? 0}/{recovery.intervalDays}d
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'অগ্রগতি' : 'Recovered'}
                    </div>
                    <div className="text-xs sm:text-sm font-black text-amber-300 font-mono tabular-nums mt-0.5">
                      {recovery.progressPercent}%
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/10 border border-white/16">
                    <div className="text-[10px] font-semibold text-emerald-200 truncate">
                      {lang === 'bn' ? 'পরবর্তী তারিখ' : 'Next Date'}
                    </div>
                    <div className="text-xs font-bold text-white truncate mt-0.5 tabular-nums">
                      {recovery.nextEligibleDateLabel}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-emerald-100/90 leading-relaxed">
                  {lang === 'bn'
                    ? 'রিকভারি চলাকালীন আয়রনসমৃদ্ধ খাবার ও পর্যাপ্ত পানি পান করুন। জরুরি আবেদনে আপনি পরিবার বা পরিচিত ডোনার রেফার করতে পারেন।'
                    : 'Focus on hydration and iron-rich meals during recovery. You can still share SOS posts to help patients.'}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowLogDrawer(!showLogDrawer);
                  setShowReadinessCheck(false);
                  setShowCrossMatchGuide(false);
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg btn-crimson font-bold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'bn' ? 'রক্তদান লগ করুন' : 'Log Donation'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowReadinessCheck(!showReadinessCheck);
                  setShowLogDrawer(false);
                  setShowCrossMatchGuide(false);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/14 hover:bg-white/24 border border-white/25 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <Stethoscope className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>{lang === 'bn' ? 'পূর্ব-প্রস্তুতি চেক' : 'Readiness Check'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCrossMatchGuide(!showCrossMatchGuide);
                  setShowLogDrawer(false);
                  setShowReadinessCheck(false);
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/14 hover:bg-white/24 border border-white/25 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <FlaskConical className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                <span>{lang === 'bn' ? 'ক্রস-ম্যাচ গাইড' : 'Cross-Match Guide'}</span>
              </button>
            </div>

            {showLogDrawer && (
              <form
                onSubmit={handleRecordDonationSubmit}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="home-log-date" className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'রক্তদানের তারিখ' : 'Donation Date'}
                    </label>
                    <input
                      id="home-log-date"
                      name="donationDate"
                      type="date"
                      value={logDateInput}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setLogDateInput(e.target.value)}
                      className="w-full h-10 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="home-log-hospital" className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'হাসপাতাল / ব্লাড ব্যাংক' : 'Hospital / Blood Bank'}
                    </label>
                    <input
                      id="home-log-hospital"
                      name="donationHospital"
                      type="text"
                      value={logHospitalInput}
                      onChange={(e) => setLogHospitalInput(e.target.value)}
                      placeholder={lang === 'bn' ? 'যেমন: ঢাকা মেডিকেল' : 'e.g. DMCH'}
                      className="w-full h-10 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogDrawer(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                  >
                    {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingDonation}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  >
                    {isSavingDonation
                      ? lang === 'bn'
                        ? 'সেভ হচ্ছে...'
                        : 'Saving...'
                      : lang === 'bn'
                      ? 'ক্লাউডে সেভ করুন'
                      : 'Save & Start Timer'}
                  </button>
                </div>
              </form>
            )}

            {showReadinessCheck && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-900 dark:text-white">
                  {lang === 'bn'
                    ? 'রক্ত দিতে যাওয়ার আগে ৪টি জরুরি মেডিকেল চেক:'
                    : '4 Essential Checks Before Visiting the Blood Bank:'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    {
                      k: 'slept6Hrs' as const,
                      label: lang === 'bn' ? 'গত রাতে অন্তত ৬ ঘণ্টা ঘুম হয়েছে' : 'Slept 6+ hours last night',
                    },
                    {
                      k: 'ateMeal' as const,
                      label: lang === 'bn' ? 'খালি পেটে নই (হালকা খাবার খেয়েছি)' : 'Had a meal within 3 hours',
                    },
                    {
                      k: 'hydrated' as const,
                      label: lang === 'bn' ? 'পর্যাপ্ত পানি পান করেছি' : 'Hydrated before donating',
                    },
                    {
                      k: 'noAntibiotics7d' as const,
                      label: lang === 'bn' ? 'গত ৭ দিনে অ্যান্টিবায়োটিক সেবন করিনি' : 'No antibiotics in 7 days',
                    },
                  ].map((item) => (
                    <label
                      key={item.k}
                      className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        name={`readiness_${item.k}`}
                        type="checkbox"
                        checked={readinessChecks[item.k]}
                        onChange={() =>
                          setReadinessChecks((prev) => ({ ...prev, [item.k]: !prev[item.k] }))
                        }
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div
                  className={`text-[11px] font-semibold ${
                    readinessAllGood
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {readinessAllGood
                    ? lang === 'bn'
                      ? 'আপনি নিরাপদে রক্তদানের জন্য প্রস্তুত। রক্তদানের পর ১৫ মিনিট বিশ্রাম ও পানি পান করুন।'
                      : 'You are medically ready. Rest 15 mins & hydrate after donating.'
                    : lang === 'bn'
                    ? 'অনুগ্রহ করে উপরের সবগুলো শর্ত পূরণ করে তবেই রক্তদান করুন।'
                    : 'Please complete all 4 safety steps above before donating.'}
                </div>
              </div>
            )}

            {showCrossMatchGuide && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-rose-600 dark:text-rose-400">
                      Whole Blood / PRBC
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {lang === 'bn'
                        ? 'সার্জারি, রক্তক্ষরণ ও থ্যালাসেমিয়ায় ব্যবহৃত হয়। বিরতি: ৯০ দিন।'
                        : 'Trauma, surgery & thalassemia. Cooldown: 90 days.'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">
                      SDP / RDP Platelet & 5-Test
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {lang === 'bn'
                        ? 'ডেঙ্গু ও ক্যান্সারে প্লাটিলেট বিরতি ১৪ দিন। HBV, HCV, HIV, Syphilis, Malaria টেস্ট আবশ্যক।'
                        : 'Platelet cooldown: 14 days. Verify mandatory 5-test lab screening.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 5. Essential Blood Bank & Matching Help — Royal Indigo-Plum Jewel Theme */}
      <section className="section-jewel-indigo rounded-3xl p-4 sm:p-6 space-y-4 text-white">
        <div>
          <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
            {lang === 'bn'
              ? 'জরুরি ব্লাড ব্যাংক ও সরাসরি সহায়তা'
              : 'Essential Blood Bank & Matching Help'}
          </h3>
          <p className="text-xs text-indigo-200/90">
            {lang === 'bn'
              ? 'শুধু রক্তদাতা ও রোগীর জন্য প্রয়োজনীয় ৩টি সরাসরি সেবা'
              : 'Direct blood bank hotlines, live donor map & blood group compatibility'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: lang === 'bn' ? '২৪/৭ ব্লাড ব্যাংক ও ৯৯৯ হটলাইন' : '24/7 Blood Banks & 999',
              sub:
                lang === 'bn'
                  ? 'সরকারি ও ভেরিফাইড ব্লাড ব্যাংকের সরাসরি নম্বর'
                  : 'Verified government & hospital blood bank numbers',
              icon: Building2,
              cardBg:
                'bg-rose-500/20 hover:bg-rose-500/35 border-rose-300/30',
              iconTone: 'bg-rose-500 text-white',
              onClick: onOpenDirectory,
            },
            {
              label: lang === 'bn' ? 'লাইভ হাসপাতাল ও ডোনার ম্যাপ' : 'Live Hospital & Donor Map',
              sub:
                lang === 'bn'
                  ? 'জিপিএস ও এলাকার নাম দিয়ে নিকটস্থ রক্তদাতা খুঁজুন'
                  : 'Find closest donors & hospitals by GPS or neighborhood',
              icon: Hospital,
              cardBg:
                'bg-sky-500/20 hover:bg-sky-500/35 border-sky-300/30',
              iconTone: 'bg-sky-500 text-white',
              onClick: () => onNavigateTab('map'),
            },
            {
              label: lang === 'bn' ? 'রক্তের গ্রুপ ম্যাচিং চার্ট' : 'Blood Group Compatibility',
              sub:
                lang === 'bn'
                  ? 'কোন গ্রুপের মানুষ কাকে রক্ত দিতে ও নিতে পারবেন'
                  : 'Check who can safely donate to or receive from your group',
              icon: Droplet,
              cardBg:
                'bg-emerald-500/20 hover:bg-emerald-500/35 border-emerald-300/30',
              iconTone: 'bg-emerald-500 text-white',
              onClick: () => onNavigateTab('compatibility'),
            },
          ].map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={tool.onClick}
                className={`min-h-[76px] p-4 rounded-2xl border ${tool.cardBg} transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-3.5 text-left cursor-pointer`}
              >
                <div className={`w-11 h-11 rounded-xl ${tool.iconTone} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-black text-white leading-snug truncate">
                    {tool.label}
                  </div>
                  <div className="text-[11px] text-slate-200/85 mt-0.5 truncate">
                    {tool.sub}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/80 shrink-0" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export const DonorHomeView = React.memo(DonorHomeViewInner);
