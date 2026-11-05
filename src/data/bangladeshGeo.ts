export interface DistrictInfo {
  id: string;
  nameEn: string;
  nameBn: string;
  divisionId: string;
  upazilas: { id: string; nameEn: string; nameBn: string }[];
}

export interface DivisionInfo {
  id: string;
  nameEn: string;
  nameBn: string;
}

export const DIVISIONS: DivisionInfo[] = [
  { id: 'dhaka', nameEn: 'Dhaka', nameBn: 'ঢাকা' },
  { id: 'chattogram', nameEn: 'Chattogram', nameBn: 'চট্টগ্রাম' },
  { id: 'rajshahi', nameEn: 'Rajshahi', nameBn: 'রাজশাহী' },
  { id: 'khulna', nameEn: 'Khulna', nameBn: 'খুলনা' },
  { id: 'barishal', nameEn: 'Barishal', nameBn: 'বরিশাল' },
  { id: 'sylhet', nameEn: 'Sylhet', nameBn: 'সিলেট' },
  { id: 'rangpur', nameEn: 'Rangpur', nameBn: 'রংপুর' },
  { id: 'mymensingh', nameEn: 'Mymensingh', nameBn: 'ময়মনসিংহ' },
];

export const DISTRICTS: DistrictInfo[] = [
  // Dhaka Division (13 districts)
  {
    id: 'dhaka',
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    divisionId: 'dhaka',
    upazilas: [
      { id: 'dhanmondi', nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি' },
      { id: 'mirpur', nameEn: 'Mirpur', nameBn: 'মিরপুর' },
      { id: 'gulshan', nameEn: 'Gulshan / Banani', nameBn: 'গুলশান / বনানী' },
      { id: 'uttara', nameEn: 'Uttara', nameBn: 'উত্তরা' },
      { id: 'mohammadpur', nameEn: 'Mohammadpur', nameBn: 'মোহাম্মদপুর' },
      { id: 'motijheel', nameEn: 'Motijheel', nameBn: 'মতিঝিল' },
      { id: 'shahbagh', nameEn: 'Shahbagh / BSMMU', nameBn: 'শাহবাগ / পিজি' },
      { id: 'savar', nameEn: 'Savar', nameBn: 'সাভার' },
      { id: 'keraniganj', nameEn: 'Keraniganj', nameBn: 'কেরানীগঞ্জ' },
    ],
  },
  {
    id: 'gazipur',
    nameEn: 'Gazipur',
    nameBn: 'গাজীপুর',
    divisionId: 'dhaka',
    upazilas: [
      { id: 'gazipur_sadar', nameEn: 'Gazipur Sadar', nameBn: 'গাজীপুর সদর' },
      { id: 'tongie', nameEn: 'Tongi', nameBn: 'টঙ্গী' },
      { id: 'kaliakair', nameEn: 'Kaliakair', nameBn: 'কালিয়াকৈর' },
      { id: 'sreepur', nameEn: 'Sreepur', nameBn: 'শ্রীপুর' },
    ],
  },
  {
    id: 'narayanganj',
    nameEn: 'Narayanganj',
    nameBn: 'নারায়ণগঞ্জ',
    divisionId: 'dhaka',
    upazilas: [
      { id: 'narayanganj_sadar', nameEn: 'Narayanganj Sadar', nameBn: 'নারায়ণগঞ্জ সদর' },
      { id: 'fatullah', nameEn: 'Fatullah', nameBn: 'ফতুল্লা' },
      { id: 'sonargaon', nameEn: 'Sonargaon', nameBn: 'সোনারগাঁও' },
      { id: 'rupganj', nameEn: 'Rupganj', nameBn: 'রূপগঞ্জ' },
    ],
  },
  { id: 'tangail', nameEn: 'Tangail', nameBn: 'টাঙ্গাইল', divisionId: 'dhaka', upazilas: [{ id: 'tangail_sadar', nameEn: 'Tangail Sadar', nameBn: 'টাঙ্গাইল সদর' }, { id: 'mirzapur', nameEn: 'Mirzapur', nameBn: 'মির্জাপুর' }] },
  { id: 'faridpur', nameEn: 'Faridpur', nameBn: 'ফরিদপুর', divisionId: 'dhaka', upazilas: [{ id: 'faridpur_sadar', nameEn: 'Faridpur Sadar', nameBn: 'ফরিদপুর সদর' }] },
  { id: 'kishoreganj', nameEn: 'Kishoreganj', nameBn: 'কিশোরগঞ্জ', divisionId: 'dhaka', upazilas: [{ id: 'kishoreganj_sadar', nameEn: 'Kishoreganj Sadar', nameBn: 'কিশোরগঞ্জ সদর' }] },
  { id: 'manikganj', nameEn: 'Manikganj', nameBn: 'মানিকগঞ্জ', divisionId: 'dhaka', upazilas: [{ id: 'manikganj_sadar', nameEn: 'Manikganj Sadar', nameBn: 'মানিকগঞ্জ সদর' }] },
  { id: 'munshiganj', nameEn: 'Munshiganj', nameBn: 'মুন্সীগঞ্জ', divisionId: 'dhaka', upazilas: [{ id: 'munshiganj_sadar', nameEn: 'Munshiganj Sadar', nameBn: 'মুন্সীগঞ্জ সদর' }] },
  { id: 'narsingdi', nameEn: 'Narsingdi', nameBn: 'নরসিংদী', divisionId: 'dhaka', upazilas: [{ id: 'narsingdi_sadar', nameEn: 'Narsingdi Sadar', nameBn: 'নরসিংদী সদর' }] },
  { id: 'gopalganj', nameEn: 'Gopalganj', nameBn: 'গোপালগঞ্জ', divisionId: 'dhaka', upazilas: [{ id: 'gopalganj_sadar', nameEn: 'Gopalganj Sadar', nameBn: 'গোপালগঞ্জ সদর' }] },
  { id: 'madaripur', nameEn: 'Madaripur', nameBn: 'মাদারীপুর', divisionId: 'dhaka', upazilas: [{ id: 'madaripur_sadar', nameEn: 'Madaripur Sadar', nameBn: 'মাদারীপুর সদর' }] },
  { id: 'rajbari', nameEn: 'Rajbari', nameBn: 'রাজবাড়ী', divisionId: 'dhaka', upazilas: [{ id: 'rajbari_sadar', nameEn: 'Rajbari Sadar', nameBn: 'রাজবাড়ী সদর' }] },
  { id: 'shariatpur', nameEn: 'Shariatpur', nameBn: 'শরীয়তপুর', divisionId: 'dhaka', upazilas: [{ id: 'shariatpur_sadar', nameEn: 'Shariatpur Sadar', nameBn: 'শরীয়তপুর সদর' }] },

  // Chattogram Division (11 districts)
  {
    id: 'chattogram',
    nameEn: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    divisionId: 'chattogram',
    upazilas: [
      { id: 'kotwali_ctg', nameEn: 'Kotwali', nameBn: 'কোতোয়ালী' },
      { id: 'panchlaish', nameEn: 'Panchlaish', nameBn: 'পাঁচলাইশ' },
      { id: 'agrabad', nameEn: 'Agrabad', nameBn: 'আগ্রাবাদ' },
      { id: 'halishahar', nameEn: 'Halishahar', nameBn: 'হালিশহর' },
      { id: 'hathazari', nameEn: 'Hathazari', nameBn: 'হাটহাজারী' },
      { id: 'sitakunda', nameEn: 'Sitakunda', nameBn: 'সীতাকুণ্ড' },
    ],
  },
  { id: 'coxs_bazar', nameEn: "Cox's Bazar", nameBn: 'কক্সবাজার', divisionId: 'chattogram', upazilas: [{ id: 'coxs_sadar', nameEn: "Cox's Bazar Sadar", nameBn: 'কক্সবাজার সদর' }] },
  { id: 'cumilla', nameEn: 'Cumilla', nameBn: 'কুমিল্লা', divisionId: 'chattogram', upazilas: [{ id: 'cumilla_sadar', nameEn: 'Cumilla Sadar', nameBn: 'কুমিল্লা সদর' }] },
  { id: 'feni', nameEn: 'Feni', nameBn: 'ফেনী', divisionId: 'chattogram', upazilas: [{ id: 'feni_sadar', nameEn: 'Feni Sadar', nameBn: 'ফেনী সদর' }] },
  { id: 'brahmanbaria', nameEn: 'Brahmanbaria', nameBn: 'ব্রাহ্মণবাড়িয়া', divisionId: 'chattogram', upazilas: [{ id: 'brahmanbaria_sadar', nameEn: 'Brahmanbaria Sadar', nameBn: 'ব্রাহ্মণবাড়িয়া সদর' }] },
  { id: 'chandpur', nameEn: 'Chandpur', nameBn: 'চাঁদপুর', divisionId: 'chattogram', upazilas: [{ id: 'chandpur_sadar', nameEn: 'Chandpur Sadar', nameBn: 'চাঁদপুর সদর' }] },
  { id: 'noakhali', nameEn: 'Noakhali', nameBn: 'নোয়াখালী', divisionId: 'chattogram', upazilas: [{ id: 'noakhali_sadar', nameEn: 'Noakhali Sadar', nameBn: 'নোয়াখালী সদর' }] },
  { id: 'lakshmipur', nameEn: 'Lakshmipur', nameBn: 'লক্ষ্মীপুর', divisionId: 'chattogram', upazilas: [{ id: 'lakshmipur_sadar', nameEn: 'Lakshmipur Sadar', nameBn: 'লক্ষ্মীপুর সদর' }] },
  { id: 'khagrachhari', nameEn: 'Khagrachhari', nameBn: 'খাগড়াছড়ি', divisionId: 'chattogram', upazilas: [{ id: 'khagrachhari_sadar', nameEn: 'Khagrachhari Sadar', nameBn: 'খাগড়াছড়ি সদর' }] },
  { id: 'rangamati', nameEn: 'Rangamati', nameBn: 'রাঙ্গামাটি', divisionId: 'chattogram', upazilas: [{ id: 'rangamati_sadar', nameEn: 'Rangamati Sadar', nameBn: 'রাঙ্গামাটি সদর' }] },
  { id: 'bandarban', nameEn: 'Bandarban', nameBn: 'বান্দরবান', divisionId: 'chattogram', upazilas: [{ id: 'bandarban_sadar', nameEn: 'Bandarban Sadar', nameBn: 'বান্দরবান সদর' }] },

  // Rajshahi Division (8 districts)
  {
    id: 'rajshahi',
    nameEn: 'Rajshahi',
    nameBn: 'রাজশাহী',
    divisionId: 'rajshahi',
    upazilas: [
      { id: 'rajshahi_sadar', nameEn: 'Rajshahi Sadar / Boalia', nameBn: 'বোয়ালিয়া / সদর' },
      { id: 'motihar', nameEn: 'Motihar (RU Campus)', nameBn: 'মতিহার (রাবি ক্যাম্পাস)' },
      { id: 'godagari', nameEn: 'Godagari', nameBn: 'গোদাগাড়ী' },
    ],
  },
  { id: 'bogura', nameEn: 'Bogura', nameBn: 'বগুড়া', divisionId: 'rajshahi', upazilas: [{ id: 'bogura_sadar', nameEn: 'Bogura Sadar', nameBn: 'বগুড়া সদর' }] },
  { id: 'pabna', nameEn: 'Pabna', nameBn: 'পাবনা', divisionId: 'rajshahi', upazilas: [{ id: 'pabna_sadar', nameEn: 'Pabna Sadar', nameBn: 'পাবনা সদর' }] },
  { id: 'sirajganj', nameEn: 'Sirajganj', nameBn: 'সিরাজগঞ্জ', divisionId: 'rajshahi', upazilas: [{ id: 'sirajganj_sadar', nameEn: 'Sirajganj Sadar', nameBn: 'সিরাজগঞ্জ সদর' }] },
  { id: 'natore', nameEn: 'Natore', nameBn: 'নাটোর', divisionId: 'rajshahi', upazilas: [{ id: 'natore_sadar', nameEn: 'Natore Sadar', nameBn: 'নাটোর সদর' }] },
  { id: 'naogaon', nameEn: 'Naogaon', nameBn: 'নওগাঁ', divisionId: 'rajshahi', upazilas: [{ id: 'naogaon_sadar', nameEn: 'Naogaon Sadar', nameBn: 'নওগাঁ সদর' }] },
  { id: 'chapainawabganj', nameEn: 'Chapainawabganj', nameBn: 'চাঁপাইনবাবগঞ্জ', divisionId: 'rajshahi', upazilas: [{ id: 'chapainawabganj_sadar', nameEn: 'Chapainawabganj Sadar', nameBn: 'চাঁপাইনবাবগঞ্জ সদর' }] },
  { id: 'joypurhat', nameEn: 'Joypurhat', nameBn: 'জয়পুরহাট', divisionId: 'rajshahi', upazilas: [{ id: 'joypurhat_sadar', nameEn: 'Joypurhat Sadar', nameBn: 'জয়পুরহাট সদর' }] },

  // Sylhet Division (4 districts)
  {
    id: 'sylhet',
    nameEn: 'Sylhet',
    nameBn: 'সিলেট',
    divisionId: 'sylhet',
    upazilas: [
      { id: 'sylhet_sadar', nameEn: 'Sylhet Sadar / Amberkhana', nameBn: 'সিলেট সদর / আম্বরখানা' },
      { id: 'subidbazar', nameEn: 'Subidbazar / SUST Area', nameBn: 'সুবিদবাজার / শাবিপ্রবি' },
      { id: 'beanibazar', nameEn: 'Beanibazar', nameBn: 'বিয়ানীবাজার' },
      { id: 'golapganj', nameEn: 'Golapganj', nameBn: 'গোলাপগঞ্জ' },
    ],
  },
  { id: 'moulvibazar', nameEn: 'Moulvibazar', nameBn: 'মৌলভীবাজার', divisionId: 'sylhet', upazilas: [{ id: 'moulvibazar_sadar', nameEn: 'Moulvibazar Sadar', nameBn: 'মৌলভীবাজার সদর' }, { id: 'sreemangal', nameEn: 'Sreemangal', nameBn: 'শ্রীমঙ্গল' }] },
  { id: 'habiganj', nameEn: 'Habiganj', nameBn: 'হবিগঞ্জ', divisionId: 'sylhet', upazilas: [{ id: 'habiganj_sadar', nameEn: 'Habiganj Sadar', nameBn: 'হবিগঞ্জ সদর' }] },
  { id: 'sunamganj', nameEn: 'Sunamganj', nameBn: 'সুনামগঞ্জ', divisionId: 'sylhet', upazilas: [{ id: 'sunamganj_sadar', nameEn: 'Sunamganj Sadar', nameBn: 'সুনামগঞ্জ সদর' }] },

  // Khulna Division (10 districts)
  {
    id: 'khulna',
    nameEn: 'Khulna',
    nameBn: 'খুলনা',
    divisionId: 'khulna',
    upazilas: [
      { id: 'khulna_sadar', nameEn: 'Khulna Sadar / Boyra', nameBn: 'খুলনা সদর / বয়রা' },
      { id: 'sonadanga', nameEn: 'Sonadanga', nameBn: 'সোনাডাঙ্গা' },
      { id: 'khalishpur', nameEn: 'Khalishpur', nameBn: 'খালিশপুর' },
    ],
  },
  { id: 'jashore', nameEn: 'Jashore', nameBn: 'যশোর', divisionId: 'khulna', upazilas: [{ id: 'jashore_sadar', nameEn: 'Jashore Sadar', nameBn: 'যশোর সদর' }] },
  { id: 'satkhira', nameEn: 'Satkhira', nameBn: 'সাতক্ষীরা', divisionId: 'khulna', upazilas: [{ id: 'satkhira_sadar', nameEn: 'Satkhira Sadar', nameBn: 'সাতক্ষীরা সদর' }] },
  { id: 'kushtia', nameEn: 'Kushtia', nameBn: 'কুষ্টিয়া', divisionId: 'khulna', upazilas: [{ id: 'kushtia_sadar', nameEn: 'Kushtia Sadar', nameBn: 'কুষ্টিয়া সদর' }] },
  { id: 'jhenaidah', nameEn: 'Jhenaidah', nameBn: 'ঝিনাইদহ', divisionId: 'khulna', upazilas: [{ id: 'jhenaidah_sadar', nameEn: 'Jhenaidah Sadar', nameBn: 'ঝিনাইদহ সদর' }] },
  { id: 'chuadanga', nameEn: 'Chuadanga', nameBn: 'চুয়াডাঙ্গা', divisionId: 'khulna', upazilas: [{ id: 'chuadanga_sadar', nameEn: 'Chuadanga Sadar', nameBn: 'চুয়াডাঙ্গা সদর' }] },
  { id: 'magura', nameEn: 'Magura', nameBn: 'মাগুরা', divisionId: 'khulna', upazilas: [{ id: 'magura_sadar', nameEn: 'Magura Sadar', nameBn: 'মাগুরা সদর' }] },
  { id: 'meherpur', nameEn: 'Meherpur', nameBn: 'মেহেরপুর', divisionId: 'khulna', upazilas: [{ id: 'meherpur_sadar', nameEn: 'Meherpur Sadar', nameBn: 'মেহেরপুর সদর' }] },
  { id: 'narail', nameEn: 'Narail', nameBn: 'নড়াইল', divisionId: 'khulna', upazilas: [{ id: 'narail_sadar', nameEn: 'Narail Sadar', nameBn: 'নড়াইল সদর' }] },
  { id: 'bagerhat', nameEn: 'Bagerhat', nameBn: 'বাগেরহাট', divisionId: 'khulna', upazilas: [{ id: 'bagerhat_sadar', nameEn: 'Bagerhat Sadar', nameBn: 'বাগেরহাট সদর' }] },

  // Barishal Division (6 districts)
  {
    id: 'barishal',
    nameEn: 'Barishal',
    nameBn: 'বরিশাল',
    divisionId: 'barishal',
    upazilas: [{ id: 'barishal_sadar', nameEn: 'Barishal Sadar', nameBn: 'বরিশাল সদর' }, { id: 'rupatali', nameEn: 'Rupatali', nameBn: 'রুপাতলী' }],
  },
  { id: 'patuakhali', nameEn: 'Patuakhali', nameBn: 'পটুয়াখালী', divisionId: 'barishal', upazilas: [{ id: 'patuakhali_sadar', nameEn: 'Patuakhali Sadar', nameBn: 'পটুয়াখালী সদর' }] },
  { id: 'bhola', nameEn: 'Bhola', nameBn: 'ভোলা', divisionId: 'barishal', upazilas: [{ id: 'bhola_sadar', nameEn: 'Bhola Sadar', nameBn: 'ভোলা সদর' }] },
  { id: 'pirojpur', nameEn: 'Pirojpur', nameBn: 'পিরোজপুর', divisionId: 'barishal', upazilas: [{ id: 'pirojpur_sadar', nameEn: 'Pirojpur Sadar', nameBn: 'পিরোজপুর সদর' }] },
  { id: 'barguna', nameEn: 'Barguna', nameBn: 'বরগুনা', divisionId: 'barishal', upazilas: [{ id: 'barguna_sadar', nameEn: 'Barguna Sadar', nameBn: 'বরগুনা সদর' }] },
  { id: 'jhalokati', nameEn: 'Jhalokati', nameBn: 'ঝালকাঠি', divisionId: 'barishal', upazilas: [{ id: 'jhalokati_sadar', nameEn: 'Jhalokati Sadar', nameBn: 'ঝালকাঠি সদর' }] },

  // Rangpur Division (8 districts)
  {
    id: 'rangpur',
    nameEn: 'Rangpur',
    nameBn: 'রংপুর',
    divisionId: 'rangpur',
    upazilas: [{ id: 'rangpur_sadar', nameEn: 'Rangpur Sadar', nameBn: 'রংপুর সদর' }, { id: 'dhap', nameEn: 'Dhap (Medical Area)', nameBn: 'ধাপ (মেডিকেল মোড়)' }],
  },
  { id: 'dinajpur', nameEn: 'Dinajpur', nameBn: 'দিনাজপুর', divisionId: 'rangpur', upazilas: [{ id: 'dinajpur_sadar', nameEn: 'Dinajpur Sadar', nameBn: 'দিনাজপুর সদর' }] },
  { id: 'kurigram', nameEn: 'Kurigram', nameBn: 'কুড়িগ্রাম', divisionId: 'rangpur', upazilas: [{ id: 'kurigram_sadar', nameEn: 'Kurigram Sadar', nameBn: 'কুড়িগ্রাম সদর' }] },
  { id: 'gaibandha', nameEn: 'Gaibandha', nameBn: 'গাইবান্ধা', divisionId: 'rangpur', upazilas: [{ id: 'gaibandha_sadar', nameEn: 'Gaibandha Sadar', nameBn: 'গাইবান্ধা সদর' }] },
  { id: 'nilphamari', nameEn: 'Nilphamari', nameBn: 'নীলফামারী', divisionId: 'rangpur', upazilas: [{ id: 'nilphamari_sadar', nameEn: 'Nilphamari Sadar', nameBn: 'নীলফামারী সদর' }] },
  { id: 'thakurgaon', nameEn: 'Thakurgaon', nameBn: 'ঠাকুরগাঁও', divisionId: 'rangpur', upazilas: [{ id: 'thakurgaon_sadar', nameEn: 'Thakurgaon Sadar', nameBn: 'ঠাকুরগাঁও সদর' }] },
  { id: 'panchagarh', nameEn: 'Panchagarh', nameBn: 'পঞ্চগড়', divisionId: 'rangpur', upazilas: [{ id: 'panchagarh_sadar', nameEn: 'Panchagarh Sadar', nameBn: 'পঞ্চগড় সদর' }] },
  { id: 'lalmonirhat', nameEn: 'Lalmonirhat', nameBn: 'লালমনিরহাট', divisionId: 'rangpur', upazilas: [{ id: 'lalmonirhat_sadar', nameEn: 'Lalmonirhat Sadar', nameBn: 'লালমনিরহাট সদর' }] },

  // Mymensingh Division (4 districts)
  {
    id: 'mymensingh',
    nameEn: 'Mymensingh',
    nameBn: 'ময়মনসিংহ',
    divisionId: 'mymensingh',
    upazilas: [{ id: 'mymensingh_sadar', nameEn: 'Mymensingh Sadar / Charpara', nameBn: 'ময়মনসিংহ সদর / চরপাড়া' }, { id: 'trishal', nameEn: 'Trishal', nameBn: 'ত্রিশাল' }],
  },
  { id: 'jamalpur', nameEn: 'Jamalpur', nameBn: 'জামালপুর', divisionId: 'mymensingh', upazilas: [{ id: 'jamalpur_sadar', nameEn: 'Jamalpur Sadar', nameBn: 'জামালপুর সদর' }] },
  { id: 'netrokona', nameEn: 'Netrokona', nameBn: 'নেত্রকোণা', divisionId: 'mymensingh', upazilas: [{ id: 'netrokona_sadar', nameEn: 'Netrokona Sadar', nameBn: 'নেত্রকোণা সদর' }] },
  { id: 'sherpur', nameEn: 'Sherpur', nameBn: 'শেরপুর', divisionId: 'mymensingh', upazilas: [{ id: 'sherpur_sadar', nameEn: 'Sherpur Sadar', nameBn: 'শেরপুর সদর' }] },
];
