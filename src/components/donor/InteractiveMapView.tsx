import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import {
  BloodGroup,
  Language,
  Donor,
  BloodRequest,
  LiveDonorTrip,
  LiveDonorTripStatus,
} from '../../types';
import { auth } from '../../services/bloodSearchService';
import {
  isSeedDonorId,
  isSeedRequestId,
  evictSeedsProgressively,
} from '../../data/mockDonors';
import { DIVISIONS } from '../../data/bangladeshGeo';
import {
  requestRealDeviceGPSWithStatus,
  requestFreshHighAccuracyGPS,
  clearCachedDeviceGps,
  watchRealDeviceGPS,
  calculateHaversineDistance,
  formatDistance,
  formatTravelEta,
  resolveBangladeshCoordinates,
  resolvePlaceOrHospitalQuery,
  findNearestDistrictFromCoords,
  reverseGeocodeBangladeshCoords,
  POPULAR_BD_HOSPITALS,
  searchBangladeshPlacesLive,
  getInstantLocalPlaceSuggestions,
  fetchUberStyleRoute,
  LivePlaceSuggestion,
  UberStyleRouteResult,
  DIVISION_COORDINATES,
  Coordinates,
  DEFAULT_BANGLADESH_COORDS,
} from '../../utils/geolocation';
import {
  isPhoneMaskedOrInvalid,
  buildDirectCallHref,
} from '../../utils/donorMatcher';
import { copyTextReliable } from '../../utils/sosAlertEngine';
import {
  MapPin,
  Hospital,
  Navigation,
  Phone,
  ExternalLink,
  Search,
  Compass,
  MessageCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  List,
  Map as MapIcon,
  LocateFixed,
  Layers,
  Globe2,
  Copy,
  Check,
  Lock,
  Crosshair,
  Clock,
  Heart,
  CheckCircle,
  XCircle,
  ShieldCheck,
  X,
} from 'lucide-react';

interface InteractiveMapViewProps {
  lang: Language;
  donors?: Donor[];
  requests?: BloodRequest[];
  liveTrips?: LiveDonorTrip[];
  focusedTripId?: string | null;
  onClearFocusedTrip?: () => void;
  onUpdateLiveTripStatus?: (tripId: string, status: LiveDonorTripStatus) => Promise<void> | void;
  initialFocusId?: string | null;
  onClearInitialFocus?: () => void;
  onRevealPhone?: (donor: Donor) => void;
  onOpenSOSWizard: (context?: {
    bloodGroup?: BloodGroup;
    district?: string;
    hospitalName?: string;
  }) => void;
  onStartChatWithDonor?: (donorName: string, bloodGroup: BloodGroup, phone?: string) => void;
}

export interface MapLocation {
  id: string;
  name: string;
  shortLabel: string;
  type: 'DONOR' | 'SOS' | 'HOSPITAL';
  bloodGroup: BloodGroup;
  donorName?: string;
  sourceDonor?: Donor;
  division: string;
  district: string;
  districtId: string;
  phone: string;
  canDirectCall: boolean;
  units?: number;
  available: boolean;
  lat: number;
  lng: number;
  aliases?: string[];
}

interface ComputedMapLocation extends MapLocation {
  distanceKm: number;
  computedDistance: string;
}

type TileLayerStyle = 'osm' | 'hot' | 'dark';

const TILE_LAYER_CONFIGS: Record<
  TileLayerStyle,
  {
    url: string;
    subdomains: string;
    fallbackUrl: string;
    fallbackSubdomains: string;
    attribution: string;
    labelBn: string;
    labelEn: string;
  }
> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: '',
    fallbackUrl: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    fallbackSubdomains: 'abc',
    attribution: '&copy; OpenStreetMap contributors',
    labelBn: 'ওপেনস্ট্রিট ম্যাপ',
    labelEn: 'OpenStreetMap',
  },
  hot: {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: 'abc',
    fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    fallbackSubdomains: '',
    attribution: '&copy; OpenStreetMap &copy; HOT',
    labelBn: 'হাসপাতাল ভিউ',
    labelEn: 'Medical Street',
  },
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: '',
    fallbackUrl: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    fallbackSubdomains: 'abc',
    attribution: '&copy; OpenStreetMap contributors',
    labelBn: 'ডার্ক ম্যাপ',
    labelEn: 'Dark Map',
  },
};

// Verified Government & Major 24/7 Private Hospital Blood Banks across Bangladesh
export const VERIFIED_HOSPITAL_LOCATIONS: MapLocation[] = POPULAR_BD_HOSPITALS.map((h) => ({
  id: h.id,
  name: `${h.nameBn}`,
  shortLabel: h.shortLabel,
  type: 'HOSPITAL',
  bloodGroup: 'O+',
  division: h.divisionId,
  district: h.areaBn,
  districtId: h.districtId,
  phone: h.phone,
  canDirectCall: true,
  available: true,
  lat: h.coords.latitude,
  lng: h.coords.longitude,
  aliases: [h.nameEn.toLowerCase(), h.areaEn.toLowerCase(), ...h.aliases],
}));

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isMapDonorAdmin(loc: { type: string; sourceDonor?: Donor }): boolean {
  if (loc.type !== 'DONOR' || !loc.sourceDonor) return false;
  return (
    loc.sourceDonor.panelType === 'ADMIN' ||
    Boolean(
      loc.sourceDonor.hospitalAffiliation?.includes('অ্যাডমিন') ||
        loc.sourceDonor.hospitalAffiliation?.toLowerCase().includes('admin')
    )
  );
}

function createPinDivIcon(loc: ComputedMapLocation, isSelected: boolean): L.DivIcon {
  const safeLabel = escapeHtml(loc.type === 'HOSPITAL' ? loc.shortLabel : loc.bloodGroup);
  const adminDonor = isMapDonorAdmin(loc);
  const bgClass = isSelected
    ? 'bg-rose-600 ring-2 ring-white shadow-lg scale-110'
    : loc.type === 'SOS'
      ? 'bg-red-600 ring-2 ring-white/90 shadow-md'
      : loc.type === 'DONOR'
        ? adminDonor
          ? 'bg-indigo-600 ring-2 ring-amber-300 shadow-md'
          : 'bg-emerald-600 ring-2 ring-white/90 shadow-md'
        : 'bg-sky-700 ring-2 ring-white/90 shadow-md';

  const textSize = loc.type === 'HOSPITAL' ? 'text-[10px]' : 'text-[11px]';

  return L.divIcon({
    className: 'bsbd-leaflet-pin',
    iconSize: [58, 32],
    iconAnchor: [29, 16],
    html: `
      <div class="w-[58px] h-[32px] flex items-center justify-center select-none">
        <div class="px-2 h-7 min-w-[36px] rounded-lg text-white font-extrabold tracking-tight ${textSize} flex items-center justify-center whitespace-nowrap transition-transform ${bgClass}">
          ${safeLabel}
        </div>
      </div>
    `,
  });
}

function createPatientOriginIcon(isGpsLive: boolean): L.DivIcon {
  const dotColor = isGpsLive ? 'bg-sky-600 ring-sky-500/30' : 'bg-slate-900 ring-rose-500/30';
  return L.divIcon({
    className: 'bsbd-leaflet-pin',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div class="w-[34px] h-[34px] flex items-center justify-center select-none">
        <span class="w-5 h-5 rounded-full ${dotColor} border-[3px] border-white shadow-lg ring-4 flex items-center justify-center">
          <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
        </span>
      </div>
    `,
  });
}

function createLiveDonorRiderIcon(bloodGroup: BloodGroup, arrived: boolean): L.DivIcon {
  const safeBg = escapeHtml(bloodGroup);
  const tone = arrived ? 'bg-emerald-700 ring-white' : 'bg-emerald-600 ring-white';
  return L.divIcon({
    className: 'bsbd-leaflet-pin',
    iconSize: [74, 36],
    iconAnchor: [37, 18],
    html: `
      <div class="w-[74px] h-[36px] flex items-center justify-center select-none">
        <div class="px-2.5 h-8 rounded-xl text-white font-black text-[11px] flex items-center gap-1 whitespace-nowrap ring-2 shadow-lg ${tone}">
          <span>${safeBg}</span>
          <span>${arrived ? '✓' : '→'}</span>
        </div>
      </div>
    `,
  });
}

function createHospitalDestIcon(): L.DivIcon {
  return L.divIcon({
    className: 'bsbd-leaflet-pin',
    iconSize: [68, 34],
    iconAnchor: [34, 17],
    html: `
      <div class="w-[68px] h-[34px] flex items-center justify-center select-none">
        <div class="px-2.5 h-7 rounded-xl bg-rose-600 text-white font-extrabold text-[10px] flex items-center justify-center whitespace-nowrap ring-2 ring-white shadow-lg">
          Hospital
        </div>
      </div>
    `,
  });
}

export const InteractiveMapView: React.FC<InteractiveMapViewProps> = ({
  lang,
  donors = [],
  requests = [],
  liveTrips = [],
  focusedTripId,
  onClearFocusedTrip,
  onUpdateLiveTripStatus,
  initialFocusId,
  onClearInitialFocus,
  onRevealPhone,
  onOpenSOSWizard,
  onStartChatWithDonor,
}) => {
  // Uber / Pathao-style Origin State (Live GPS OR Custom Pin-Drop / Searched Hospital)
  const [originCoords, setOriginCoords] = useState<Coordinates>(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_current_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.district || parsed?.upazila) {
          return resolveBangladeshCoordinates({
            district: parsed.district,
            upazila: parsed.upazila,
          });
        }
      }
    } catch {}
    return DEFAULT_BANGLADESH_COORDS;
  });
  const [originMode, setOriginMode] = useState<'GPS' | 'CUSTOM_PIN'>('CUSTOM_PIN');
  const [originLabel, setOriginLabel] = useState<string>('');
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [pinDropActive, setPinDropActive] = useState<boolean>(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Place / Pickup Search Autocomplete State
  const [pickupQuery, setPickupQuery] = useState<string>('');
  const [pickupSuggestions, setPickupSuggestions] = useState<LivePlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);

  // Selected Destination Pin & Live Route State
  const [selectedLocId, setSelectedLocId] = useState<string>(initialFocusId || '');
  const [activeRoute, setActiveRoute] = useState<UberStyleRouteResult | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string>(focusedTripId || '');
  const [liveTripRoute, setLiveTripRoute] = useState<UberStyleRouteResult | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'DONOR' | 'SOS' | 'HOSPITAL'>('ALL');
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('ALL');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [tileStyle, setTileStyle] = useState<TileLayerStyle>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'osm'
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const liveTripLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const originMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  const pinDropActiveRef = useRef<boolean>(false);
  const hasUserMovedOriginRef = useRef<boolean>(false);
  const autoCenteredClusterRef = useRef<boolean>(false);
  pinDropActiveRef.current = pinDropActive;

  const activeLiveTrips = useMemo(
    () =>
      liveTrips.filter(
        (t) => t.tripStatus === 'ON_THE_WAY' || t.tripStatus === 'ARRIVED'
      ),
    [liveTrips]
  );

  const activeTrip: LiveDonorTrip | null = useMemo(() => {
    if (!selectedTripId) return null;
    return activeLiveTrips.find((t) => t.id === selectedTripId) || null;
  }, [activeLiveTrips, selectedTripId]);

  useEffect(() => {
    if (focusedTripId) {
      setSelectedTripId(focusedTripId);
      setViewMode('map');
      onClearFocusedTrip?.();
    }
  }, [focusedTripId, onClearFocusedTrip]);

  useEffect(() => {
    if (!selectedTripId && activeLiveTrips.length > 0 && !initialFocusId) {
      setSelectedTripId(activeLiveTrips[0].id);
    } else if (
      selectedTripId &&
      !activeLiveTrips.some((t) => t.id === selectedTripId)
    ) {
      setSelectedTripId('');
    }
  }, [activeLiveTrips, selectedTripId, initialFocusId]);

  useEffect(() => {
    if (!activeTrip) {
      setLiveTripRoute(null);
      return;
    }
    const donorPos: Coordinates = { latitude: activeTrip.lat, longitude: activeTrip.lng };
    const hospPos: Coordinates = {
      latitude: activeTrip.hospitalLat,
      longitude: activeTrip.hospitalLng,
    };
    const controller = new AbortController();
    fetchUberStyleRoute(donorPos, hospPos, controller.signal).then((route) => {
      if (!controller.signal.aborted) {
        setLiveTripRoute(route);
      }
    });
    return () => controller.abort();
  }, [
    activeTrip?.id,
    activeTrip?.lat,
    activeTrip?.lng,
    activeTrip?.hospitalLat,
    activeTrip?.hospitalLng,
  ]);

  // 1. Check cached real GPS if already granted + smartly center on user's area or first real SOS/Donor cluster when GPS is off
  useEffect(() => {
    let mounted = true;
    requestRealDeviceGPSWithStatus().then(({ coords, isRealGps }) => {
      if (!mounted || hasUserMovedOriginRef.current) return;
      if (isRealGps) {
        setOriginCoords(coords);
        setIsGpsActive(true);
        setOriginMode('GPS');
        const near = findNearestDistrictFromCoords(coords);
        setOriginLabel(
          lang === 'bn'
            ? `লাইভ GPS (${near.nameBn})`
            : `Live GPS (${near.nameEn})`
        );
        reverseGeocodeBangladeshCoords(coords, lang)
          .then((geo) => {
            if (!mounted) return;
            setOriginLabel(
              lang === 'bn'
                ? `লাইভ GPS (${geo.areaText})`
                : `Live GPS (${geo.areaText})`
            );
          })
          .catch(() => {});
        if (!initialFocusId && mapInstanceRef.current) {
          mapInstanceRef.current.setView([coords.latitude, coords.longitude], 13);
        }
      }
    });

    const stopWatch = watchRealDeviceGPS(
      (liveCoords) => {
        if (!mounted) return;
        setOriginMode((currMode) => {
          if (currMode === 'GPS') {
            setIsGpsActive(true);
            setOriginCoords(liveCoords);
            const near = findNearestDistrictFromCoords(liveCoords);
            setOriginLabel(
              lang === 'bn'
                ? `লাইভ GPS (${near.nameBn})`
                : `Live GPS (${near.nameEn})`
            );
          }
          return currMode;
        });
      },
      undefined,
      { onlyIfGranted: true }
    );

    return () => {
      mounted = false;
      stopWatch();
    };
  }, [initialFocusId, lang]);

  // Smart cluster auto-focus when GPS is off and real donors/SOS load from Firestore
  useEffect(() => {
    if (
      autoCenteredClusterRef.current ||
      hasUserMovedOriginRef.current ||
      isGpsActive ||
      initialFocusId
    ) {
      return;
    }

    const activeSos = requests.find((r) => !isSeedRequestId(r.id) && r.status === 'ACTIVE');
    const activeDonor = donors.find((d) => !isSeedDonorId(d.id) && d.available);

    let smartAnchor: Coordinates | null = null;
    let smartLabel = '';

    if (activeSos) {
      smartAnchor = resolveBangladeshCoordinates({
        district: activeSos.district,
        upazila: activeSos.upazila,
        division: activeSos.division,
        hospital: activeSos.hospitalName,
      });
      smartLabel = activeSos.hospitalName;
    } else if (activeDonor) {
      smartAnchor = resolveBangladeshCoordinates({
        district: activeDonor.district,
        upazila: activeDonor.upazila,
        division: activeDonor.division,
      });
      smartLabel = activeDonor.upazila
        ? `${activeDonor.upazila}, ${activeDonor.district}`
        : activeDonor.district;
    }

    if (smartAnchor) {
      autoCenteredClusterRef.current = true;
      setOriginCoords(smartAnchor);
      if (smartLabel) {
        setOriginLabel(smartLabel);
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([smartAnchor.latitude, smartAnchor.longitude], 13);
      }
    }
  }, [donors, requests, isGpsActive, initialFocusId]);

  // 2. Live Bangladesh Hospital + Street Autocomplete (Instant Local + OSM Nominatim)
  useEffect(() => {
    if (!showSuggestions) return;
    const instant = getInstantLocalPlaceSuggestions(pickupQuery, lang);
    setPickupSuggestions(instant);

    if (pickupQuery.trim().length < 3) {
      setIsSearchingPlaces(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingPlaces(true);
    const timer = window.setTimeout(() => {
      searchBangladeshPlacesLive(pickupQuery, lang, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setPickupSuggestions(results);
            setIsSearchingPlaces(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setIsSearchingPlaces(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickupQuery, showSuggestions, lang]);

  // 3. Compute all Donors, SOS Requests & Verified Hospitals sorted by live distance from Origin Pin
  const computedLocations = useMemo<ComputedMapLocation[]>(() => {
    const realDynamicPins: MapLocation[] = [];

    requests
      .filter((r) => !isSeedRequestId(r.id) && r.status === 'ACTIVE')
      .forEach((r) => {
        const divKey = (r.division || 'dhaka').toLowerCase();
        const coords = resolveBangladeshCoordinates({
          district: r.district,
          upazila: r.upazila,
          division: divKey,
          hospital: r.hospitalName,
          seedKey: `sos-${r.id}`,
        });
        const cleanCallable = !isPhoneMaskedOrInvalid(r.contactPhone);
        realDynamicPins.push({
          id: `real-map-sos-${r.id}`,
          name: r.hospitalName,
          shortLabel: r.bloodGroup,
          type: 'SOS',
          bloodGroup: r.bloodGroup,
          units: Math.max(1, r.unitsNeeded - r.unitsCollected),
          division: divKey,
          district: r.upazila ? `${r.upazila}, ${r.district}` : r.district,
          districtId: r.district,
          phone: cleanCallable ? r.contactPhone : '',
          canDirectCall: cleanCallable,
          available: true,
          lat: coords.latitude,
          lng: coords.longitude,
        });
      });

    donors
      .filter((d) => !isSeedDonorId(d.id) && d.available)
      .forEach((d) => {
        const divKey = (d.division || 'dhaka').toLowerCase();
        const coords = resolveBangladeshCoordinates({
          district: d.district,
          upazila: d.upazila,
          division: divKey,
          seedKey: `donor-${d.id}`,
        });
        const canDirect =
          d.shareDirectContact !== false &&
          d.allowCall !== false &&
          !isPhoneMaskedOrInvalid(d.phone);
        realDynamicPins.push({
          id: `real-map-donor-${d.id}`,
          name: `${d.name} (${lang === 'bn' ? 'প্রস্তুত ডোনার' : 'Ready Donor'})`,
          shortLabel: d.bloodGroup,
          donorName: d.name,
          sourceDonor: d,
          type: 'DONOR',
          bloodGroup: d.bloodGroup,
          division: divKey,
          district: d.upazila ? `${d.upazila}, ${d.district}` : d.district,
          districtId: d.district,
          phone: canDirect ? d.phone : '',
          canDirectCall: canDirect,
          available: d.available,
          lat: coords.latitude,
          lng: coords.longitude,
        });
      });

    const activePeoplePins = evictSeedsProgressively(realDynamicPins, []);
    const merged = [...activePeoplePins, ...VERIFIED_HOSPITAL_LOCATIONS];

    return merged
      .map((loc) => {
        const km = calculateHaversineDistance(originCoords, {
          latitude: loc.lat,
          longitude: loc.lng,
        });
        return {
          ...loc,
          distanceKm: km,
          computedDistance: formatDistance(km, lang),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [originCoords, lang, donors, requests]);

  const filteredLocations = useMemo(() => {
    return computedLocations.filter((l) => {
      if (filterType !== 'ALL' && l.type !== filterType) return false;
      if (
        selectedBloodGroup !== 'ALL' &&
        l.type !== 'HOSPITAL' &&
        l.bloodGroup !== selectedBloodGroup
      ) {
        return false;
      }
      if (selectedDivision !== 'ALL' && l.division !== selectedDivision) return false;
      return true;
    });
  }, [computedLocations, filterType, selectedBloodGroup, selectedDivision]);

  // Prefer nearest Ready Donor first if available, otherwise nearest Hospital/SOS
  const selectedLoc: ComputedMapLocation | null = useMemo(() => {
    if (selectedLocId) {
      const explicit = filteredLocations.find((l) => l.id === selectedLocId);
      if (explicit) return explicit;
    }
    const nearestDonor = filteredLocations.find((l) => l.type === 'DONOR');
    return nearestDonor || filteredLocations[0] || computedLocations[0] || null;
  }, [filteredLocations, computedLocations, selectedLocId]);

  // 4. Calculate Live Uber / Pathao Driving Route & ETA between Origin Pin & Selected Target
  useEffect(() => {
    if (!selectedLoc) {
      setActiveRoute(null);
      return;
    }
    const destCoords: Coordinates = { latitude: selectedLoc.lat, longitude: selectedLoc.lng };
    const dist = calculateHaversineDistance(originCoords, destCoords);
    // Avoid drawing noisy line if selected hospital IS the exact origin pin (< 80 meters)
    if (dist < 0.08) {
      setActiveRoute({
        points: [],
        roadDistanceKm: 0.1,
        etaMinutes: 2,
        isRealRoadGeometry: false,
      });
      return;
    }

    const controller = new AbortController();
    fetchUberStyleRoute(originCoords, destCoords, controller.signal).then((route) => {
      if (!controller.signal.aborted) {
        setActiveRoute(route);
      }
    });

    return () => controller.abort();
  }, [originCoords.latitude, originCoords.longitude, selectedLoc?.id, selectedLoc?.lat, selectedLoc?.lng]);

  const attachResilientTileLayer = (map: L.Map, style: TileLayerStyle): L.TileLayer => {
    const cfg = TILE_LAYER_CONFIGS[style];
    let errorCount = 0;
    let switchedToFallback = false;

    const layer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: cfg.subdomains,
      maxZoom: 19,
    });

    layer.on('tileerror', () => {
      errorCount += 1;
      if (!switchedToFallback && errorCount >= 4 && mapInstanceRef.current === map) {
        switchedToFallback = true;
        map.removeLayer(layer);
        const backup = L.tileLayer(cfg.fallbackUrl, {
          attribution: cfg.attribution,
          subdomains: cfg.fallbackSubdomains,
          maxZoom: 19,
        }).addTo(map);
        tileLayerRef.current = backup;
      }
    });

    layer.addTo(map);
    return layer;
  };

  // 5. Initialize Leaflet Map + Click-to-Set-Pickup-Pin handler
  useEffect(() => {
    if (viewMode !== 'map' || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const bangladeshBounds = L.latLngBounds(
      L.latLng(20.35, 87.8),
      L.latLng(26.85, 92.95)
    );

    const map = L.map(mapContainerRef.current, {
      center: [originCoords.latitude, originCoords.longitude],
      zoom: 13,
      minZoom: 6,
      maxZoom: 18,
      zoomControl: false,
      maxBounds: bangladeshBounds.pad(0.25),
      maxBoundsViscosity: 0.7,
    });

    const baseTiles = attachResilientTileLayer(map, tileStyle);
    const routeGroup = L.layerGroup().addTo(map);
    const liveTripGroup = L.layerGroup().addTo(map);
    const markersGroup = L.layerGroup().addTo(map);
    const originGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = baseTiles;
    routeLayerRef.current = routeGroup;
    liveTripLayerRef.current = liveTripGroup;
    markersLayerRef.current = markersGroup;
    originMarkerLayerRef.current = originGroup;

    // Uber / Pathao Tap-on-Map to drop custom Patient / Hospital Pin!
    map.on('click', (evt: L.LeafletMouseEvent) => {
      if (!pinDropActiveRef.current) return;
      hasUserMovedOriginRef.current = true;
      const clicked: Coordinates = {
        latitude: Number(evt.latlng.lat.toFixed(5)),
        longitude: Number(evt.latlng.lng.toFixed(5)),
      };
      const near = findNearestDistrictFromCoords(clicked);
      setOriginCoords(clicked);
      setOriginMode('CUSTOM_PIN');
      setOriginLabel(
        lang === 'bn'
          ? `ম্যাপ পিন (${near.nameBn})`
          : `Pinned Spot (${near.nameEn})`
      );
      setPickupQuery(
        lang === 'bn'
          ? `ম্যাপে নির্বাচিত পিন (${near.nameBn})`
          : `Pinned Location (${near.nameEn})`
      );
      setPinDropActive(false);
      setGpsNotice(null);
      reverseGeocodeBangladeshCoords(clicked, lang)
        .then((geo) => {
          const full = `${geo.areaText}, ${geo.districtName}`;
          setOriginLabel(full);
          setPickupQuery(full);
        })
        .catch(() => {});
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    const timer1 = window.setTimeout(() => map.invalidateSize(), 100);
    const timer2 = window.setTimeout(() => map.invalidateSize(), 400);

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      routeLayerRef.current = null;
      liveTripLayerRef.current = null;
      markersLayerRef.current = null;
      originMarkerLayerRef.current = null;
    };
  }, [viewMode]);

  // Focus pin requested from Home Map Preview if provided
  useEffect(() => {
    if (!initialFocusId) return;
    const match = computedLocations.find((l) => l.id === initialFocusId);
    if (match) {
      setSelectedLocId(match.id);
      setViewMode('map');
      const timer = window.setTimeout(() => {
        mapInstanceRef.current?.flyTo([match.lat, match.lng], 14, { duration: 0.75 });
        onClearInitialFocus?.();
      }, 180);
      return () => window.clearTimeout(timer);
    }
    onClearInitialFocus?.();
  }, [initialFocusId, computedLocations, onClearInitialFocus]);

  // Swap tile layer seamlessly when user changes Clean Street / OSM / Dark style
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = attachResilientTileLayer(map, tileStyle);
  }, [tileStyle]);

  // Render Origin Pin (Live GPS Blue Dot OR Custom Patient/Hospital Pickup Pin)
  useEffect(() => {
    const originGroup = originMarkerLayerRef.current;
    if (!originGroup) return;
    originGroup.clearLayers();

    const showingLiveGps = originMode === 'GPS' && isGpsActive;
    const showingCustomPin = originMode === 'CUSTOM_PIN';

    if (showingLiveGps || showingCustomPin) {
      L.circle([originCoords.latitude, originCoords.longitude], {
        radius: showingLiveGps ? 480 : 350,
        color: showingLiveGps ? '#0284c7' : '#e11d48',
        fillColor: showingLiveGps ? '#38bdf8' : '#fb7185',
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(originGroup);

      const meMarker = L.marker([originCoords.latitude, originCoords.longitude], {
        icon: createPatientOriginIcon(showingLiveGps),
        draggable: true,
        zIndexOffset: 950,
      });

      meMarker.bindTooltip(
        escapeHtml(
          originLabel ||
            (showingLiveGps
              ? lang === 'bn'
                ? 'আপনার লাইভ জিপিএস লোকেশন (ড্র্যাগ করে সরানো যাবে)'
                : 'Your Live GPS (Drag to adjust)'
              : lang === 'bn'
                ? 'রোগী / হাসপাতালের পিন (ড্র্যাগ করে সরানো যাবে)'
                : 'Patient / Hospital Pin (Drag to move)')
        ),
        { direction: 'top', offset: [0, -12] }
      );

      meMarker.on('dragend', () => {
        const pos = meMarker.getLatLng();
        const moved: Coordinates = {
          latitude: Number(pos.lat.toFixed(5)),
          longitude: Number(pos.lng.toFixed(5)),
        };
        const near = findNearestDistrictFromCoords(moved);
        setOriginCoords(moved);
        setOriginMode('CUSTOM_PIN');
        setOriginLabel(
          lang === 'bn'
            ? `কাস্টম পিন (${near.nameBn})`
            : `Custom Pin (${near.nameEn})`
        );
      });

      meMarker.addTo(originGroup);
    }
  }, [originCoords, originMode, isGpsActive, originLabel, viewMode, lang]);

  // Render Uber / Pathao Route Polyline on Map
  useEffect(() => {
    const routeGroup = routeLayerRef.current;
    if (!routeGroup) return;
    routeGroup.clearLayers();

    if (!activeRoute || activeRoute.points.length < 2 || activeTrip) return;

    // Outer dark road casing
    L.polyline(activeRoute.points, {
      color: '#0f172a',
      weight: 6,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeGroup);

    // Inner Uber/Pathao vibrant route line
    L.polyline(activeRoute.points, {
      color: '#e11d48',
      weight: 3.5,
      opacity: 0.92,
      dashArray: activeRoute.isRealRoadGeometry ? undefined : '7, 7',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeGroup);
  }, [activeRoute, activeTrip, viewMode]);

  // Render Live Donor On-the-Way Road Polyline & Rider/Hospital Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const tripLayer = liveTripLayerRef.current;
    if (!map || !tripLayer) return;
    tripLayer.clearLayers();

    if (!activeTrip) return;

    if (liveTripRoute && liveTripRoute.points.length >= 2) {
      L.polyline(liveTripRoute.points, {
        color: '#064e3b',
        weight: 7,
        opacity: 0.4,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(tripLayer);

      L.polyline(liveTripRoute.points, {
        color: '#10b981',
        weight: 4.5,
        opacity: 0.96,
        dashArray: liveTripRoute.isRealRoadGeometry ? undefined : '8, 6',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(tripLayer);
    }

    const riderMarker = L.marker([activeTrip.lat, activeTrip.lng], {
      icon: createLiveDonorRiderIcon(
        activeTrip.bloodGroup,
        activeTrip.tripStatus === 'ARRIVED'
      ),
      zIndexOffset: 1400,
    });
    riderMarker.bindTooltip(
      escapeHtml(`${activeTrip.donorName} · ${activeTrip.areaLabel}`),
      { direction: 'top', offset: [0, -14] }
    );
    riderMarker.addTo(tripLayer);

    const hospMarker = L.marker([activeTrip.hospitalLat, activeTrip.hospitalLng], {
      icon: createHospitalDestIcon(),
      zIndexOffset: 1350,
    });
    hospMarker.bindTooltip(escapeHtml(activeTrip.hospitalName), {
      direction: 'top',
      offset: [0, -14],
    });
    hospMarker.addTo(tripLayer);

    const bounds = L.latLngBounds(
      [activeTrip.lat, activeTrip.lng],
      [activeTrip.hospitalLat, activeTrip.hospitalLng]
    );
    const dist = calculateHaversineDistance(
      { latitude: activeTrip.lat, longitude: activeTrip.lng },
      { latitude: activeTrip.hospitalLat, longitude: activeTrip.hospitalLng }
    );
    if (dist > 0.08 && dist < 80) {
      map.flyToBounds(bounds.pad(0.35), { maxZoom: 15, duration: 0.7 });
    } else {
      map.flyTo([activeTrip.lat, activeTrip.lng], 14, { duration: 0.7 });
    }
  }, [activeTrip, liveTripRoute, viewMode]);

  // Render all Donor, SOS & Hospital markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    filteredLocations.forEach((loc) => {
      const isSelected = loc.id === selectedLoc?.id;
      const marker = L.marker([loc.lat, loc.lng], {
        icon: createPinDivIcon(loc, isSelected),
        zIndexOffset: isSelected ? 1000 : loc.type === 'SOS' ? 600 : loc.type === 'DONOR' ? 450 : 200,
      });

      marker.bindTooltip(escapeHtml(`${loc.name} (${loc.computedDistance})`), {
        direction: 'top',
        offset: [0, -14],
      });

      marker.on('click', () => {
        setSelectedLocId(loc.id);
        const bounds = L.latLngBounds(
          [originCoords.latitude, originCoords.longitude],
          [loc.lat, loc.lng]
        );
        if (calculateHaversineDistance(originCoords, { latitude: loc.lat, longitude: loc.lng }) < 35) {
          map.flyToBounds(bounds.pad(0.32), { maxZoom: 15, duration: 0.65 });
        } else {
          map.flyTo([loc.lat, loc.lng], 13, { duration: 0.65 });
        }
      });

      marker.addTo(markersGroup);
    });
  }, [filteredLocations, selectedLoc?.id, originCoords.latitude, originCoords.longitude, viewMode]);

  const handleSelectSuggestion = (item: LivePlaceSuggestion) => {
    hasUserMovedOriginRef.current = true;
    setOriginCoords(item.coords);
    setOriginMode('CUSTOM_PIN');
    setIsGpsActive(false);
    setOriginLabel(item.title);
    setPickupQuery(item.title);
    setShowSuggestions(false);
    setPinDropActive(false);
    setGpsNotice(null);

    if (item.kind === 'HOSPITAL') {
      setSelectedLocId('');
    }
    if (viewMode !== 'map') setViewMode('map');
    window.setTimeout(() => {
      mapInstanceRef.current?.flyTo([item.coords.latitude, item.coords.longitude], 14, {
        duration: 0.75,
      });
    }, 80);
  };

  const handleSubmitPickupQuery = () => {
    const trimmed = pickupQuery.trim();
    if (!trimmed) return;
    if (pickupSuggestions.length > 0) {
      handleSelectSuggestion(pickupSuggestions[0]);
      return;
    }
    const instant = getInstantLocalPlaceSuggestions(trimmed, lang);
    if (instant.length > 0) {
      handleSelectSuggestion(instant[0]);
      return;
    }
    const resolved = resolvePlaceOrHospitalQuery(trimmed);
    if (resolved) {
      hasUserMovedOriginRef.current = true;
      setOriginCoords(resolved.coords);
      setOriginMode('CUSTOM_PIN');
      setIsGpsActive(false);
      const label = lang === 'bn' ? resolved.labelBn : resolved.labelEn;
      setOriginLabel(label);
      setShowSuggestions(false);
      setPinDropActive(false);
      setGpsNotice(null);
      if (viewMode !== 'map') setViewMode('map');
      window.setTimeout(() => {
        mapInstanceRef.current?.flyTo([resolved.coords.latitude, resolved.coords.longitude], 14, {
          duration: 0.75,
        });
      }, 80);
    }
  };

  const handleFitAllPins = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const priorityPeople = filteredLocations.filter(
      (l) => l.type === 'DONOR' || l.type === 'SOS'
    );
    const targets =
      priorityPeople.length > 0
        ? priorityPeople.slice(0, 12)
        : filteredLocations.slice(0, 10);
    if (targets.length === 0) return;

    if (targets.length === 1) {
      map.flyTo([targets[0].lat, targets[0].lng], 14, { duration: 0.75 });
      return;
    }

    const bounds = L.latLngBounds(targets.map((t) => [t.lat, t.lng] as [number, number]));
    bounds.extend([originCoords.latitude, originCoords.longitude]);
    map.flyToBounds(bounds.pad(0.24), { maxZoom: 14, duration: 0.8 });
  };

  const handleDivisionChange = (divId: string) => {
    hasUserMovedOriginRef.current = true;
    setSelectedDivision(divId);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (divId === 'ALL') {
      map.flyTo([23.75, 90.35], 7, { duration: 0.85 });
    } else {
      const target = DIVISION_COORDINATES[divId];
      if (target) {
        setOriginCoords({ latitude: target.latitude, longitude: target.longitude });
        setOriginMode('CUSTOM_PIN');
        setIsGpsActive(false);
        setOriginLabel(divId.toUpperCase());
        map.flyTo([target.latitude, target.longitude], divId === 'dhaka' ? 12 : target.zoom + 1, {
          duration: 0.85,
        });
      }
    }
  };

  const handleLocateMe = async () => {
    if (originMode === 'GPS' && isGpsActive) {
      clearCachedDeviceGps();
      setIsGpsActive(false);
      setOriginMode('CUSTOM_PIN');
      setGpsNotice(
        lang === 'bn'
          ? 'লাইভ GPS বন্ধ করা হয়েছে — উপরে হাসপাতাল/এলাকা লিখে বা ম্যাপে পিন বসিয়ে খুঁজুন।'
          : 'Live GPS turned off — search a hospital/area above or drop a pin on the map.'
      );
      return;
    }

    setIsLocatingGps(true);
    setGpsNotice(null);
    setPinDropActive(false);
    try {
      const res = await requestFreshHighAccuracyGPS();
      if (viewMode !== 'map') {
        setViewMode('map');
      }
      if (res.isRealGps) {
        hasUserMovedOriginRef.current = true;
        const near = findNearestDistrictFromCoords(res.coords);
        setOriginCoords(res.coords);
        setIsGpsActive(true);
        setOriginMode('GPS');
        const label =
          lang === 'bn' ? `লাইভ GPS (${near.nameBn})` : `Live GPS (${near.nameEn})`;
        setOriginLabel(label);
        setPickupQuery('');
        reverseGeocodeBangladeshCoords(res.coords, lang)
          .then((geo) => {
            setOriginLabel(
              lang === 'bn'
                ? `লাইভ GPS (${geo.areaText})`
                : `Live GPS (${geo.areaText})`
            );
          })
          .catch(() => {});
        window.setTimeout(() => {
          mapInstanceRef.current?.flyTo([res.coords.latitude, res.coords.longitude], 14, {
            duration: 0.85,
          });
        }, 80);
      } else {
        setIsGpsActive(false);
        setPinDropActive(true);
        setGpsNotice(
          res.errorReason === 'PERMISSION_DENIED'
            ? lang === 'bn'
              ? 'ব্রাউজারে লোকেশন (Location) অনুমতি ব্লক করা আছে। পিন মোড চালু হয়েছে — ম্যাপের যেকোনো জায়গায় ট্যাপ করে বা উপরে হাসপাতালের নাম লিখে লোকেশন সেট করুন!'
              : 'Browser location permission is blocked. Pin-Drop mode is now active — tap anywhere on the map or type your hospital above!'
            : lang === 'bn'
              ? 'ডিভাইসের জিপিএস সিগন্যাল পাওয়া যায়নি। ম্যাপের যেকোনো রাস্তায় ট্যাপ করে বা উপরে হাসপাতালের নাম লিখে পিন বসান!'
              : 'Device GPS signal unavailable indoors. Tap anywhere on the map or search your hospital above to drop your pin!'
        );
      }
    } finally {
      setIsLocatingGps(false);
    }
  };

  const handleSelectCarouselItem = (loc: ComputedMapLocation) => {
    setSelectedLocId(loc.id);
    if (viewMode !== 'map') {
      setViewMode('map');
    }
    window.setTimeout(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const dist = calculateHaversineDistance(originCoords, {
        latitude: loc.lat,
        longitude: loc.lng,
      });
      if (dist > 0.1 && dist < 35) {
        const bounds = L.latLngBounds(
          [originCoords.latitude, originCoords.longitude],
          [loc.lat, loc.lng]
        );
        map.flyToBounds(bounds.pad(0.32), { maxZoom: 15, duration: 0.65 });
      } else {
        map.flyTo([loc.lat, loc.lng], 14, { duration: 0.65 });
      }
    }, 60);
  };

  const cycleTileStyle = () => {
    setTileStyle((prev) => (prev === 'osm' ? 'hot' : prev === 'hot' ? 'dark' : 'osm'));
  };

  const handleCopyPhone = async (id: string, phone: string) => {
    const ok = await copyTextReliable(phone);
    if (ok) {
      setCopiedPhoneId(id);
      window.setTimeout(() => setCopiedPhoneId(null), 2000);
    }
  };

  const activeOriginNearestDistrict = useMemo(
    () => findNearestDistrictFromCoords(originCoords),
    [originCoords]
  );

  return (
    <div className="space-y-3.5 text-left pb-10">
      {/* 1. UBER / PATHAO-STYLE PICKUP & HOSPITAL LOCATION BAR */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl btn-teal flex items-center justify-center font-bold shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                {lang === 'bn'
                  ? 'লাইভ ডোনার ও হাসপাতাল রুট ম্যাপ'
                  : 'Live Donor & Hospital Route Map'}
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block truncate">
                {originMode === 'GPS' && isGpsActive
                  ? lang === 'bn'
                    ? `${originLabel} · নিকটস্থ ডোনার ও ব্লাড ব্যাংকের রুট দেখুন`
                    : `${originLabel} · Showing live routes to nearest donors`
                  : originMode === 'CUSTOM_PIN' && originLabel
                    ? lang === 'bn'
                      ? `কেন্দ্র: ${originLabel} (ম্যাপে পিন টেনে সরানো যাবে)`
                      : `Centered at: ${originLabel} (Drag pin on map to adjust)`
                    : lang === 'bn'
                      ? 'হাসপাতাল সার্চ করুন, লাইভ GPS দিন অথবা ম্যাপে ট্যাপ করে পিন বসান'
                      : 'Search hospital, tap Live GPS, or tap on map to drop your pin'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={isLocatingGps}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                originMode === 'GPS' && isGpsActive ? 'btn-emerald' : 'btn-sky'
              }`}
            >
              <LocateFixed className={`w-3.5 h-3.5 shrink-0 ${isLocatingGps ? 'animate-spin' : ''}`} />
              <span>
                {isLocatingGps
                  ? lang === 'bn'
                    ? 'খোঁজা হচ্ছে...'
                    : 'Locating...'
                  : originMode === 'GPS' && isGpsActive
                    ? lang === 'bn'
                      ? 'GPS চালু ✓'
                      : 'GPS On ✓'
                    : lang === 'bn'
                      ? 'আমার GPS'
                      : 'My GPS'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (viewMode !== 'map') setViewMode('map');
                setPinDropActive((v) => !v);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                pinDropActive ? 'btn-amber' : 'btn-surface'
              }`}
              title={
                lang === 'bn'
                  ? 'ম্যাপের যেকোনো রাস্তায় ট্যাপ করে রোগীর লোকেশন পিন বসান'
                  : 'Tap anywhere on the map to set patient location pin'
              }
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>
                {pinDropActive
                  ? lang === 'bn'
                    ? 'ম্যাপে ট্যাপ করুন...'
                    : 'Tap Map Now...'
                  : lang === 'bn'
                    ? 'পিন বসান'
                    : 'Drop Pin'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                viewMode === 'list' ? 'btn-indigo' : 'btn-surface'
              }`}
            >
              {viewMode === 'map' ? <List className="w-4 h-4 shrink-0" /> : <MapIcon className="w-4 h-4 shrink-0" />}
              <span className="hidden sm:inline">
                {viewMode === 'map'
                  ? lang === 'bn'
                    ? 'তালিকা'
                    : 'List'
                  : lang === 'bn'
                    ? 'ম্যাপ'
                    : 'Map'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenSOSWizard({
                  bloodGroup:
                    selectedBloodGroup !== 'ALL' ? (selectedBloodGroup as BloodGroup) : undefined,
                  district: activeOriginNearestDistrict.districtId,
                  hospitalName:
                    selectedLoc?.type === 'HOSPITAL'
                      ? selectedLoc.name
                      : originMode === 'CUSTOM_PIN' && originLabel
                        ? originLabel
                        : undefined,
                })
              }
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl btn-crimson text-xs font-bold cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <Heart className="w-3.5 h-3.5 fill-white shrink-0" />
              <span>{lang === 'bn' ? 'রক্ত চান' : 'Request Blood'}</span>
            </button>
          </div>
        </div>

        {gpsNotice && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-amber-950 dark:text-amber-200 text-xs flex items-center justify-between gap-2">
            <span>{gpsNotice}</span>
            <button
              type="button"
              onClick={() => setGpsNotice(null)}
              className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 font-bold cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Dismiss GPS notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Uber / Pathao Pickup / Hospital Search Input with Instant Autocomplete */}
        <div className="relative">
          <Search className="w-4 h-4 text-teal-600 dark:text-teal-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="map-pickup-search"
            name="mapPickupQuery"
            type="text"
            value={pickupQuery}
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              setPickupQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmitPickupQuery();
              }
            }}
            placeholder={
              lang === 'bn'
                ? 'রোগী কোন হাসপাতালে বা এলাকায়? লিখে Enter চাপুন (যেমন: নিকেতন, Square Hospital, DMCH)...'
                : 'Where is blood needed? Type hospital or area & press Enter (e.g. Niketon, Square Hospital)...'
            }
            className="w-full h-11 pl-10 pr-9 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-[#0d1322] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {pickupQuery && (
            <button
              type="button"
              onClick={() => {
                setPickupQuery('');
                setShowSuggestions(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {showSuggestions && pickupSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-[500] rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {pickupSuggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-teal-50/70 dark:hover:bg-slate-800/80 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.kind === 'HOSPITAL'
                          ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400'
                          : 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                      }`}
                    >
                      {item.kind === 'HOSPITAL' ? (
                        <Hospital className="w-4 h-4" />
                      ) : (
                        <MapPin className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 shrink-0 whitespace-nowrap">
                    {lang === 'bn' ? 'পিন সেট করুন →' : 'Set Pin →'}
                  </span>
                </button>
              ))}
              {isSearchingPlaces && (
                <div className="px-3.5 py-2 text-[11px] text-slate-500">
                  {lang === 'bn' ? 'রাস্তার ম্যাপ থেকে আরও জায়গা খোঁজা হচ্ছে...' : 'Searching Bangladesh streets...'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Blood Group + Category Filter Row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {['ALL', 'O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'].map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedBloodGroup(grp)}
                className={`min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  selectedBloodGroup === grp
                    ? 'btn-crimson'
                    : 'bg-slate-100 dark:bg-[#0d1322] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {grp === 'ALL' ? (lang === 'bn' ? 'সব গ্রুপ' : 'All Groups') : grp}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {[
              { id: 'ALL', label: lang === 'bn' ? 'সব' : 'All', activeClass: 'btn-obsidian' },
              { id: 'DONOR', label: lang === 'bn' ? 'ডোনার' : 'Donors', activeClass: 'btn-emerald' },
              { id: 'HOSPITAL', label: lang === 'bn' ? 'হাসপাতাল' : 'Hospitals', activeClass: 'btn-sky' },
              { id: 'SOS', label: lang === 'bn' ? 'SOS' : 'SOS', activeClass: 'btn-crimson' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilterType(item.id as 'ALL' | 'DONOR' | 'SOS' | 'HOSPITAL')}
                className={`min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  filterType === item.id
                    ? item.activeClass
                    : 'bg-slate-100 dark:bg-[#0d1322] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}

            <select
              id="map-division-filter"
              name="mapSelectedDivision"
              value={selectedDivision}
              onChange={(e) => handleDivisionChange(e.target.value)}
              aria-label="Division Map Filter"
              className="h-[36px] px-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer shrink-0"
            >
              <option value="ALL">{lang === 'bn' ? 'সকল বিভাগ' : 'All Divisions'}</option>
              {DIVISIONS.map((div) => (
                <option key={div.id} value={div.id}>
                  {lang === 'bn' ? div.nameBn : div.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 1B. UBER / PATHAO LIVE DONOR ON-THE-WAY TRACKING CARD */}
      {activeLiveTrips.length > 0 && (
        <div className="bg-emerald-50/90 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-200">
              <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                {lang === 'bn'
                  ? 'লাইভ ডোনার অন-দ্য-ওয়ে ট্র্যাকার'
                  : 'Live Donor On-the-Way Tracker'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {activeLiveTrips.map((tr) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => {
                    setSelectedTripId(tr.id);
                    if (viewMode !== 'map') setViewMode('map');
                  }}
                  className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                    activeTrip?.id === tr.id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  {tr.donorName} ({tr.bloodGroup})
                </button>
              ))}

              {activeTrip && (
                <button
                  type="button"
                  onClick={() => setSelectedTripId('')}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl btn-surface text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  {lang === 'bn' ? 'সব পিন দেখুন' : 'Show All Pins'}
                </button>
              )}
            </div>
          </div>

          {activeTrip && (() => {
            const currentUid = auth.currentUser?.uid || null;
            const isMyTrip =
              Boolean(currentUid && activeTrip.donorUid === currentUid) ||
              activeTrip.donorUid === 'local_donor';
            const callHref = !isPhoneMaskedOrInvalid(activeTrip.responderPhone)
              ? buildDirectCallHref(activeTrip.responderPhone)
              : null;
            const displayEta = liveTripRoute?.etaMinutes ?? activeTrip.etaMinutes;
            const displayKm = liveTripRoute?.roadDistanceKm ?? activeTrip.distanceKm;

            return (
              <div className="p-3.5 rounded-xl bg-white dark:bg-[#0f172a] border border-emerald-200/80 dark:border-emerald-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                    {activeTrip.bloodGroup}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeTrip.donorName}{' '}
                      <span className="font-normal text-slate-500">→</span>{' '}
                      {activeTrip.hospitalName}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-1.5 mt-1 tabular-nums">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {activeTrip.tripStatus === 'ARRIVED'
                          ? lang === 'bn'
                            ? 'হাসপাতালে পৌঁছেছেন ✓'
                            : 'Arrived at Hospital ✓'
                          : lang === 'bn'
                            ? `বর্তমান অবস্থান: ${activeTrip.areaLabel}`
                            : `Current road: ${activeTrip.areaLabel}`}
                      </span>
                      {activeTrip.tripStatus === 'ON_THE_WAY' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <strong className="font-mono text-slate-900 dark:text-white">
                            {formatTravelEta(displayEta, lang)} ({formatDistance(displayKm, lang)})
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {callHref && !isMyTrip && (
                    <a
                      href={callHref}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'কল করুন' : 'Call Donor'}</span>
                    </a>
                  )}

                  {isMyTrip && activeTrip.tripStatus === 'ON_THE_WAY' && onUpdateLiveTripStatus && (
                    <button
                      type="button"
                      onClick={() => onUpdateLiveTripStatus(activeTrip.id, 'ARRIVED')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'পৌঁছে গেছি' : 'Mark Arrived'}</span>
                    </button>
                  )}

                  {isMyTrip && onUpdateLiveTripStatus && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateLiveTripStatus(
                          activeTrip.id,
                          activeTrip.tripStatus === 'ARRIVED' ? 'COMPLETED' : 'CANCELLED'
                        )
                      }
                      className="min-h-[44px] px-3 py-2 rounded-xl btn-surface font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>
                        {activeTrip.tripStatus === 'ARRIVED'
                          ? lang === 'bn'
                            ? 'রক্তদান সম্পন্ন'
                            : 'Complete'
                          : lang === 'bn'
                            ? 'লোকেশন বন্ধ'
                            : 'Stop Sharing'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 2. REAL LEAFLET MAP WITH LIVE UBER/PATHAO ROUTE LINE & ETA */}
      {viewMode === 'map' ? (
        <div className="space-y-3" onClick={() => showSuggestions && setShowSuggestions(false)}>
          <div
            className={`rounded-2xl overflow-hidden shadow-xs border relative h-[400px] sm:h-[470px] bg-slate-100 dark:bg-[#0b0f19] ${
              tileStyle === 'dark' ? 'bsbd-map-dark ' : ''
            }${
              pinDropActive
                ? 'border-rose-500 ring-2 ring-rose-500/30 cursor-crosshair'
                : 'border-slate-200/90 dark:border-slate-800'
            }`}
          >
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Top Floating Route ETA & Map Controls */}
            <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between gap-2 pointer-events-none">
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/92 border border-slate-700 text-white flex items-center gap-2 text-xs shadow-md pointer-events-auto tabular-nums">
                {pinDropActive ? (
                  <>
                    <Crosshair className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="font-bold">
                      {lang === 'bn'
                        ? 'ম্যাপের যেকোনো জায়গায় ট্যাপ করে পিন বসান'
                        : 'Tap anywhere on the map to drop your pin'}
                    </span>
                  </>
                ) : activeTrip ? (
                  <>
                    <Navigation className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold">
                      {activeTrip.donorName}
                      <span aria-hidden="true"> · </span>
                      {activeTrip.tripStatus === 'ARRIVED'
                        ? lang === 'bn'
                          ? 'পৌঁছেছেন ✓'
                          : 'Arrived ✓'
                        : `${formatTravelEta(
                            liveTripRoute?.etaMinutes ?? activeTrip.etaMinutes,
                            lang
                          )} · ${formatDistance(
                            liveTripRoute?.roadDistanceKm ?? activeTrip.distanceKm,
                            lang
                          )}`}
                    </span>
                  </>
                ) : activeRoute && selectedLoc ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-bold">
                      {formatTravelEta(activeRoute.etaMinutes, lang)}
                      <span aria-hidden="true"> · </span>
                      {formatDistance(activeRoute.roadDistanceKm, lang)}
                    </span>
                  </>
                ) : (
                  <span className="font-bold">
                    {lang === 'bn'
                      ? `${filteredLocations.length}টি সক্রিয় লোকেশন`
                      : `${filteredLocations.length} Active Pins`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={handleFitAllPins}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-teal-600/95 hover:bg-teal-700 border border-teal-400/50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                  title={lang === 'bn' ? 'ম্যাপে সব পিন এক নজরে দেখুন' : 'Fit all active pins into view'}
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {lang === 'bn' ? 'সব পিন' : 'Fit Pins'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={cycleTileStyle}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                  title={lang === 'bn' ? 'ম্যাপের স্টাইল পরিবর্তন করুন' : 'Switch Map Layer'}
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="hidden sm:inline">
                    {lang === 'bn'
                      ? TILE_LAYER_CONFIGS[tileStyle].labelBn
                      : TILE_LAYER_CONFIGS[tileStyle].labelEn}
                  </span>
                </button>

                <div className="flex items-center gap-0.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700 text-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => mapInstanceRef.current?.zoomIn()}
                    className="p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mapInstanceRef.current?.zoomOut()}
                    className="p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDivision('ALL');
                      mapInstanceRef.current?.flyTo([23.75, 90.35], 7, { duration: 0.85 });
                    }}
                    className="p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                    title={lang === 'bn' ? 'পুরো বাংলাদেশ দেখুন' : 'All Bangladesh'}
                  >
                    <Globe2 className="w-4 h-4 text-emerald-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom-Left Compact Legend */}
            <div className="absolute bottom-3 left-3 z-[400] px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700 text-[11px] text-white flex items-center gap-2.5 flex-wrap pointer-events-none shadow-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                {lang === 'bn' ? 'ডোনার' : 'Donor'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                {lang === 'bn' ? 'অ্যাডমিন' : 'Admin'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" />
                {lang === 'bn' ? 'হাসপাতাল' : 'Hospital'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
                <span>SOS</span>
              </span>
            </div>
          </div>

          {/* 3. UBER / PATHAO QUICK-SELECT NEAREST STRIP (Tap to switch route target!) */}
          {filteredLocations.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {filteredLocations.slice(0, 8).map((loc, idx) => {
                const isSelected = loc.id === selectedLoc?.id;
                const adminPin = isMapDonorAdmin(loc);
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleSelectCarouselItem(loc)}
                    className={`min-h-[48px] px-3 py-2 rounded-2xl border text-left flex items-center gap-2.5 shrink-0 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                        : 'bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-teal-400'
                    }`}
                  >
                    <span
                      className={`px-2 h-7 rounded-lg font-extrabold text-[11px] text-white flex items-center justify-center shrink-0 ${
                        loc.type === 'DONOR'
                          ? adminPin
                            ? 'bg-indigo-600'
                            : 'bg-emerald-600'
                          : loc.type === 'SOS'
                            ? 'bg-red-600'
                            : 'bg-sky-700'
                      }`}
                    >
                      {loc.type === 'HOSPITAL' ? loc.shortLabel : loc.bloodGroup}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate max-w-[140px]">
                        {idx === 0 ? '★ ' : ''}
                        {loc.donorName || loc.shortLabel}
                      </div>
                      <div
                        className={`text-[10px] font-mono tabular-nums ${
                          isSelected
                            ? 'text-emerald-300 dark:text-emerald-700 font-bold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {loc.computedDistance}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 4. SELECTED LOCATION UBER-STYLE RIDE / DISPATCH SHEET */}
          {selectedLoc ? (
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800/90 space-y-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`px-2.5 h-12 min-w-[48px] rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0 ${
                      selectedLoc.type === 'DONOR'
                        ? isMapDonorAdmin(selectedLoc)
                          ? 'bg-indigo-600'
                          : 'bg-emerald-600'
                        : selectedLoc.type === 'SOS'
                          ? 'bg-red-600'
                          : 'bg-sky-700'
                    }`}
                  >
                    {selectedLoc.type === 'HOSPITAL' ? (
                      <Hospital className="w-5 h-5 text-white" />
                    ) : (
                      selectedLoc.bloodGroup
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-snug">
                        {selectedLoc.name}
                      </h4>
                      {isMapDonorAdmin(selectedLoc) && (
                        <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-bold ${
                          selectedLoc.type === 'SOS'
                            ? 'text-red-600 dark:text-red-400'
                            : selectedLoc.type === 'DONOR'
                              ? isMapDonorAdmin(selectedLoc)
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                              : 'text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        ·{' '}
                        {selectedLoc.type === 'SOS'
                          ? lang === 'bn'
                            ? 'জরুরি SOS'
                            : 'Emergency SOS'
                          : selectedLoc.type === 'DONOR'
                            ? isMapDonorAdmin(selectedLoc)
                              ? lang === 'bn'
                                ? 'অ্যাডমিন রক্ত সমন্বয়ক'
                                : 'Admin Coordinator'
                              : lang === 'bn'
                                ? 'প্রস্তুত রক্তদাতা'
                                : 'Ready Donor'
                            : lang === 'bn'
                              ? '২৪/৭ ব্লাড ব্যাংক'
                              : '24/7 Blood Bank'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mt-1 flex-wrap tabular-nums">
                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>{selectedLoc.district}</span>
                      <span>·</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {activeRoute
                          ? `${formatDistance(activeRoute.roadDistanceKm, lang)} (${formatTravelEta(
                              activeRoute.etaMinutes,
                              lang
                            )})`
                          : `${selectedLoc.computedDistance}`}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Call, Chat, Request Blood Here, Turn-by-Turn Navigation */}
              <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2">
                {selectedLoc.canDirectCall && selectedLoc.phone ? (
                  <>
                    <a
                      href={`tel:${selectedLoc.phone}`}
                      className="min-h-[44px] py-2 px-4 rounded-xl btn-emerald font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{lang === 'bn' ? 'সরাসরি কল করুন' : 'Call Now'}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyPhone(selectedLoc.id, selectedLoc.phone)}
                      className="min-h-[44px] py-2 px-3 rounded-xl btn-indigo font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap tabular-nums"
                    >
                      {copiedPhoneId === selectedLoc.id ? (
                        <Check className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{selectedLoc.phone}</span>
                    </button>
                  </>
                ) : selectedLoc.sourceDonor && onRevealPhone ? (
                  <button
                    type="button"
                    onClick={() => onRevealPhone(selectedLoc.sourceDonor!)}
                    className="min-h-[44px] py-2 px-3.5 rounded-xl btn-amber font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === 'bn' ? 'নম্বর অনুরোধ করুন' : 'Request Contact'}</span>
                  </button>
                ) : null}

                {onStartChatWithDonor && selectedLoc.type !== 'HOSPITAL' && (
                  <button
                    type="button"
                    onClick={() =>
                      onStartChatWithDonor(
                        selectedLoc.donorName || selectedLoc.name,
                        selectedLoc.bloodGroup,
                        selectedLoc.phone || undefined
                      )
                    }
                    className="min-h-[44px] py-2 px-3.5 rounded-xl btn-violet font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === 'bn' ? 'চ্যাট করুন' : 'Chat'}</span>
                  </button>
                )}

                {selectedLoc.type === 'HOSPITAL' && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenSOSWizard({
                        bloodGroup:
                          selectedBloodGroup !== 'ALL'
                            ? (selectedBloodGroup as BloodGroup)
                            : undefined,
                        district: selectedLoc.districtId,
                        hospitalName: selectedLoc.name,
                      })
                    }
                    className="min-h-[44px] py-2 px-3.5 rounded-xl btn-crimson font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Heart className="w-3.5 h-3.5 fill-white shrink-0" />
                    <span>{lang === 'bn' ? 'এই হাসপাতালে রক্ত চান' : 'Request Blood Here'}</span>
                  </button>
                )}

                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${originCoords.latitude},${originCoords.longitude}&destination=${selectedLoc.lat},${selectedLoc.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] py-2 px-3.5 rounded-xl btn-sky font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ml-auto"
                >
                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                  <span>{lang === 'bn' ? 'নেভিগেশন' : 'Navigate'}</span>
                  <ExternalLink className="w-3 h-3 opacity-85 shrink-0" />
                </a>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              {lang === 'bn'
                ? 'এই ফিল্টারে কোনো লোকেশন পাওয়া যায়নি। সব গ্রুপ বা অন্য বিভাগ বেছে নিন।'
                : 'No locations match this filter. Try All Groups or another division.'}
            </div>
          )}
        </div>
      ) : (
        /* SORTED DISTANCE LIST VIEW */
        <div className="bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              {lang === 'bn'
                ? 'নিকটবর্তী রক্তদাতা ও হাসপাতালের দূরত্ব তালিকা'
                : 'Nearby Donors & Hospitals by Distance'}
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {filteredLocations.length} {lang === 'bn' ? 'টি লোকেশন' : 'items'}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLocations.map((loc) => (
              <div key={loc.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`px-2 h-10 min-w-[44px] rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 ${
                      loc.type === 'DONOR'
                        ? isMapDonorAdmin(loc)
                          ? 'bg-indigo-600'
                          : 'bg-emerald-600'
                        : loc.type === 'SOS'
                          ? 'bg-red-600'
                          : 'bg-sky-700'
                    }`}
                  >
                    {loc.type === 'HOSPITAL' ? loc.shortLabel : loc.bloodGroup}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white block truncate">
                      {loc.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate tabular-nums">
                      {loc.district} ·{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                        {loc.computedDistance}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSelectCarouselItem(loc)}
                    className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer flex items-center justify-center"
                    title={lang === 'bn' ? 'ম্যাপে রুট দেখুন' : 'Show Route on Map'}
                  >
                    <MapPin className="w-4 h-4" />
                  </button>

                  {loc.canDirectCall && loc.phone ? (
                    <a
                      href={`tel:${loc.phone}`}
                      className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 cursor-pointer flex items-center justify-center"
                      title="Call"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  ) : loc.sourceDonor && onRevealPhone ? (
                    <button
                      type="button"
                      onClick={() => onRevealPhone(loc.sourceDonor!)}
                      className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 cursor-pointer flex items-center justify-center"
                      title={lang === 'bn' ? 'যোগাযোগ অনুরোধ' : 'Request Contact'}
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
