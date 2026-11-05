import React, { useState } from 'react';
import { Language } from '../../types';
import { DIVISIONS } from '../../data/bangladeshGeo';
import {
  Building2,
  Phone,
  MapPin,
  Search,
  X,
  ShieldCheck,
  Ambulance,
  HeartPulse,
  Droplet,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

interface BloodBankOrg {
  id: string;
  nameBn: string;
  nameEn: string;
  divisionId: string;
  locationBn: string;
  locationEn: string;
  phone: string;
  altPhone?: string;
  type: 'BLOOD_BANK' | 'AMBULANCE';
  timing: string;
  verified: boolean;
}

const EMERGENCY_ORGANIZATIONS: BloodBankOrg[] = [
  // ================= DHAKA DIVISION =================
  {
    id: 'org-1',
    nameBn: 'বাংলাদেশ রেড ক্রিসেন্ট জাতীয় রক্ত কেন্দ্র',
    nameEn: 'Bangladesh Red Crescent National Blood Center',
    divisionId: 'dhaka',
    locationBn: '৭/৫ ঔরঙ্গজেব রোড, মোহাম্মদপুর, ঢাকা',
    locationEn: '7/5 Aurangzeb Road, Mohammadpur, Dhaka',
    phone: '02-9116563',
    altPhone: '+8801811458524',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-2',
    nameBn: 'কোয়ান্টাম রক্তদান ল্যাব ও ব্যাংক (শান্তিনগর)',
    nameEn: 'Quantum Blood Lab & Bank (Shantinagar)',
    divisionId: 'dhaka',
    locationBn: '৩১/ভি, শিল্পাচার্য জয়নুল আবেদিন সড়ক, শান্তিনগর, ঢাকা',
    locationEn: '31/V Shantinagar, Dhaka',
    phone: '01714-010869',
    altPhone: '02-9351969',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-3',
    nameBn: 'সন্ধানী (ঢাকা মেডিকেল কলেজ হাসপাতাল ইউনিট)',
    nameEn: 'Sandhani (DMCH Central Unit)',
    divisionId: 'dhaka',
    locationBn: 'ঢাকা মেডিকেল কলেজ হাসপাতাল কম্পাউন্ড, শাহবাগ, ঢাকা',
    locationEn: 'DMCH Compound, Shahbagh, Dhaka',
    phone: '02-9668690',
    altPhone: '02-55165088',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-4',
    nameBn: 'বাঁধন (কেন্দ্রীয় কার্যালয়, টিএসসি)',
    nameEn: 'Badhan (Central Office, DU TSC)',
    divisionId: 'dhaka',
    locationBn: 'টিএসসি (নিচতলা), ঢাকা বিশ্ববিদ্যালয়, ঢাকা',
    locationEn: 'TSC Ground Floor, Dhaka University',
    phone: '01534-982674',
    altPhone: '02-9667788',
    type: 'BLOOD_BANK',
    timing: 'সকাল ৯:০০ - রাত ৯:০০',
    verified: true,
  },
  {
    id: 'org-5',
    nameBn: 'কেন্দ্রীয় পুলিশ ব্লাড ব্যাংক (রাজারবাগ)',
    nameEn: 'Central Police Blood Bank (Rajarbagh)',
    divisionId: 'dhaka',
    locationBn: 'কেন্দ্রীয় পুলিশ হাসপাতাল, রাজারবাগ, ঢাকা',
    locationEn: 'Central Police Hospital, Rajarbagh, Dhaka',
    phone: '01713-398386',
    altPhone: '02-9362573',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-6',
    nameBn: 'বিএসএমএমইউ রক্ত সঞ্চালন বিভাগ (পিজি হাসপাতাল)',
    nameEn: 'BSMMU Transfusion Medicine Department',
    divisionId: 'dhaka',
    locationBn: 'শাহবাগ মোড়, ঢাকা',
    locationEn: 'Shahbagh, Dhaka',
    phone: '02-9661051',
    altPhone: '02-55165760',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-7',
    nameBn: 'জাতীয় হৃদরোগ ইনস্টিটিউট ব্লাড ব্যাংক (NICVD)',
    nameEn: 'National Heart Institute Blood Bank (NICVD)',
    divisionId: 'dhaka',
    locationBn: 'শের-ই-বাংলা নগর, আগারগাঁও, ঢাকা',
    locationEn: 'Sher-e-Bangla Nagar, Dhaka',
    phone: '02-9122560',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি কার্ডিয়াক রক্ত সেবা',
    verified: true,
  },
  {
    id: 'org-8',
    nameBn: 'জাতীয় বার্ন ও প্লাস্টিক সার্জারি ইনস্টিটিউট ব্লাড ব্যাংক',
    nameEn: 'National Institute of Burn & Plastic Surgery Blood Bank',
    divisionId: 'dhaka',
    locationBn: 'চাঁনখারপুল, ঢাকা',
    locationEn: 'Chankharpul, Dhaka',
    phone: '02-47651200',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা প্লাজমা ও রক্ত সেবা',
    verified: true,
  },
  {
    id: 'org-9',
    nameBn: 'বাংলাদেশ থ্যালাসেমিয়া ফাউন্ডেশন ব্লাড ব্যাংক',
    nameEn: 'Bangladesh Thalassemia Foundation Blood Bank',
    divisionId: 'dhaka',
    locationBn: '৩০ চামেলীবাগ, শান্তিনগর, ঢাকা',
    locationEn: '30 Chamelibagh, Shantinagar, Dhaka',
    phone: '02-48316116',
    altPhone: '01755-587479',
    type: 'BLOOD_BANK',
    timing: 'সকাল ৮:০০ - রাত ১০:০০',
    verified: true,
  },
  {
    id: 'org-10',
    nameBn: 'শহীদ তাজউদ্দীন আহমদ মেডিকেল ব্লাড ব্যাংক, গাজীপুর',
    nameEn: 'Shaheed Tajuddin Ahmad Medical Blood Bank, Gazipur',
    divisionId: 'dhaka',
    locationBn: 'জয়দেবপুর হাসপাতাল রোড, গাজীপুর',
    locationEn: 'Joydebpur, Gazipur',
    phone: '02-9263532',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },

  // ================= CHITTAGONG DIVISION =================
  {
    id: 'org-11',
    nameBn: 'রেড ক্রিসেন্ট ফাতেমা বেগম ব্লাড সেন্টার, চট্টগ্রাম',
    nameEn: 'Red Crescent Blood Center, Chittagong',
    divisionId: 'chittagong',
    locationBn: '৩৯৫ আন্দরকিল্লা, চট্টগ্রাম',
    locationEn: '395 Anderkilla, Chittagong',
    phone: '031-616335',
    altPhone: '+8801819385623',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-12',
    nameBn: 'সন্ধানী (চট্টগ্রাম মেডিকেল কলেজ ইউনিট)',
    nameEn: 'Sandhani (CMCH Unit, Chittagong)',
    divisionId: 'chittagong',
    locationBn: 'কে বি ফজলুল কাদের রোড, পাঁচলাইশ, চট্টগ্রাম',
    locationEn: 'KB Fazlul Kader Road, Chittagong',
    phone: '031-616891',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-13',
    nameBn: 'কুমিল্লা মেডিকেল কলেজ রক্ত সঞ্চালন কেন্দ্র (সন্ধানী)',
    nameEn: 'Cumilla Medical College Transfusion Unit',
    divisionId: 'chittagong',
    locationBn: 'কুচাইতলী, কুমিল্লা সদর, কুমিল্লা',
    locationEn: 'Kuchaitoli, Cumilla',
    phone: '081-76402',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-14',
    nameBn: 'কক্সবাজার সদর হাসপাতাল ব্লাড ব্যাংক',
    nameEn: 'Coxs Bazar District Sadar Hospital Blood Bank',
    divisionId: 'chittagong',
    locationBn: 'হাসপাতাল সড়ক, কক্সবাজার সদর',
    locationEn: 'Hospital Road, Coxs Bazar',
    phone: '0341-64066',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },

  // ================= RAJSHAHI DIVISION =================
  {
    id: 'org-15',
    nameBn: 'রেড ক্রিসেন্ট ব্লাড সেন্টার, রাজশাহী',
    nameEn: 'Red Crescent Blood Center, Rajshahi',
    divisionId: 'rajshahi',
    locationBn: 'লক্ষ্মীপুর মোড়, রাজশাহী সদর',
    locationEn: 'Laxmipur Mor, Rajshahi',
    phone: '0721-772186',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },
  {
    id: 'org-16',
    nameBn: 'সন্ধানী (রাজশাহী মেডিকেল কলেজ হাসপাতাল ইউনিট)',
    nameEn: 'Sandhani (RMCH Unit, Rajshahi)',
    divisionId: 'rajshahi',
    locationBn: 'লক্ষ্মীপুর, রাজশাহী মেডিকেল কলেজ হাসপাতাল',
    locationEn: 'RMCH Campus, Rajshahi',
    phone: '0721-772150',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-17',
    nameBn: 'শহীদ জিয়াউর রহমান মেডিকেল কলেজ ব্লাড ব্যাংক, বগুড়া',
    nameEn: 'SZMC Hospital Transfusion Unit, Bogura',
    divisionId: 'rajshahi',
    locationBn: 'ছিলিমপুর, বগুড়া সদর, বগুড়া',
    locationEn: 'Silimpur, Bogura',
    phone: '051-69965',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },

  // ================= KHULNA DIVISION =================
  {
    id: 'org-18',
    nameBn: 'সন্ধানী (খুলনা মেডিকেল কলেজ হাসপাতাল ইউনিট)',
    nameEn: 'Sandhani (KMC Unit, Khulna)',
    divisionId: 'khulna',
    locationBn: 'বয়রা, খুলনা সদর, খুলনা',
    locationEn: 'Boyra, Khulna',
    phone: '041-760350',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-19',
    nameBn: 'রেড ক্রিসেন্ট ব্লাড ব্যাংক, যশোর',
    nameEn: 'Red Crescent Blood Center, Jashore',
    divisionId: 'khulna',
    locationBn: 'মুন্সী মেহেরুল্লাহ রোড, যশোর সদর',
    locationEn: 'Munshi Meherullah Road, Jashore',
    phone: '0421-68755',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },

  // ================= SYLHET DIVISION =================
  {
    id: 'org-20',
    nameBn: 'মুজিব-জাহান রেড ক্রিসেন্ট ব্লাড ব্যাংক, সিলেট',
    nameEn: 'Mujib-Jahan Red Crescent Blood Center, Sylhet',
    divisionId: 'sylhet',
    locationBn: 'চৌহাট্টা, সিলেট সদর, সিলেট',
    locationEn: 'Chouhatta, Sylhet',
    phone: '0821-714989',
    altPhone: '01711-947933',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা',
    verified: true,
  },
  {
    id: 'org-21',
    nameBn: 'সন্ধানী (সিলেট এমএজি ওসমানী মেডিকেল কলেজ ইউনিট)',
    nameEn: 'Sandhani (SOMCH Unit, Sylhet)',
    divisionId: 'sylhet',
    locationBn: 'মেডিকেল রোড, কাজলশাহ, সিলেট',
    locationEn: 'Kajolshah, Sylhet',
    phone: '0821-713487',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },

  // ================= BARISAL DIVISION =================
  {
    id: 'org-22',
    nameBn: 'শের-ই-বাংলা মেডিকেল কলেজ রক্ত সঞ্চালন ও সন্ধানী, বরিশাল',
    nameEn: 'Sher-e-Bangla Medical College (SBMCH) Blood Bank, Barisal',
    divisionId: 'barisal',
    locationBn: 'বান্দ রোড, বরিশাল সদর, বরিশাল',
    locationEn: 'Band Road, Barisal',
    phone: '0431-2173547',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },
  {
    id: 'org-23',
    nameBn: 'রেড ক্রিসেন্ট ব্লাড সেন্টার, বরিশাল',
    nameEn: 'Red Crescent Blood Center, Barisal',
    divisionId: 'barisal',
    locationBn: 'আলেকান্দা হাসপাতাল রোড, বরিশাল',
    locationEn: 'Alekanda, Barisal',
    phone: '0431-64399',
    type: 'BLOOD_BANK',
    timing: 'সকাল ৯:০০ - রাত ৯:০০',
    verified: true,
  },

  // ================= RANGPUR DIVISION =================
  {
    id: 'org-24',
    nameBn: 'রংপুর মেডিকেল কলেজ হাসপাতাল ব্লাড ব্যাংক ও সন্ধানী',
    nameEn: 'Rangpur Medical College Hospital Blood Bank & Sandhani',
    divisionId: 'rangpur',
    locationBn: 'ধাপ, জেল রোড, রংপুর সদর',
    locationEn: 'Dhap, Jail Road, Rangpur',
    phone: '0521-62160',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },
  {
    id: 'org-25',
    nameBn: 'এম আব্দুর রহিম মেডিকেল কলেজ ব্লাড ব্যাংক, দিনাজপুর',
    nameEn: 'Dinajpur Medical College Transfusion Center',
    divisionId: 'rangpur',
    locationBn: 'উপশহর, দিনাজপুর সদর, দিনাজপুর',
    locationEn: 'Upashahar, Dinajpur',
    phone: '0531-64787',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা জরুরি সেবা',
    verified: true,
  },

  // ================= MYMENSINGH DIVISION =================
  {
    id: 'org-26',
    nameBn: 'ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল ব্লাড ব্যাংক ও সন্ধানী',
    nameEn: 'Mymensingh Medical College Hospital (MMCH) Blood Bank',
    divisionId: 'mymensingh',
    locationBn: 'চরপাড়া মোড়, ময়মনসিংহ সদর',
    locationEn: 'Charpara, Mymensingh',
    phone: '091-66063',
    type: 'BLOOD_BANK',
    timing: '২৪ ঘণ্টা খোলা (24/7)',
    verified: true,
  },

  // ================= 24/7 EMERGENCY AMBULANCES (NATIONWIDE & DIVISIONAL) =================
  {
    id: 'amb-1',
    nameBn: 'জাতীয় জরুরি সেবা (৯৯৯ অ্যাম্বুলেন্স ডিসপ্যাচ)',
    nameEn: 'National Emergency 999 Ambulance Service',
    divisionId: 'dhaka',
    locationBn: 'সারাদেশে ৬৪ জেলায় জরুরি অ্যাম্বুলেন্স ও পুলিশ সহায়তা',
    locationEn: 'Nationwide 64 Districts (Toll-Free)',
    phone: '999',
    type: 'AMBULANCE',
    timing: 'টোল ফ্রি · ২৪ ঘণ্টা চালু',
    verified: true,
  },
  {
    id: 'amb-2',
    nameBn: 'ফায়ার সার্ভিস ও সিভিল ডিফেন্স রেসকিউ অ্যাম্বুলেন্স',
    nameEn: 'Fire Service & Civil Defence Emergency Ambulance',
    divisionId: 'dhaka',
    locationBn: 'সারাদেশে দুর্ঘটনা ও জরুরি রোগী পরিবহন হটলাইন',
    locationEn: 'Nationwide Emergency Rescue Ambulance',
    phone: '16163',
    altPhone: '02-223355555',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা জরুরি রেসকিউ',
    verified: true,
  },
  {
    id: 'amb-3',
    nameBn: 'স্বাস্থ্য বাতায়ন সরকারি টেলিমেডিসিন ও অ্যাম্বুলেন্স',
    nameEn: 'Shastho Batayon Telemedicine & Ambulance',
    divisionId: 'dhaka',
    locationBn: 'স্বাস্থ্য ও পরিবার কল্যাণ মন্ত্রণালয় (সকল জেলা)',
    locationEn: 'Ministry of Health and Family Welfare',
    phone: '16263',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা ডাক্তার পরামর্শ ও অ্যাম্বুলেন্স',
    verified: true,
  },
  {
    id: 'amb-4',
    nameBn: 'আঞ্জুমান মুফিদুল ইসলাম ফ্রি অ্যাম্বুলেন্স সার্ভিস',
    nameEn: 'Anjuman Mufidul Islam Free Ambulance Service',
    divisionId: 'dhaka',
    locationBn: 'কাকরাইল ও গেন্ডারিয়া, ঢাকা (বিনামূল্যে মানবিক সেবা)',
    locationEn: 'Kakrail, Dhaka',
    phone: '02-9336611',
    altPhone: '01711-854672',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা ফ্রি অ্যাম্বুলেন্স সেবা',
    verified: true,
  },
  {
    id: 'amb-5',
    nameBn: 'রেড ক্রিসেন্ট জাতীয় আইসিইউ ও অক্সিজেন অ্যাম্বুলেন্স',
    nameEn: 'Red Crescent National ICU & Oxygen Ambulance',
    divisionId: 'dhaka',
    locationBn: 'মগবাজার ও মোহাম্মদপুর, ঢাকা (সারাদেশে পরিবহন)',
    locationEn: 'Moghbazar, Dhaka & Nationwide',
    phone: '02-9330188',
    altPhone: '01811-458542',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা অক্সিজেন ও আইসিইউ সাপোর্ট',
    verified: true,
  },
  {
    id: 'amb-6',
    nameBn: 'আল-মারকাজুল ইসলামী অ্যাম্বুলেন্স ও ফ্রিজিং ভ্যান',
    nameEn: 'Al-Markazul Islami Ambulance & Freezing Service',
    divisionId: 'dhaka',
    locationBn: 'শ্যামলী ও মোহাম্মদপুর, ঢাকা',
    locationEn: 'Shyamoli, Dhaka',
    phone: '02-9127867',
    altPhone: '01711-828555',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা রোগী ও ফ্রিজিং ভ্যান',
    verified: true,
  },
  {
    id: 'amb-7',
    nameBn: 'চট্টগ্রাম মেডিকেল জরুরি অ্যাম্বুলেন্স কন্ট্রোল',
    nameEn: 'Chittagong Emergency Ambulance Control',
    divisionId: 'chittagong',
    locationBn: 'পাঁচলাইশ ও আন্দরকিল্লা, চট্টগ্রাম',
    locationEn: 'Panchlaish, Chittagong',
    phone: '031-619599',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা চালু',
    verified: true,
  },
  {
    id: 'amb-8',
    nameBn: 'সিলেট ওসমানী জরুরি অ্যাম্বুলেন্স সার্ভিস',
    nameEn: 'Sylhet Emergency Ambulance Dispatch',
    divisionId: 'sylhet',
    locationBn: 'কাজলশাহ ও চৌহাট্টা, সিলেট',
    locationEn: 'Kajolshah, Sylhet',
    phone: '0821-713667',
    type: 'AMBULANCE',
    timing: '২৪ ঘণ্টা চালু',
    verified: true,
  },
];

interface EmergencyDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const EmergencyDirectoryModal: React.FC<EmergencyDirectoryModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'BLOOD_BANK' | 'AMBULANCE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredOrgs = EMERGENCY_ORGANIZATIONS.filter((org) => {
    if (selectedDivision !== 'ALL' && org.divisionId !== selectedDivision) return false;
    if (selectedType !== 'ALL' && org.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName =
        org.nameBn.toLowerCase().includes(q) || org.nameEn.toLowerCase().includes(q);
      const matchLoc =
        org.locationBn.toLowerCase().includes(q) || org.locationEn.toLowerCase().includes(q);
      const matchPhone = org.phone.includes(q) || (org.altPhone && org.altPhone.includes(q));
      if (!matchName && !matchLoc && !matchPhone) return false;
    }
    return true;
  });

  const handleCopyNumber = (id: string, phone: string) => {
    navigator.clipboard.writeText(phone).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-2xl my-2 sm:my-auto rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-all text-left space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
                {lang === 'bn'
                  ? '৮ বিভাগীয় ব্লাড ব্যাংক, মেডিকেল ও ২৪/৭ অ্যাম্বুলেন্স হাব'
                  : '8-Division Blood Banks, Medical Colleges & 24/7 Ambulance Hub'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? `${EMERGENCY_ORGANIZATIONS.length}টি ভেরিফাইড সরকারি মেডিকেল, রেড ক্রিসেন্ট, সন্ধানী ও অ্যাম্বুলেন্স হটলাইন`
                  : `${EMERGENCY_ORGANIZATIONS.length} verified blood banks, medical transfusion units & dispatch lines`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instant National Emergency Strip */}
        <div className="grid grid-cols-3 gap-2">
          <a
            href="tel:999"
            className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-center justify-between gap-1.5 text-red-700 dark:text-red-300 font-bold text-xs"
          >
            <span>🚨 জরুরি ৯৯৯</span>
            <Phone className="w-3.5 h-3.5 shrink-0" />
          </a>
          <a
            href="tel:16163"
            className="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-1.5 text-amber-800 dark:text-amber-300 font-bold text-xs"
          >
            <span>🚑 ফায়ার ১৬১৬৩</span>
            <Phone className="w-3.5 h-3.5 shrink-0" />
          </a>
          <a
            href="tel:16263"
            className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-xs"
          >
            <span>🩺 স্বাস্থ্য ১৬২৬৩</span>
            <Phone className="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>

        {/* Filter Bar */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              name="directorySearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'ব্লাড ব্যাংক, মেডিকেল কলেজ, জেলা বা নম্বর দিয়ে খুঁজুন...'
                  : 'Search blood bank, medical college, city, or phone...'
              }
              className="w-full h-10 pl-9 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0f172a] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSelectedType('ALL')}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedType === 'ALL'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'bn' ? `সব (${filteredOrgs.length})` : `All (${filteredOrgs.length})`}
              </button>
              <button
                onClick={() => setSelectedType('BLOOD_BANK')}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  selectedType === 'BLOOD_BANK'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Droplet className="w-3 h-3" />
                <span>{lang === 'bn' ? 'ব্লাড ব্যাংক' : 'Blood Bank'}</span>
              </button>
              <button
                onClick={() => setSelectedType('AMBULANCE')}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  selectedType === 'AMBULANCE'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Ambulance className="w-3 h-3" />
                <span>{lang === 'bn' ? 'অ্যাম্বুলেন্স' : 'Ambulance'}</span>
              </button>
            </div>

            <select
              name="directoryDivision"
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="h-9 px-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">{lang === 'bn' ? 'সকল ৮ বিভাগ' : 'All 8 Divisions'}</option>
              {DIVISIONS.map((div) => (
                <option key={div.id} value={div.id}>
                  {lang === 'bn' ? div.nameBn : div.nameEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Directory List */}
        <div className="space-y-3 max-h-[54vh] overflow-y-auto modal-scroll-contain pr-1">
          {filteredOrgs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              {lang === 'bn'
                ? 'কোনো ব্লাড ব্যাংক বা হটলাইন পাওয়া যায়নি'
                : 'No emergency centers found matching your search.'}
            </div>
          ) : (
            filteredOrgs.map((org) => {
              const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${org.nameEn} ${org.locationEn}`
              )}`;
              const waShareHref = `https://wa.me/?text=${encodeURIComponent(
                `${org.nameBn}\nঠিকানা: ${org.locationBn}\nজরুরি ফোন: ${org.phone}${
                  org.altPhone ? `, ${org.altPhone}` : ''
                }\nসময়: ${org.timing}`
              )}`;

              return (
                <div
                  key={org.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700/80 shadow-xs hover:border-rose-400 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold ${
                          org.type === 'AMBULANCE' ? 'bg-amber-500' : 'bg-rose-600'
                        }`}
                      >
                        {org.type === 'AMBULANCE' ? (
                          <Ambulance className="w-4 h-4" />
                        ) : (
                          <HeartPulse className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight">
                            {lang === 'bn' ? org.nameBn : org.nameEn}
                          </h4>
                          {org.verified && (
                            <span className="text-blue-500 shrink-0" title="অফিসিয়াল কেন্দ্র">
                              <ShieldCheck className="w-3.5 h-3.5 fill-blue-500 text-white" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                            <span>{lang === 'bn' ? org.locationBn : org.locationEn}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            {org.timing}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4-Action Emergency Bar: Call, Copy, WhatsApp Share, Google Maps */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                      {org.phone}
                      {org.altPhone && (
                        <span className="text-slate-400 font-normal ml-1">/ {org.altPhone}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(org.id, org.phone)}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="নম্বর কপি করুন"
                      >
                        {copiedId === org.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedId === org.id ? 'কপি!' : lang === 'bn' ? 'কপি' : 'Copy'}</span>
                      </button>

                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1"
                        title="Google Maps-এ লোকেশন দেখুন"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Map</span>
                      </a>

                      <a
                        href={waShareHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-emerald-500 text-slate-950 text-[11px] font-black flex items-center gap-1"
                        title="রোগীর স্বজনকে WhatsApp-এ পাঠান"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WA</span>
                      </a>

                      <a
                        href={`tel:${org.phone.replace(/[^0-9+]/g, '')}`}
                        className="min-h-[34px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {lang === 'bn'
              ? 'জাতীয় জরুরি প্রয়োজনে ৯৯৯, ১৬১৬৩ (ফায়ার সার্ভিস) বা ১৬২৬৩ ডায়াল করুন'
              : 'Dial 999, 16163 (Fire Rescue) or 16263 for national emergency'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
