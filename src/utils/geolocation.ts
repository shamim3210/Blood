// Geolocation, 64-District Bangladesh Coordinate Resolver, Hospital Gazetteer, Live Place Search & Route Engine
import { DISTRICTS } from '../data/bangladeshGeo';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type GpsErrorReason = 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED';

// Default Fallback to Central Dhaka (Shahbagh / Panthapath / DMCH Medical Hub)
export const DEFAULT_BANGLADESH_COORDS: Coordinates = {
  latitude: 23.7465,
  longitude: 90.3890,
};

// Division center coordinates + default zoom levels
export const DIVISION_COORDINATES: Record<string, Coordinates & { zoom: number }> = {
  dhaka: { latitude: 23.8103, longitude: 90.4125, zoom: 9 },
  chattogram: { latitude: 22.3569, longitude: 91.7832, zoom: 9 },
  rajshahi: { latitude: 24.3745, longitude: 88.6042, zoom: 9 },
  khulna: { latitude: 22.8456, longitude: 89.5403, zoom: 9 },
  barishal: { latitude: 22.7010, longitude: 90.3535, zoom: 9 },
  sylhet: { latitude: 24.8949, longitude: 91.8687, zoom: 9 },
  rangpur: { latitude: 25.7439, longitude: 89.2752, zoom: 9 },
  mymensingh: { latitude: 24.7471, longitude: 90.4203, zoom: 9 },
};

// Accurate center coordinates for all 64 Districts of Bangladesh + common spelling aliases
export const DISTRICT_COORDINATES: Record<string, Coordinates> = {
  // Dhaka Division (13)
  dhaka: { latitude: 23.7806, longitude: 90.4070 },
  gazipur: { latitude: 24.0023, longitude: 90.4264 },
  narayanganj: { latitude: 23.6238, longitude: 90.5000 },
  tangail: { latitude: 24.2513, longitude: 89.9167 },
  faridpur: { latitude: 23.6071, longitude: 89.8429 },
  kishoreganj: { latitude: 24.4449, longitude: 90.7766 },
  manikganj: { latitude: 23.8644, longitude: 90.0047 },
  munshiganj: { latitude: 23.5422, longitude: 90.5305 },
  narsingdi: { latitude: 23.9322, longitude: 90.7154 },
  gopalganj: { latitude: 23.0051, longitude: 89.8266 },
  madaripur: { latitude: 23.1641, longitude: 90.1897 },
  rajbari: { latitude: 23.7574, longitude: 89.6445 },
  shariatpur: { latitude: 23.2423, longitude: 90.4348 },

  // Chattogram Division (11)
  chattogram: { latitude: 22.3569, longitude: 91.7832 },
  chittagong: { latitude: 22.3569, longitude: 91.7832 },
  coxs_bazar: { latitude: 21.4272, longitude: 92.0058 },
  coxsbazar: { latitude: 21.4272, longitude: 92.0058 },
  cumilla: { latitude: 23.4607, longitude: 91.1809 },
  comilla: { latitude: 23.4607, longitude: 91.1809 },
  feni: { latitude: 23.0159, longitude: 91.3976 },
  brahmanbaria: { latitude: 23.9571, longitude: 91.1119 },
  chandpur: { latitude: 23.2333, longitude: 90.6713 },
  noakhali: { latitude: 22.8696, longitude: 91.0991 },
  lakshmipur: { latitude: 22.9447, longitude: 90.8282 },
  khagrachhari: { latitude: 23.1193, longitude: 91.9847 },
  rangamati: { latitude: 22.6533, longitude: 92.1789 },
  bandarban: { latitude: 22.1953, longitude: 92.2184 },

  // Rajshahi Division (8)
  rajshahi: { latitude: 24.3745, longitude: 88.6042 },
  bogura: { latitude: 24.8465, longitude: 89.3770 },
  bogra: { latitude: 24.8465, longitude: 89.3770 },
  pabna: { latitude: 24.0064, longitude: 89.2372 },
  sirajganj: { latitude: 24.4534, longitude: 89.7007 },
  natore: { latitude: 24.4206, longitude: 89.0003 },
  naogaon: { latitude: 24.7936, longitude: 88.9318 },
  chapainawabganj: { latitude: 24.5965, longitude: 88.2775 },
  joypurhat: { latitude: 25.0968, longitude: 89.0227 },

  // Sylhet Division (4)
  sylhet: { latitude: 24.8949, longitude: 91.8687 },
  moulvibazar: { latitude: 24.4829, longitude: 91.7774 },
  habiganj: { latitude: 24.3749, longitude: 91.4155 },
  sunamganj: { latitude: 25.0658, longitude: 91.3950 },

  // Khulna Division (10)
  khulna: { latitude: 22.8456, longitude: 89.5403 },
  jashore: { latitude: 23.1664, longitude: 89.2137 },
  jessore: { latitude: 23.1664, longitude: 89.2137 },
  satkhira: { latitude: 22.7185, longitude: 89.0705 },
  kushtia: { latitude: 23.9013, longitude: 89.1204 },
  jhenaidah: { latitude: 23.5450, longitude: 89.1726 },
  chuadanga: { latitude: 23.6402, longitude: 88.8418 },
  magura: { latitude: 23.4873, longitude: 89.4199 },
  meherpur: { latitude: 23.7622, longitude: 88.6318 },
  narail: { latitude: 23.1725, longitude: 89.5127 },
  bagerhat: { latitude: 22.6516, longitude: 89.7859 },

  // Barishal Division (6)
  barishal: { latitude: 22.7010, longitude: 90.3535 },
  barisal: { latitude: 22.7010, longitude: 90.3535 },
  patuakhali: { latitude: 22.3596, longitude: 90.3299 },
  bhola: { latitude: 22.6859, longitude: 90.6482 },
  pirojpur: { latitude: 22.5841, longitude: 89.9720 },
  barguna: { latitude: 22.1592, longitude: 90.1256 },
  jhalokati: { latitude: 22.6406, longitude: 90.1987 },

  // Rangpur Division (8)
  rangpur: { latitude: 25.7439, longitude: 89.2752 },
  dinajpur: { latitude: 25.6217, longitude: 88.6355 },
  kurigram: { latitude: 25.8054, longitude: 89.6362 },
  gaibandha: { latitude: 25.3288, longitude: 89.5281 },
  nilphamari: { latitude: 25.9318, longitude: 88.8560 },
  thakurgaon: { latitude: 26.0337, longitude: 88.4617 },
  panchagarh: { latitude: 26.3411, longitude: 88.5542 },
  lalmonirhat: { latitude: 25.9923, longitude: 89.2847 },

  // Mymensingh Division (4)
  mymensingh: { latitude: 24.7471, longitude: 90.4203 },
  jamalpur: { latitude: 24.9375, longitude: 89.9378 },
  netrokona: { latitude: 24.8710, longitude: 90.7279 },
  sherpur: { latitude: 25.0205, longitude: 90.0153 },
};

// Popular sub-district / metro area coordinates for street-level accuracy
const UPAZILA_OR_AREA_COORDINATES: Record<string, Coordinates & { districtId?: string }> = {
  shahbagh: { latitude: 23.7389, longitude: 90.3958, districtId: 'dhaka' },
  'শাহবাগ': { latitude: 23.7389, longitude: 90.3958, districtId: 'dhaka' },
  panthapath: { latitude: 23.7528, longitude: 90.3816, districtId: 'dhaka' },
  'পান্থপথ': { latitude: 23.7528, longitude: 90.3816, districtId: 'dhaka' },
  'green road': { latitude: 23.7495, longitude: 90.3860, districtId: 'dhaka' },
  'গ্রিন রোড': { latitude: 23.7495, longitude: 90.3860, districtId: 'dhaka' },
  kalabagan: { latitude: 23.7490, longitude: 90.3802, districtId: 'dhaka' },
  'কলাবাগান': { latitude: 23.7490, longitude: 90.3802, districtId: 'dhaka' },
  dhanmondi: { latitude: 23.7465, longitude: 90.3760, districtId: 'dhaka' },
  'ধানমন্ডি': { latitude: 23.7465, longitude: 90.3760, districtId: 'dhaka' },
  mirpur: { latitude: 23.8071, longitude: 90.3686, districtId: 'dhaka' },
  'মিরপুর': { latitude: 23.8071, longitude: 90.3686, districtId: 'dhaka' },
  uttara: { latitude: 23.8759, longitude: 90.3795, districtId: 'dhaka' },
  'উত্তরা': { latitude: 23.8759, longitude: 90.3795, districtId: 'dhaka' },
  gulshan: { latitude: 23.7925, longitude: 90.4078, districtId: 'dhaka' },
  'গুলশান': { latitude: 23.7925, longitude: 90.4078, districtId: 'dhaka' },
  bashundhara: { latitude: 23.8162, longitude: 90.4310, districtId: 'dhaka' },
  'বসুন্ধরা': { latitude: 23.8162, longitude: 90.4310, districtId: 'dhaka' },
  mohakhali: { latitude: 23.7778, longitude: 90.4054, districtId: 'dhaka' },
  'মহাখালী': { latitude: 23.7778, longitude: 90.4054, districtId: 'dhaka' },
  mohammadpur: { latitude: 23.7662, longitude: 90.3589, districtId: 'dhaka' },
  'মোহাম্মদপুর': { latitude: 23.7662, longitude: 90.3589, districtId: 'dhaka' },
  shyamoli: { latitude: 23.7746, longitude: 90.3654, districtId: 'dhaka' },
  'শ্যামলী': { latitude: 23.7746, longitude: 90.3654, districtId: 'dhaka' },
  kalyanpur: { latitude: 23.7798, longitude: 90.3612, districtId: 'dhaka' },
  'কল্যাণপুর': { latitude: 23.7798, longitude: 90.3612, districtId: 'dhaka' },
  motijheel: { latitude: 23.7330, longitude: 90.4172, districtId: 'dhaka' },
  'মতিঝিল': { latitude: 23.7330, longitude: 90.4172, districtId: 'dhaka' },
  malibagh: { latitude: 23.7493, longitude: 90.4128, districtId: 'dhaka' },
  'মালিবাগ': { latitude: 23.7493, longitude: 90.4128, districtId: 'dhaka' },
  rampura: { latitude: 23.7612, longitude: 90.4216, districtId: 'dhaka' },
  'রামপুরা': { latitude: 23.7612, longitude: 90.4216, districtId: 'dhaka' },
  mugda: { latitude: 23.7316, longitude: 90.4301, districtId: 'dhaka' },
  'মুগদা': { latitude: 23.7316, longitude: 90.4301, districtId: 'dhaka' },
  savar: { latitude: 23.8583, longitude: 90.2667, districtId: 'dhaka' },
  'সাভার': { latitude: 23.8583, longitude: 90.2667, districtId: 'dhaka' },
  keraniganj: { latitude: 23.7112, longitude: 90.3519, districtId: 'dhaka' },
  'কেরানীগঞ্জ': { latitude: 23.7112, longitude: 90.3519, districtId: 'dhaka' },
  tongie: { latitude: 23.8915, longitude: 90.4023, districtId: 'gazipur' },
  tongi: { latitude: 23.8915, longitude: 90.4023, districtId: 'gazipur' },
  'টঙ্গী': { latitude: 23.8915, longitude: 90.4023, districtId: 'gazipur' },
  panchlaish: { latitude: 22.3614, longitude: 91.8316, districtId: 'chattogram' },
  'পাঁচলাইশ': { latitude: 22.3614, longitude: 91.8316, districtId: 'chattogram' },
  agrabad: { latitude: 22.3266, longitude: 91.8117, districtId: 'chattogram' },
  'আগ্রাবাদ': { latitude: 22.3266, longitude: 91.8117, districtId: 'chattogram' },
  halishahar: { latitude: 22.3372, longitude: 91.7785, districtId: 'chattogram' },
  'হালিশহর': { latitude: 22.3372, longitude: 91.7785, districtId: 'chattogram' },
  gec: { latitude: 22.3590, longitude: 91.8215, districtId: 'chattogram' },
  subidbazar: { latitude: 24.9096, longitude: 91.8532, districtId: 'sylhet' },
  'সুবিদবাজার': { latitude: 24.9096, longitude: 91.8532, districtId: 'sylhet' },
  'জিন্দাবাজার': { latitude: 24.8955, longitude: 91.8692, districtId: 'sylhet' },
  zindabazar: { latitude: 24.8955, longitude: 91.8692, districtId: 'sylhet' },
  boalia: { latitude: 24.3712, longitude: 88.6011, districtId: 'rajshahi' },
  'বোয়ালিয়া': { latitude: 24.3712, longitude: 88.6011, districtId: 'rajshahi' },
  sonadanga: { latitude: 22.8172, longitude: 89.5446, districtId: 'khulna' },
  'সোনাডাঙ্গা': { latitude: 22.8172, longitude: 89.5446, districtId: 'khulna' },
  dhap: { latitude: 25.7634, longitude: 89.2610, districtId: 'rangpur' },
  'ধাপ': { latitude: 25.7634, longitude: 89.2610, districtId: 'rangpur' },
  charpara: { latitude: 24.7429, longitude: 90.4094, districtId: 'mymensingh' },
  'চরপাড়া': { latitude: 24.7429, longitude: 90.4094, districtId: 'mymensingh' },
  agargaon: { latitude: 23.7775, longitude: 90.3712, districtId: 'dhaka' },
  'আগারগাঁও': { latitude: 23.7775, longitude: 90.3712, districtId: 'dhaka' },
  'শের-ই-বাংলা নগর': { latitude: 23.7708, longitude: 90.3695, districtId: 'dhaka' },
  'sher-e-bangla': { latitude: 23.7708, longitude: 90.3695, districtId: 'dhaka' },
  banani: { latitude: 23.7937, longitude: 90.4066, districtId: 'dhaka' },
  'বনানী': { latitude: 23.7937, longitude: 90.4066, districtId: 'dhaka' },
  badda: { latitude: 23.7805, longitude: 90.4267, districtId: 'dhaka' },
  'বাড্ডা': { latitude: 23.7805, longitude: 90.4267, districtId: 'dhaka' },
  farmgate: { latitude: 23.7561, longitude: 90.3872, districtId: 'dhaka' },
  'ফার্মগেট': { latitude: 23.7561, longitude: 90.3872, districtId: 'dhaka' },
  tejgaon: { latitude: 23.7639, longitude: 90.3928, districtId: 'dhaka' },
  'তেজগাঁও': { latitude: 23.7639, longitude: 90.3928, districtId: 'dhaka' },
  khilgaon: { latitude: 23.7517, longitude: 90.4254, districtId: 'dhaka' },
  'খিলগাঁও': { latitude: 23.7517, longitude: 90.4254, districtId: 'dhaka' },
  jatrabari: { latitude: 23.7104, longitude: 90.4349, districtId: 'dhaka' },
  'যাত্রাবাড়ী': { latitude: 23.7104, longitude: 90.4349, districtId: 'dhaka' },
  mitford: { latitude: 23.7118, longitude: 90.4011, districtId: 'dhaka' },
  'মিটফোর্ড': { latitude: 23.7118, longitude: 90.4011, districtId: 'dhaka' },
  niketon: { latitude: 23.7794, longitude: 90.4116, districtId: 'dhaka' },
  niketan: { latitude: 23.7794, longitude: 90.4116, districtId: 'dhaka' },
  'নিকেতন': { latitude: 23.7794, longitude: 90.4116, districtId: 'dhaka' },
  'গুলশান-১': { latitude: 23.7806, longitude: 90.4168, districtId: 'dhaka' },
  'গুলশান ১': { latitude: 23.7806, longitude: 90.4168, districtId: 'dhaka' },
  'gulshan-1': { latitude: 23.7806, longitude: 90.4168, districtId: 'dhaka' },
  'gulshan 1': { latitude: 23.7806, longitude: 90.4168, districtId: 'dhaka' },
  'গুলশান-২': { latitude: 23.7947, longitude: 90.4143, districtId: 'dhaka' },
  'গুলশান ২': { latitude: 23.7947, longitude: 90.4143, districtId: 'dhaka' },
  'gulshan-2': { latitude: 23.7947, longitude: 90.4143, districtId: 'dhaka' },
  'gulshan 2': { latitude: 23.7947, longitude: 90.4143, districtId: 'dhaka' },
  'মিরপুর-১০': { latitude: 23.8069, longitude: 90.3687, districtId: 'dhaka' },
  'মিরপুর ১০': { latitude: 23.8069, longitude: 90.3687, districtId: 'dhaka' },
  'mirpur-10': { latitude: 23.8069, longitude: 90.3687, districtId: 'dhaka' },
  'mirpur 10': { latitude: 23.8069, longitude: 90.3687, districtId: 'dhaka' },
  'মিরপুর-১': { latitude: 23.7956, longitude: 90.3537, districtId: 'dhaka' },
  'মিরপুর ১': { latitude: 23.7956, longitude: 90.3537, districtId: 'dhaka' },
  'mirpur-1': { latitude: 23.7956, longitude: 90.3537, districtId: 'dhaka' },
  'mirpur 1': { latitude: 23.7956, longitude: 90.3537, districtId: 'dhaka' },
  'মিরপুর-১২': { latitude: 23.8282, longitude: 90.3644, districtId: 'dhaka' },
  'মিরপুর ১২': { latitude: 23.8282, longitude: 90.3644, districtId: 'dhaka' },
  'mirpur-12': { latitude: 23.8282, longitude: 90.3644, districtId: 'dhaka' },
  'mirpur 12': { latitude: 23.8282, longitude: 90.3644, districtId: 'dhaka' },
  'ধানমন্ডি ২৭': { latitude: 23.7549, longitude: 90.3762, districtId: 'dhaka' },
  'dhanmondi 27': { latitude: 23.7549, longitude: 90.3762, districtId: 'dhaka' },
  'ধানমন্ডি ৩২': { latitude: 23.7516, longitude: 90.3779, districtId: 'dhaka' },
  'dhanmondi 32': { latitude: 23.7516, longitude: 90.3779, districtId: 'dhaka' },
  'বসুন্ধরা আবাসিক': { latitude: 23.8162, longitude: 90.4310, districtId: 'dhaka' },
  'bashundhara r/a': { latitude: 23.8162, longitude: 90.4310, districtId: 'dhaka' },
  banasree: { latitude: 23.7619, longitude: 90.4331, districtId: 'dhaka' },
  'বনশ্রী': { latitude: 23.7619, longitude: 90.4331, districtId: 'dhaka' },
  aftabnagar: { latitude: 23.7684, longitude: 90.4378, districtId: 'dhaka' },
  'আফতাবনগর': { latitude: 23.7684, longitude: 90.4378, districtId: 'dhaka' },
  baridhara: { latitude: 23.8035, longitude: 90.4226, districtId: 'dhaka' },
  'বারিধারা': { latitude: 23.8035, longitude: 90.4226, districtId: 'dhaka' },
  nikunja: { latitude: 23.8311, longitude: 90.4178, districtId: 'dhaka' },
  'নিকুঞ্জ': { latitude: 23.8311, longitude: 90.4178, districtId: 'dhaka' },
  khilkhet: { latitude: 23.8319, longitude: 90.4254, districtId: 'dhaka' },
  'খিলক্ষেত': { latitude: 23.8319, longitude: 90.4254, districtId: 'dhaka' },
  bashabo: { latitude: 23.7418, longitude: 90.4326, districtId: 'dhaka' },
  basabo: { latitude: 23.7418, longitude: 90.4326, districtId: 'dhaka' },
  'বাসাবো': { latitude: 23.7418, longitude: 90.4326, districtId: 'dhaka' },
  lalmatia: { latitude: 23.7574, longitude: 90.3688, districtId: 'dhaka' },
  'লালমাটিয়া': { latitude: 23.7574, longitude: 90.3688, districtId: 'dhaka' },
  zigatola: { latitude: 23.7388, longitude: 90.3719, districtId: 'dhaka' },
  'জিগাতলা': { latitude: 23.7388, longitude: 90.3719, districtId: 'dhaka' },
  azimpur: { latitude: 23.7279, longitude: 90.3861, districtId: 'dhaka' },
  'আজিমপুর': { latitude: 23.7279, longitude: 90.3861, districtId: 'dhaka' },
  wari: { latitude: 23.7176, longitude: 90.4178, districtId: 'dhaka' },
  'ওয়ারী': { latitude: 23.7176, longitude: 90.4178, districtId: 'dhaka' },
  eskaton: { latitude: 23.7471, longitude: 90.3988, districtId: 'dhaka' },
  'ইস্কাটন': { latitude: 23.7471, longitude: 90.3988, districtId: 'dhaka' },
  moghbazar: { latitude: 23.7494, longitude: 90.4059, districtId: 'dhaka' },
  'মগবাজার': { latitude: 23.7494, longitude: 90.4059, districtId: 'dhaka' },
  nakhalpara: { latitude: 23.7689, longitude: 90.3982, districtId: 'dhaka' },
  'নাখালপাড়া': { latitude: 23.7689, longitude: 90.3982, districtId: 'dhaka' },
  cantonment: { latitude: 23.8152, longitude: 90.4018, districtId: 'dhaka' },
  'ক্যান্টনমেন্ট': { latitude: 23.8152, longitude: 90.4018, districtId: 'dhaka' },
  shantinagar: { latitude: 23.7382, longitude: 90.4141, districtId: 'dhaka' },
  'শান্তিনগর': { latitude: 23.7382, longitude: 90.4141, districtId: 'dhaka' },
  kakrail: { latitude: 23.7367, longitude: 90.4079, districtId: 'dhaka' },
  'কাকরাইল': { latitude: 23.7367, longitude: 90.4079, districtId: 'dhaka' },
  shewrapara: { latitude: 23.7889, longitude: 90.3736, districtId: 'dhaka' },
  'শেওড়াপাড়া': { latitude: 23.7889, longitude: 90.3736, districtId: 'dhaka' },
  kazipara: { latitude: 23.7972, longitude: 90.3728, districtId: 'dhaka' },
  'কাজীপাড়া': { latitude: 23.7972, longitude: 90.3728, districtId: 'dhaka' },
  pallabi: { latitude: 23.8245, longitude: 90.3658, districtId: 'dhaka' },
  'পল্লবী': { latitude: 23.8245, longitude: 90.3658, districtId: 'dhaka' },
  adabor: { latitude: 23.7712, longitude: 90.3592, districtId: 'dhaka' },
  'আদাবর': { latitude: 23.7712, longitude: 90.3592, districtId: 'dhaka' },
  demra: { latitude: 23.7231, longitude: 90.4859, districtId: 'dhaka' },
  'ডেমরা': { latitude: 23.7231, longitude: 90.4859, districtId: 'dhaka' },
  kamrangirchar: { latitude: 23.7145, longitude: 90.3694, districtId: 'dhaka' },
  'কামরাঙ্গীরচর': { latitude: 23.7145, longitude: 90.3694, districtId: 'dhaka' },
};

export interface BangladeshHospitalGazetteerEntry {
  id: string;
  nameBn: string;
  nameEn: string;
  shortLabel: string;
  areaBn: string;
  areaEn: string;
  districtId: string;
  divisionId: string;
  phone: string;
  coords: Coordinates;
  aliases: string[];
}

// Comprehensive Government & Major Private Hospitals across Bangladesh (with common typo/Banglish aliases!)
export const POPULAR_BD_HOSPITALS: BangladeshHospitalGazetteerEntry[] = [
  {
    id: 'hosp-dmch',
    nameBn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল (DMCH)',
    nameEn: 'Dhaka Medical College Hospital (DMCH)',
    shortLabel: 'DMCH',
    areaBn: 'শাহবাগ, ঢাকা',
    areaEn: 'Shahbagh, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880255165088',
    coords: { latitude: 23.7260, longitude: 90.3976 },
    aliases: ['dmch', 'dhaka medical', 'dhaka medikel', 'ঢাকা মেডিকেল', 'ঢামেক'],
  },
  {
    id: 'hosp-square',
    nameBn: 'স্কয়ার হাসপাতাল লিমিটেড (Square Hospital)',
    nameEn: 'Square Hospital Ltd.',
    shortLabel: 'Square',
    areaBn: 'পান্থপথ, ঢাকা',
    areaEn: 'Panthapath, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+88028144400',
    coords: { latitude: 23.7528, longitude: 90.3816 },
    aliases: ['square', 'squire', 'squre', 'sqaure', 'skoyar', 'স্কয়ার', 'স্কয়ার', 'panthapath hospital'],
  },
  {
    id: 'hosp-bsmmu',
    nameBn: 'বিএসএমএমইউ / পিজি হাসপাতাল (BSMMU)',
    nameEn: 'BSMMU (PG Hospital)',
    shortLabel: 'BSMMU',
    areaBn: 'শাহবাগ, ঢাকা',
    areaEn: 'Shahbagh, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880255165760',
    coords: { latitude: 23.7389, longitude: 90.3958 },
    aliases: ['bsmmu', 'pg hospital', 'pg', 'bangabandhu sheikh mujib', 'পিজি', 'বিএসএমএমইউ'],
  },
  {
    id: 'hosp-evercare',
    nameBn: 'এভারকেয়ার হাসপাতাল ঢাকা (Evercare)',
    nameEn: 'Evercare Hospital Dhaka',
    shortLabel: 'Evercare',
    areaBn: 'বসুন্ধরা, ঢাকা',
    areaEn: 'Bashundhara R/A, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880255037242',
    coords: { latitude: 23.8104, longitude: 90.4313 },
    aliases: ['evercare', 'ever care', 'apollo', 'apolo', 'এভারকেয়ার', 'এভারকেয়ার', 'অ্যাপোলো'],
  },
  {
    id: 'hosp-united',
    nameBn: 'ইউনাইটেড হাসপাতাল (United Hospital)',
    nameEn: 'United Hospital Ltd.',
    shortLabel: 'United',
    areaBn: 'গুলশান-২, ঢাকা',
    areaEn: 'Gulshan-2, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+88028836000',
    coords: { latitude: 23.8047, longitude: 90.4156 },
    aliases: ['united', 'united hospital', 'ইউনাইটেড'],
  },
  {
    id: 'hosp-labaid',
    nameBn: 'ল্যাবএইড স্পেশালাইজড হাসপাতাল (LabAid)',
    nameEn: 'LabAid Specialized Hospital',
    shortLabel: 'LabAid',
    areaBn: 'ধানমন্ডি-৪, ঢাকা',
    areaEn: 'Dhanmondi-4, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880258610793',
    coords: { latitude: 23.7419, longitude: 90.3828 },
    aliases: ['labaid', 'lab aid', 'ল্যাবএইড', 'ল্যাব এইড'],
  },
  {
    id: 'hosp-popular',
    nameBn: 'পপুলার মেডিকেল কলেজ হাসপাতাল (Popular)',
    nameEn: 'Popular Medical College Hospital',
    shortLabel: 'Popular',
    areaBn: 'ধানমন্ডি-২, ঢাকা',
    areaEn: 'Dhanmondi-2, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+8809613787801',
    coords: { latitude: 23.7395, longitude: 90.3812 },
    aliases: ['popular', 'populer', 'পপুলার'],
  },
  {
    id: 'hosp-ibnsina',
    nameBn: 'ইবনে সিনা হাসপাতাল (Ibn Sina)',
    nameEn: 'Ibn Sina Specialized Hospital',
    shortLabel: 'Ibn Sina',
    areaBn: 'ধানমন্ডি-১৫, ঢাকা',
    areaEn: 'Dhanmondi-15, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+8809610010615',
    coords: { latitude: 23.7499, longitude: 90.3712 },
    aliases: ['ibn sina', 'ibnsina', 'ibne sina', 'ইবনে সিনা'],
  },
  {
    id: 'hosp-birdem',
    nameBn: 'বারডেম জেনারেল হাসপাতাল (BIRDEM)',
    nameEn: 'BIRDEM General Hospital',
    shortLabel: 'BIRDEM',
    areaBn: 'শাহবাগ, ঢাকা',
    areaEn: 'Shahbagh, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880241060501',
    coords: { latitude: 23.7393, longitude: 90.3968 },
    aliases: ['birdem', 'bardem', 'বারডেম'],
  },
  {
    id: 'hosp-nicvd',
    nameBn: 'জাতীয় হৃদরোগ ইনস্টিটিউট ও হাসপাতাল (NICVD)',
    nameEn: 'National Heart Institute (NICVD)',
    shortLabel: 'NICVD',
    areaBn: 'শের-ই-বাংলা নগর, ঢাকা',
    areaEn: 'Sher-e-Bangla Nagar, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+88029122560',
    coords: { latitude: 23.7708, longitude: 90.3695 },
    aliases: ['nicvd', 'hridrog', 'heart institute', 'হৃদরোগ', 'সোহরাওয়ার্দী', 'suhrawardy', 'shsmc'],
  },
  {
    id: 'hosp-nhf',
    nameBn: 'ন্যাশনাল হার্ট ফাউন্ডেশন হাসপাতাল (মিরপুর)',
    nameEn: 'National Heart Foundation Mirpur',
    shortLabel: 'NHF',
    areaBn: 'মিরপুর-২, ঢাকা',
    areaEn: 'Mirpur-2, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880258054708',
    coords: { latitude: 23.8037, longitude: 90.3621 },
    aliases: ['heart foundation', 'nhf', 'হার্ট ফাউন্ডেশন', 'mirpur heart'],
  },
  {
    id: 'hosp-nitor',
    nameBn: 'জাতীয় অর্থোপেডিক / পঙ্গু হাসপাতাল (NITOR)',
    nameEn: 'NITOR (Pongu Hospital)',
    shortLabel: 'NITOR',
    areaBn: 'শ্যামলী / আগারগাঁও, ঢাকা',
    areaEn: 'Sher-e-Bangla Nagar, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+88029144190',
    coords: { latitude: 23.7742, longitude: 90.3688 },
    aliases: ['nitor', 'pongu', 'pangu', 'পঙ্গু', 'অর্থোপেডিক'],
  },
  {
    id: 'hosp-kurmitola',
    nameBn: 'কুর্মিটোলা জেনারেল হাসপাতাল',
    nameEn: 'Kurmitola General Hospital',
    shortLabel: 'KGH',
    areaBn: 'ক্যান্টনমেন্ট, ঢাকা',
    areaEn: 'Cantonment, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880255062388',
    coords: { latitude: 23.8191, longitude: 90.4079 },
    aliases: ['kurmitola', 'kgh', 'কুর্মিটোলা'],
  },
  {
    id: 'hosp-mugda',
    nameBn: 'মুগদা মেডিকেল কলেজ ও হাসপাতাল',
    nameEn: 'Mugda Medical College Hospital',
    shortLabel: 'Mugda MC',
    areaBn: 'মুগদা, ঢাকা',
    areaEn: 'Mugda, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+88027276032',
    coords: { latitude: 23.7324, longitude: 90.4305 },
    aliases: ['mugda', 'mugda medical', 'মুগদা'],
  },
  {
    id: 'hosp-mitford',
    nameBn: 'স্যার সলিমুল্লাহ মেডিকেল ও মিটফোর্ড হাসপাতাল',
    nameEn: 'Sir Salimullah Medical (Mitford)',
    shortLabel: 'SSMC',
    areaBn: 'মিটফোর্ড, ঢাকা',
    areaEn: 'Mitford, Old Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+880257319002',
    coords: { latitude: 23.7118, longitude: 90.4011 },
    aliases: ['mitford', 'ssmc', 'salimullah', 'মিটফোর্ড', 'সলিমুল্লাহ'],
  },
  {
    id: 'hosp-enam',
    nameBn: 'এনাম মেডিকেল কলেজ হাসপাতাল (সাভার)',
    nameEn: 'Enam Medical College Hospital',
    shortLabel: 'Enam MC',
    areaBn: 'সাভার, ঢাকা',
    areaEn: 'Savar, Dhaka',
    districtId: 'dhaka',
    divisionId: 'dhaka',
    phone: '+8801716358146',
    coords: { latitude: 23.8475, longitude: 90.2575 },
    aliases: ['enam', 'enam medical', 'এনাম'],
  },
  {
    id: 'hosp-cmch',
    nameBn: 'চট্টগ্রাম মেডিকেল কলেজ হাসপাতাল (CMCH)',
    nameEn: 'Chattogram Medical College Hospital (CMCH)',
    shortLabel: 'CMCH',
    areaBn: 'পাঁচলাইশ, চট্টগ্রাম',
    areaEn: 'Panchlaish, Chattogram',
    districtId: 'chattogram',
    divisionId: 'chattogram',
    phone: '+88031619400',
    coords: { latitude: 22.3593, longitude: 91.8308 },
    aliases: ['cmch', 'chittagong medical', 'chattogram medical', 'চমেক', 'চট্টগ্রাম মেডিকেল'],
  },
  {
    id: 'hosp-imperial-ctg',
    nameBn: 'ইম্পেরিয়াল হাসপাতাল চট্টগ্রাম (Imperial)',
    nameEn: 'Imperial Hospital Chattogram',
    shortLabel: 'Imperial',
    areaBn: 'পাহাড়তলী, চট্টগ্রাম',
    areaEn: 'Pahartali, Chattogram',
    districtId: 'chattogram',
    divisionId: 'chattogram',
    phone: '+8809612247247',
    coords: { latitude: 22.3612, longitude: 91.7978 },
    aliases: ['imperial', 'ইম্পেরিয়াল', 'evercare chattogram'],
  },
  {
    id: 'hosp-somch',
    nameBn: 'সিলেট এম এ জি ওসমানী মেডিকেল কলেজ হাসপাতাল',
    nameEn: 'Sylhet MAG Osmani Medical (SOMCH)',
    shortLabel: 'SOMCH',
    areaBn: 'কাজলশাহ, সিলেট',
    areaEn: 'Kajalshah, Sylhet',
    districtId: 'sylhet',
    divisionId: 'sylhet',
    phone: '+880821713667',
    coords: { latitude: 24.9006, longitude: 91.8546 },
    aliases: ['somch', 'osmani', 'sylhet medical', 'ওসমানী', 'সিলেট মেডিকেল'],
  },
  {
    id: 'hosp-rmch',
    nameBn: 'রাজশাহী মেডিকেল কলেজ হাসপাতাল (RMCH)',
    nameEn: 'Rajshahi Medical College Hospital (RMCH)',
    shortLabel: 'RMCH',
    areaBn: 'লক্ষ্মীপুর, রাজশাহী',
    areaEn: 'Laxmipur, Rajshahi',
    districtId: 'rajshahi',
    divisionId: 'rajshahi',
    phone: '+880721776001',
    coords: { latitude: 24.3720, longitude: 88.5866 },
    aliases: ['rmch', 'rajshahi medical', 'রামেক', 'রাজশাহী মেডিকেল'],
  },
  {
    id: 'hosp-kmch',
    nameBn: 'খুলনা মেডিকেল কলেজ হাসপাতাল (KMCH)',
    nameEn: 'Khulna Medical College Hospital (KMCH)',
    shortLabel: 'KMCH',
    areaBn: 'সোনাডাঙ্গা, খুলনা',
    areaEn: 'Sonadanga, Khulna',
    districtId: 'khulna',
    divisionId: 'khulna',
    phone: '+88041760350',
    coords: { latitude: 22.8286, longitude: 89.5378 },
    aliases: ['kmch', 'khulna medical', 'খুমেক', 'খুলনা মেডিকেল'],
  },
  {
    id: 'hosp-sbhmch',
    nameBn: 'শের-ই-বাংলা মেডিকেল কলেজ হাসপাতাল (বরিশাল)',
    nameEn: 'Sher-e-Bangla Medical Barishal (SBMCH)',
    shortLabel: 'SBMCH',
    areaBn: 'বান্দ রোড, বরিশাল',
    areaEn: 'Band Road, Barishal',
    districtId: 'barishal',
    divisionId: 'barishal',
    phone: '+8804312173547',
    coords: { latitude: 22.6869, longitude: 90.3612 },
    aliases: ['sbmch', 'barisal medical', 'barishal medical', 'শেবাচিম', 'বরিশাল মেডিকেল'],
  },
  {
    id: 'hosp-rpmch',
    nameBn: 'রংপুর মেডিকেল কলেজ হাসপাতাল (RpMCH)',
    nameEn: 'Rangpur Medical College Hospital (RpMCH)',
    shortLabel: 'RpMCH',
    areaBn: 'ধাপ, রংপুর',
    areaEn: 'Dhap, Rangpur',
    districtId: 'rangpur',
    divisionId: 'rangpur',
    phone: '+88052162288',
    coords: { latitude: 25.7647, longitude: 89.2602 },
    aliases: ['rpmch', 'rangpur medical', 'রমেক', 'রংপুর মেডিকেল'],
  },
  {
    id: 'hosp-mmch',
    nameBn: 'ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল (MMCH)',
    nameEn: 'Mymensingh Medical College Hospital (MMCH)',
    shortLabel: 'MMCH',
    areaBn: 'চরপাড়া, ময়মনসিংহ',
    areaEn: 'Charpara, Mymensingh',
    districtId: 'mymensingh',
    divisionId: 'mymensingh',
    phone: '+8809166063',
    coords: { latitude: 24.7429, longitude: 90.4094 },
    aliases: ['mmch', 'mymensingh medical', 'মমেক', 'ময়মনসিংহ মেডিকেল'],
  },
];

// Prebuild Bengali & English lookup map from DISTRICTS
const NORMALIZED_GEO_LOOKUP: Map<string, Coordinates> = (() => {
  const map = new Map<string, Coordinates>();
  Object.entries(DISTRICT_COORDINATES).forEach(([k, v]) => {
    map.set(k.toLowerCase(), v);
  });
  DISTRICTS.forEach((d) => {
    const coord = DISTRICT_COORDINATES[d.id] || DISTRICT_COORDINATES[d.divisionId];
    if (coord) {
      map.set(d.id.toLowerCase(), coord);
      map.set(d.nameEn.toLowerCase(), coord);
      map.set(d.nameBn.trim(), coord);
    }
  });
  return map;
})();

// Sort area entries by longest/most-specific key first so "নিকেতন, গুলশান-১" matches "নিকেতন" / "গুলশান-১" before generic "গুলশান"
const SORTED_UPAZILA_AREA_ENTRIES = Object.entries(UPAZILA_OR_AREA_COORDINATES).sort(
  (a, b) => b[0].length - a[0].length
);

function hashSeedOffset(seed: string): { dLat: number; dLng: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  // Subtle ~45m-95m map pin separation so multiple pins in the same area don't stack on top of each other
  const radius = 0.00045 + (((h >>> 8) % 50) / 100000);
  return {
    dLat: Number((Math.sin(angle) * radius).toFixed(5)),
    dLng: Number((Math.cos(angle) * radius).toFixed(5)),
  };
}

export interface ResolvedPlaceMatch {
  labelBn: string;
  labelEn: string;
  districtId: string;
  divisionId: string;
  coords: Coordinates;
  kind: 'HOSPITAL' | 'AREA' | 'DISTRICT';
}

/**
 * Resolves user-typed hospital names (including typos like "Squire hospital", "pg", "lab aid"),
 * neighborhoods ("Dhanmondi", "Panthapath"), or districts to exact Bangladesh GPS coordinates!
 */
export function resolvePlaceOrHospitalQuery(rawQuery?: string | null): ResolvedPlaceMatch | null {
  if (!rawQuery) return null;
  const cleaned = rawQuery
    .trim()
    .toLowerCase()
    .replace(/\b(hospital|hosp|medical|college|clinic|ltd|limited|general|specialized|হাসপাতাল|মেডিকেল|কলেজ|ক্লিনিক)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const fullLower = rawQuery.trim().toLowerCase();
  if (!fullLower) return null;

  // 1. Check popular hospitals & fuzzy aliases first (e.g. "Squire hospital" -> "squire" -> Square Hospital!)
  for (const h of POPULAR_BD_HOSPITALS) {
    const matchedAlias = h.aliases.some(
      (al) =>
        fullLower.includes(al.toLowerCase()) ||
        (cleaned.length >= 2 && al.toLowerCase().includes(cleaned)) ||
        (cleaned.length >= 3 && cleaned.includes(al.toLowerCase()))
    );
    if (
      matchedAlias ||
      h.nameEn.toLowerCase().includes(fullLower) ||
      h.nameBn.includes(rawQuery.trim())
    ) {
      return {
        labelBn: `${h.nameBn} (${h.areaBn})`,
        labelEn: `${h.nameEn} (${h.areaEn})`,
        districtId: h.districtId,
        divisionId: h.divisionId,
        coords: h.coords,
        kind: 'HOSPITAL',
      };
    }
  }

  // 2. Check metro neighborhoods / upazilas (most specific keys first)
  for (const [areaKey, info] of SORTED_UPAZILA_AREA_ENTRIES) {
    const keyLower = areaKey.toLowerCase();
    if (
      fullLower === keyLower ||
      fullLower.includes(keyLower) ||
      (cleaned.length >= 3 && keyLower.includes(cleaned))
    ) {
      const distId = info.districtId || 'dhaka';
      const distObj = DISTRICTS.find((d) => d.id === distId);
      const displayArea = /^[a-z]/.test(areaKey)
        ? areaKey.charAt(0).toUpperCase() + areaKey.slice(1)
        : areaKey;
      return {
        labelBn: `${displayArea}, ${distObj?.nameBn || 'ঢাকা'}`,
        labelEn: `${displayArea}, ${distObj?.nameEn || 'Dhaka'}`,
        districtId: distId,
        divisionId: distObj?.divisionId || 'dhaka',
        coords: { latitude: info.latitude, longitude: info.longitude },
        kind: 'AREA',
      };
    }
  }

  // 3. Check 64 Districts & their Upazilas
  for (const d of DISTRICTS) {
    if (
      fullLower === d.id.toLowerCase() ||
      fullLower === d.nameEn.toLowerCase() ||
      rawQuery.trim() === d.nameBn ||
      (cleaned.length >= 3 && d.nameEn.toLowerCase().startsWith(cleaned))
    ) {
      const c = DISTRICT_COORDINATES[d.id] || DEFAULT_BANGLADESH_COORDS;
      return {
        labelBn: `${d.nameBn} জেলা`,
        labelEn: `${d.nameEn} District`,
        districtId: d.id,
        divisionId: d.divisionId,
        coords: c,
        kind: 'DISTRICT',
      };
    }
    for (const u of d.upazilas) {
      if (
        fullLower === u.id.toLowerCase() ||
        fullLower === u.nameEn.toLowerCase() ||
        rawQuery.trim() === u.nameBn
      ) {
        const c = resolveBangladeshCoordinates({ district: d.id, upazila: u.nameEn });
        return {
          labelBn: `${u.nameBn}, ${d.nameBn}`,
          labelEn: `${u.nameEn}, ${d.nameEn}`,
          districtId: d.id,
          divisionId: d.divisionId,
          coords: c,
          kind: 'AREA',
        };
      }
    }
  }

  return null;
}

/**
 * Reverse-resolves any GPS / map-pin coordinate to the closest Bangladesh District & Division
 */
export function findNearestDistrictFromCoords(coords: Coordinates): {
  districtId: string;
  divisionId: string;
  nameBn: string;
  nameEn: string;
  distanceKm: number;
} {
  let best = DISTRICTS[0];
  let bestKm = Infinity;
  for (const d of DISTRICTS) {
    const dc = DISTRICT_COORDINATES[d.id];
    if (!dc) continue;
    const km = calculateHaversineDistance(coords, dc);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  return {
    districtId: best.id,
    divisionId: best.divisionId,
    nameBn: best.nameBn,
    nameEn: best.nameEn,
    distanceKm: bestKm,
  };
}

/**
 * Finds the nearest known neighborhood/area AND district from GPS coordinates,
 * then refines with OpenStreetMap Nominatim reverse-geocoding when online.
 */
export function findNearestAreaFromCoords(
  coords: Coordinates,
  lang: 'bn' | 'en'
): {
  areaLabel: string;
  districtId: string;
  divisionId: string;
  districtName: string;
} {
  const nearDist = findNearestDistrictFromCoords(coords);
  let bestAreaKey = '';
  let bestAreaKm = Infinity;

  for (const [areaKey, info] of Object.entries(UPAZILA_OR_AREA_COORDINATES)) {
    const isBanglaKey = /[\u0980-\u09FF]/.test(areaKey);
    if (lang === 'bn' && !isBanglaKey) continue;
    if (lang === 'en' && isBanglaKey) continue;
    const km = calculateHaversineDistance(coords, {
      latitude: info.latitude,
      longitude: info.longitude,
    });
    if (km < bestAreaKm) {
      bestAreaKm = km;
      bestAreaKey = areaKey;
    }
  }

  const formattedArea =
    bestAreaKm <= 4.5 && bestAreaKey
      ? lang === 'en'
        ? bestAreaKey.charAt(0).toUpperCase() + bestAreaKey.slice(1)
        : bestAreaKey
      : lang === 'bn'
        ? nearDist.nameBn
        : nearDist.nameEn;

  return {
    areaLabel: formattedArea,
    districtId: nearDist.districtId,
    divisionId: nearDist.divisionId,
    districtName: lang === 'bn' ? nearDist.nameBn : nearDist.nameEn,
  };
}

export async function reverseGeocodeBangladeshCoords(
  coords: Coordinates,
  lang: 'bn' | 'en'
): Promise<{
  areaText: string;
  districtId: string;
  divisionId: string;
  districtName: string;
}> {
  const localBest = findNearestAreaFromCoords(coords, lang);
  if (typeof fetch === 'undefined') {
    return {
      areaText: localBest.areaLabel.slice(0, 50),
      districtId: localBest.districtId,
      divisionId: localBest.divisionId,
      districtName: localBest.districtName,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3200);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=17&accept-language=${
      lang === 'bn' ? 'bn,en' : 'en'
    }`;
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address || {};
      const parts = [
        addr.neighbourhood,
        addr.suburb,
        addr.quarter,
        addr.residential,
        addr.road,
        addr.city_district,
        addr.town,
        addr.village,
      ]
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean);
      const uniqueParts: string[] = [];
      for (const p of parts) {
        if (!uniqueParts.some((u) => u.toLowerCase() === p.toLowerCase())) {
          uniqueParts.push(p);
        }
        if (uniqueParts.length >= 2) break;
      }
      const composed = uniqueParts.join(', ').slice(0, 50).trim();
      if (composed.length >= 2) {
        return {
          areaText: composed,
          districtId: localBest.districtId,
          divisionId: localBest.divisionId,
          districtName: localBest.districtName,
        };
      }
    }
  } catch {
    // Fall back cleanly to instant local neighborhood match
  } finally {
    clearTimeout(timer);
  }

  return {
    areaText: localBest.areaLabel.slice(0, 50),
    districtId: localBest.districtId,
    divisionId: localBest.divisionId,
    districtName: localBest.districtName,
  };
}

/**
 * Resolves any English ID, English name, hospital, or বাংলা district/upazila string to real Bangladesh GPS coordinates.
 */
export function resolveBangladeshCoordinates(params: {
  district?: string;
  upazila?: string;
  division?: string;
  hospital?: string;
  seedKey?: string;
}): Coordinates {
  if (params.hospital) {
    const hospMatch = resolvePlaceOrHospitalQuery(params.hospital);
    if (hospMatch) {
      if (params.seedKey) {
        const { dLat, dLng } = hashSeedOffset(params.seedKey);
        return {
          latitude: hospMatch.coords.latitude + dLat,
          longitude: hospMatch.coords.longitude + dLng,
        };
      }
      return hospMatch.coords;
    }
  }

  const combinedText = `${params.upazila || ''} ${params.district || ''}`.trim().toLowerCase();

  // 1. Check neighborhood/upazila match first (prioritizing upazila text & longest/most-specific keys first)
  const upazilaLower = (params.upazila || '').trim().toLowerCase();
  if (upazilaLower) {
    // Prefer exact or primary neighborhood mentions (e.g. "Niketon, Gulshan-1" -> checks "niketon" first if listed first by user!)
    const commaTokens = upazilaLower
      .split(/[,/|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    for (const tok of commaTokens) {
      for (const [areaKey, coords] of SORTED_UPAZILA_AREA_ENTRIES) {
        if (tok === areaKey.toLowerCase() || tok.includes(areaKey.toLowerCase())) {
          if (params.seedKey) {
            const { dLat, dLng } = hashSeedOffset(params.seedKey);
            return { latitude: coords.latitude + dLat, longitude: coords.longitude + dLng };
          }
          return { latitude: coords.latitude, longitude: coords.longitude };
        }
      }
    }
  }

  for (const [areaKey, coords] of SORTED_UPAZILA_AREA_ENTRIES) {
    if (combinedText.includes(areaKey.toLowerCase())) {
      if (params.seedKey) {
        const { dLat, dLng } = hashSeedOffset(params.seedKey);
        return { latitude: coords.latitude + dLat, longitude: coords.longitude + dLng };
      }
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
  }

  // 2. Check exact or substring district match (supports বাংলা & English)
  const rawDist = (params.district || '').trim();
  const direct =
    NORMALIZED_GEO_LOOKUP.get(rawDist.toLowerCase()) ||
    NORMALIZED_GEO_LOOKUP.get(rawDist);
  if (direct) {
    if (params.seedKey) {
      const { dLat, dLng } = hashSeedOffset(params.seedKey);
      return { latitude: direct.latitude + dLat, longitude: direct.longitude + dLng };
    }
    return direct;
  }

  for (const d of DISTRICTS) {
    if (
      combinedText.includes(d.id.toLowerCase()) ||
      combinedText.includes(d.nameEn.toLowerCase()) ||
      combinedText.includes(d.nameBn)
    ) {
      const c = DISTRICT_COORDINATES[d.id];
      if (c) {
        if (params.seedKey) {
          const { dLat, dLng } = hashSeedOffset(params.seedKey);
          return { latitude: c.latitude + dLat, longitude: c.longitude + dLng };
        }
        return c;
      }
    }
  }

  // 3. Fallback to division center or central Dhaka
  const divKey = (params.division || 'dhaka').trim().toLowerCase();
  const base =
    DISTRICT_COORDINATES[divKey] ||
    DIVISION_COORDINATES[divKey] ||
    DEFAULT_BANGLADESH_COORDS;

  if (params.seedKey) {
    const { dLat, dLng } = hashSeedOffset(params.seedKey);
    return { latitude: base.latitude + dLat, longitude: base.longitude + dLng };
  }
  return { latitude: base.latitude, longitude: base.longitude };
}

/**
 * Calculate accurate distance in kilometers using the Haversine formula
 */
export function calculateHaversineDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Number(distance.toFixed(1));
}

export function toBengaliDigits(input: string | number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(input)
    .split('')
    .map((char) => (char >= '0' && char <= '9' ? bnDigits[Number(char)] : char))
    .join('');
}

/**
 * Format distance in Bengali or English
 */
export function formatDistance(distanceKm: number, lang: 'bn' | 'en'): string {
  if (lang === 'bn') {
    return `${toBengaliDigits(distanceKm.toFixed(1))} কিমি`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function formatTravelEta(minutes: number, lang: 'bn' | 'en'): string {
  const clamped = Math.max(2, Math.round(minutes));
  if (clamped >= 60) {
    const hrs = Math.floor(clamped / 60);
    const mins = clamped % 60;
    if (lang === 'bn') {
      return mins > 0
        ? `~${toBengaliDigits(hrs)} ঘণ্টা ${toBengaliDigits(mins)} মি.`
        : `~${toBengaliDigits(hrs)} ঘণ্টা`;
    }
    return mins > 0 ? `~${hrs}h ${mins}m` : `~${hrs}h`;
  }
  return lang === 'bn' ? `~${toBengaliDigits(clamped)} মিনিট` : `~${clamped} min`;
}

export interface LivePlaceSuggestion {
  id: string;
  title: string;
  subtitle: string;
  districtId: string;
  coords: Coordinates;
  kind: 'HOSPITAL' | 'AREA' | 'OSM';
}

/**
 * Instant local Bangladesh Hospital & Area suggestions + OpenStreetMap Nominatim BD live search
 */
export function getInstantLocalPlaceSuggestions(
  query: string,
  lang: 'bn' | 'en'
): LivePlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  const out: LivePlaceSuggestion[] = [];

  for (const h of POPULAR_BD_HOSPITALS) {
    if (
      !q ||
      h.nameEn.toLowerCase().includes(q) ||
      h.nameBn.includes(query.trim()) ||
      h.shortLabel.toLowerCase().includes(q) ||
      h.areaEn.toLowerCase().includes(q) ||
      h.areaBn.includes(query.trim()) ||
      h.aliases.some((al) => al.toLowerCase().includes(q) || q.includes(al.toLowerCase()))
    ) {
      out.push({
        id: h.id,
        title: lang === 'bn' ? h.nameBn : h.nameEn,
        subtitle: lang === 'bn' ? h.areaBn : h.areaEn,
        districtId: h.districtId,
        coords: h.coords,
        kind: 'HOSPITAL',
      });
    }
    if (out.length >= 7) break;
  }

  if (q.length >= 2) {
    const seenAreaCoords = new Set<string>();
    for (const [areaKey, info] of Object.entries(UPAZILA_OR_AREA_COORDINATES)) {
      if (areaKey.toLowerCase().includes(q) || query.trim() === areaKey) {
        const sig = `${info.latitude.toFixed(3)}:${info.longitude.toFixed(3)}`;
        if (seenAreaCoords.has(sig)) continue;
        seenAreaCoords.add(sig);
        const distId = info.districtId || 'dhaka';
        const distObj = DISTRICTS.find((d) => d.id === distId);
        const displayArea =
          /^[a-z]/.test(areaKey)
            ? areaKey.charAt(0).toUpperCase() + areaKey.slice(1)
            : areaKey;
        out.push({
          id: `area-${areaKey}`,
          title: displayArea,
          subtitle: lang === 'bn' ? `${distObj?.nameBn || 'ঢাকা'}, বাংলাদেশ` : `${distObj?.nameEn || 'Dhaka'}, Bangladesh`,
          districtId: distId,
          coords: { latitude: info.latitude, longitude: info.longitude },
          kind: 'AREA',
        });
      }
      if (out.length >= 9) break;
    }

    for (const d of DISTRICTS) {
      if (
        d.nameEn.toLowerCase().includes(q) ||
        d.nameBn.includes(query.trim()) ||
        d.id.includes(q)
      ) {
        const c = DISTRICT_COORDINATES[d.id];
        if (c) {
          out.push({
            id: `dist-${d.id}`,
            title: lang === 'bn' ? `${d.nameBn} সদর` : `${d.nameEn} City`,
            subtitle: lang === 'bn' ? 'বাংলাদেশ' : 'Bangladesh',
            districtId: d.id,
            coords: c,
            kind: 'AREA',
          });
        }
      }
      if (out.length >= 11) break;
    }
  }

  return out;
}

export async function searchBangladeshPlacesLive(
  query: string,
  lang: 'bn' | 'en',
  signal?: AbortSignal
): Promise<LivePlaceSuggestion[]> {
  const local = getInstantLocalPlaceSuggestions(query, lang);
  const trimmed = query.trim();
  if (trimmed.length < 3 || typeof fetch === 'undefined') {
    return local;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=bd&limit=5&accept-language=${
      lang === 'bn' ? 'bn,en' : 'en'
    }&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return local;
    const rows = await res.json();
    if (!Array.isArray(rows)) return local;

    const remote: LivePlaceSuggestion[] = [];
    for (const item of rows) {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const parts = String(item.display_name || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const title = parts[0] || trimmed;
      const subtitle = parts.slice(1, 3).join(', ') || 'Bangladesh';
      const nearestDist = findNearestDistrictFromCoords({ latitude: lat, longitude: lon });
      const duplicate = local.some(
        (l) => calculateHaversineDistance(l.coords, { latitude: lat, longitude: lon }) < 0.35
      );
      if (!duplicate) {
        remote.push({
          id: `osm-${item.place_id || `${lat}-${lon}`}`,
          title,
          subtitle,
          districtId: nearestDist.districtId,
          coords: { latitude: lat, longitude: lon },
          kind: 'OSM',
        });
      }
    }
    return [...local, ...remote].slice(0, 10);
  } catch {
    return local;
  }
}

export interface UberStyleRouteResult {
  points: [number, number][];
  roadDistanceKm: number;
  etaMinutes: number;
  isRealRoadGeometry: boolean;
}

function buildCurvedFallbackPoints(origin: Coordinates, dest: Coordinates): [number, number][] {
  const steps = 16;
  const pts: [number, number][] = [];
  const dLat = dest.latitude - origin.latitude;
  const dLng = dest.longitude - origin.longitude;
  // Subtle perpendicular arc so the fallback line looks like a clean Uber/Pathao path
  const perpLat = -dLng * 0.1;
  const perpLng = dLat * 0.1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arc = Math.sin(Math.PI * t);
    pts.push([
      origin.latitude + dLat * t + perpLat * arc,
      origin.longitude + dLng * t + perpLng * arc,
    ]);
  }
  return pts;
}

/**
 * Fetches real street-by-street driving route & ETA via OSRM with instant curved city-speed fallback
 */
export async function fetchUberStyleRoute(
  origin: Coordinates,
  dest: Coordinates,
  signal?: AbortSignal
): Promise<UberStyleRouteResult> {
  const straightKm = calculateHaversineDistance(origin, dest);
  const estRoadKm = Number(Math.max(0.2, straightKm * 1.26).toFixed(1));
  // Realistic Dhaka / Bangladesh urban emergency travel speed (~20 km/h in city, ~42 km/h intercity)
  const avgSpeedKmh = estRoadKm <= 15 ? 20 : 40;
  const fallbackEta = Math.max(3, Math.round((estRoadKm / avgSpeedKmh) * 60 + 2));

  if (straightKm < 0.08 || typeof fetch === 'undefined') {
    return {
      points: [
        [origin.latitude, origin.longitude],
        [dest.latitude, dest.longitude],
      ],
      roadDistanceKm: estRoadKm,
      etaMinutes: 2,
      isRealRoadGeometry: false,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2600);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const points: [number, number][] = coords.map((pair: [number, number]) => [
          pair[1],
          pair[0],
        ]);
        const roadKm = Number(Math.max(0.2, (route.distance || 0) / 1000).toFixed(1));
        // Adjust OSRM free-flow duration by 1.35x for realistic Bangladesh city traffic
        const rawMinutes = ((route.duration || 0) / 60) * 1.35;
        const etaMinutes = Math.max(3, Math.round(rawMinutes));
        return {
          points,
          roadDistanceKm: roadKm,
          etaMinutes,
          isRealRoadGeometry: true,
        };
      }
    }
  } catch {
    // Fall through cleanly to curved geodesic fallback
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  return {
    points: buildCurvedFallbackPoints(origin, dest),
    roadDistanceKm: estRoadKm,
    etaMinutes: fallbackEta,
    isRealRoadGeometry: false,
  };
}

let cachedDeviceCoords: Coordinates | null = null;
let cachedIsRealGps = false;
let pendingGpsPromise: Promise<Coordinates> | null = null;

function isWithinBangladeshBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 20.3 &&
    lat <= 26.8 &&
    lng >= 88.0 &&
    lng <= 92.8
  );
}

function getSavedUserFallbackCoords(): Coordinates | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('bloodsearch_current_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.upazila || parsed.district)) {
      return resolveBangladeshCoordinates({
        district: parsed.district,
        upazila: parsed.upazila,
        division: parsed.division,
      });
    }
  } catch {}
  return null;
}

export function clearCachedDeviceGps(): void {
  cachedDeviceCoords = null;
  cachedIsRealGps = false;
  pendingGpsPromise = null;
}

async function resolveBangladeshNetworkLocationFallback(): Promise<{
  coords: Coordinates;
  source: 'SAVED_PROFILE' | 'DEFAULT_DHAKA';
}> {
  const savedCoords = getSavedUserFallbackCoords();
  if (savedCoords) {
    return { coords: savedCoords, source: 'SAVED_PROFILE' };
  }
  return { coords: DEFAULT_BANGLADESH_COORDS, source: 'DEFAULT_DHAKA' };
}

async function getGeolocationPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unsupported';
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        return status.state;
      }
    }
  } catch {
    // Permissions API unavailable in some WebViews — treat as 'prompt'
  }
  return 'prompt';
}

/**
 * Request real-time GPS coordinates from device with honest status tracking.
 * By default (`onlyIfGranted: true`), passive mount checks NEVER trigger unsolicited permission
 * popups or browser console warnings when geolocation is blocked/ungranted.
 */
export function requestRealDeviceGPS(options?: { onlyIfGranted?: boolean }): Promise<Coordinates> {
  const onlyIfGranted = options?.onlyIfGranted !== false;

  if (cachedIsRealGps && cachedDeviceCoords) {
    return Promise.resolve(cachedDeviceCoords);
  }
  if (pendingGpsPromise) {
    return pendingGpsPromise;
  }

  pendingGpsPromise = (async () => {
    const fallbackWithNetwork = async (): Promise<Coordinates> => {
      const net = await resolveBangladeshNetworkLocationFallback();
      cachedDeviceCoords = net.coords;
      cachedIsRealGps = false;
      pendingGpsPromise = null;
      return net.coords;
    };

    const permState = await getGeolocationPermissionState();
    if (
      permState === 'unsupported' ||
      permState === 'denied' ||
      (onlyIfGranted && permState !== 'granted')
    ) {
      return fallbackWithNetwork();
    }

    return new Promise<Coordinates>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const coords = { latitude: lat, longitude: lng };
            cachedDeviceCoords = coords;
            cachedIsRealGps = true;
            pendingGpsPromise = null;
            resolve(coords);
          } else {
            void fallbackWithNetwork().then(resolve);
          }
        },
        () => {
          void fallbackWithNetwork().then(resolve);
        },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 4500 }
      );
    });
  })();

  return pendingGpsPromise;
}

/**
 * Returns both resolved coordinates and honest boolean `isRealGps` (true ONLY when hardware/browser GPS succeeded).
 */
export async function requestRealDeviceGPSWithStatus(options?: {
  onlyIfGranted?: boolean;
}): Promise<{
  coords: Coordinates;
  isRealGps: boolean;
}> {
  const coords = await requestRealDeviceGPS(options);
  return {
    coords,
    isRealGps: cachedIsRealGps,
  };
}

/**
 * Actively requests high-accuracy live GPS when the user explicitly taps "Use My GPS / Locate Me".
 * Checks permission state first so blocked origins return cleanly without browser console warnings.
 */
export async function requestFreshHighAccuracyGPS(): Promise<{
  coords: Coordinates;
  isRealGps: boolean;
  errorReason?: GpsErrorReason;
}> {
  const fallbackWithoutFakeGps = async (reason?: GpsErrorReason) => {
    const net = await resolveBangladeshNetworkLocationFallback();
    cachedDeviceCoords = net.coords;
    cachedIsRealGps = false;
    return {
      coords: net.coords,
      isRealGps: false,
      errorReason: reason,
    };
  };

  const permState = await getGeolocationPermissionState();
  if (permState === 'unsupported') {
    return fallbackWithoutFakeGps('UNSUPPORTED');
  }
  if (permState === 'denied') {
    return fallbackWithoutFakeGps('PERMISSION_DENIED');
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        cachedDeviceCoords = coords;
        cachedIsRealGps = true;
        resolve({ coords, isRealGps: true });
      },
      (err) => {
        if (err.code === 1) {
          void fallbackWithoutFakeGps('PERMISSION_DENIED').then(resolve);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            const coords = {
              latitude: pos2.coords.latitude,
              longitude: pos2.coords.longitude,
            };
            cachedDeviceCoords = coords;
            cachedIsRealGps = true;
            resolve({ coords, isRealGps: true });
          },
          (err2) => {
            const reason: GpsErrorReason =
              err2.code === 1 || err.code === 1
                ? 'PERMISSION_DENIED'
                : err2.code === 3
                  ? 'TIMEOUT'
                  : 'POSITION_UNAVAILABLE';
            void fallbackWithoutFakeGps(reason).then(resolve);
          },
          { enableHighAccuracy: false, maximumAge: 180000, timeout: 4000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
  });
}

/**
 * Starts continuous Uber/Pathao-style live GPS tracking (`watchPosition`) and returns a cleanup function.
 * Checks Permissions API first so denied/ungranted origins never log blocked geolocation console warnings.
 */
export function watchRealDeviceGPS(
  onUpdate: (coords: Coordinates) => void,
  onError?: (reason: GpsErrorReason) => void,
  options?: { onlyIfGranted?: boolean }
): () => void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onError?.('UNSUPPORTED');
    return () => {};
  }

  let cancelled = false;
  let watchId: number | null = null;
  const onlyIfGranted = options?.onlyIfGranted === true;

  void getGeolocationPermissionState().then((permState) => {
    if (cancelled) return;
    if (permState === 'unsupported') {
      onError?.('UNSUPPORTED');
      return;
    }
    if (permState === 'denied') {
      onError?.('PERMISSION_DENIED');
      return;
    }
    if (onlyIfGranted && permState !== 'granted') {
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        cachedDeviceCoords = coords;
        cachedIsRealGps = true;
        onUpdate(coords);
      },
      (err) => {
        if (cancelled) return;
        const reason: GpsErrorReason =
          err.code === 1
            ? 'PERMISSION_DENIED'
            : err.code === 3
              ? 'TIMEOUT'
              : 'POSITION_UNAVAILABLE';
        onError?.(reason);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
  });

  return () => {
    cancelled = true;
    if (watchId !== null) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    }
  };
}

