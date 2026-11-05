import { useState, useEffect } from 'react';

export interface WhiteLabelBrandConfig {
  brandName: string;
  brandPrimaryWord: string;
  brandSecondaryWord: string;
  tagline: string;
  organizationName: string;
  supportPhone: string;
  supportEmail: string;
  superAdminEmail: string;
  defaultRealOnlyMode: boolean;
}

const STORAGE_KEY = 'bloodsearch_whitelabel_config';
const EVENT_NAME = 'bloodsearch_brand_changed';

function splitBrandWords(fullName: string): { primary: string; secondary: string } {
  const trimmed = fullName.trim() || 'BloodSearch';
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx > 0) {
    return {
      primary: trimmed.slice(0, spaceIdx),
      secondary: trimmed.slice(spaceIdx + 1),
    };
  }
  const camelMatch = trimmed.match(/^([A-Z][a-z]+)(.+)$/);
  if (camelMatch) {
    return {
      primary: camelMatch[1],
      secondary: camelMatch[2],
    };
  }
  return {
    primary: trimmed,
    secondary: '',
  };
}

export function getEnvDefaultBrandConfig(): WhiteLabelBrandConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const rawBrandName = (env.VITE_BRAND_NAME || 'BloodSearch').trim();
  const split = splitBrandWords(rawBrandName);

  return {
    brandName: rawBrandName,
    brandPrimaryWord: split.primary,
    brandSecondaryWord: split.secondary,
    tagline: (env.VITE_BRAND_TAGLINE || 'FIND BLOOD. SAVE LIFE.').trim(),
    organizationName: (env.VITE_ORG_NAME || 'Bangladesh Emergency Blood Network').trim(),
    supportPhone: (env.VITE_SUPPORT_PHONE || '16263').trim(),
    supportEmail: (env.VITE_SUPPORT_EMAIL || 'support@bloodsearch.org').trim(),
    superAdminEmail: (env.VITE_SUPER_ADMIN_EMAIL || 'Authorized Super Owner').trim(),
    defaultRealOnlyMode: env.VITE_DEFAULT_REAL_ONLY_MODE === 'true',
  };
}

export function getBrandConfig(): WhiteLabelBrandConfig {
  const defaults = getEnvDefaultBrandConfig();
  if (typeof window === 'undefined') {
    return defaults;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaults;
    const parsed = JSON.parse(saved) as Partial<WhiteLabelBrandConfig>;
    const brandName = (parsed.brandName || defaults.brandName).trim();
    const split = splitBrandWords(brandName);
    return {
      brandName,
      brandPrimaryWord: parsed.brandPrimaryWord ?? split.primary,
      brandSecondaryWord: parsed.brandSecondaryWord ?? split.secondary,
      tagline: (parsed.tagline || defaults.tagline).trim(),
      organizationName: (parsed.organizationName || defaults.organizationName).trim(),
      supportPhone: (parsed.supportPhone || defaults.supportPhone).trim(),
      supportEmail: (parsed.supportEmail || defaults.supportEmail).trim(),
      superAdminEmail: (parsed.superAdminEmail || defaults.superAdminEmail).trim(),
      defaultRealOnlyMode:
        typeof parsed.defaultRealOnlyMode === 'boolean'
          ? parsed.defaultRealOnlyMode
          : defaults.defaultRealOnlyMode,
    };
  } catch {
    return defaults;
  }
}

export function saveBrandConfigOverride(next: Partial<WhiteLabelBrandConfig>): WhiteLabelBrandConfig {
  const current = getBrandConfig();
  const mergedName = (next.brandName ?? current.brandName).trim() || 'BloodSearch';
  const split = splitBrandWords(mergedName);

  const updated: WhiteLabelBrandConfig = {
    ...current,
    ...next,
    brandName: mergedName,
    brandPrimaryWord: next.brandPrimaryWord ?? split.primary,
    brandSecondaryWord: next.brandSecondaryWord ?? split.secondary,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
      // Ignore storage quota errors
    }
  }
  return updated;
}

export function resetBrandConfigOverride(): WhiteLabelBrandConfig {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
      // Ignore storage errors
    }
  }
  return getEnvDefaultBrandConfig();
}

export function useBrandConfig(): WhiteLabelBrandConfig {
  const [config, setConfig] = useState<WhiteLabelBrandConfig>(() => getBrandConfig());

  useEffect(() => {
    const sync = () => setConfig(getBrandConfig());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return config;
}

export interface BrandPresetItem {
  id: string;
  labelBn: string;
  labelEn: string;
  audienceBn: string;
  audienceEn: string;
  config: Omit<WhiteLabelBrandConfig, 'superAdminEmail'>;
}

export const COMMERCIAL_BRAND_PRESETS: BrandPresetItem[] = [
  {
    id: 'default',
    labelBn: 'BloodSearch (ডিফল্ট প্রোডাক্ট)',
    labelEn: 'BloodSearch (Default Flagship)',
    audienceBn: 'জাতীয় জরুরি রক্তদাতা নেটওয়ার্ক',
    audienceEn: 'National Emergency Donor Network',
    config: {
      brandName: 'BloodSearch',
      brandPrimaryWord: 'Blood',
      brandSecondaryWord: 'Search',
      tagline: 'FIND BLOOD. SAVE LIFE.',
      organizationName: 'Bangladesh Emergency Blood Network',
      supportPhone: '16263',
      supportEmail: 'support@bloodsearch.org',
      defaultRealOnlyMode: false,
    },
  },
  {
    id: 'hospital',
    labelBn: 'হাসপাতাল ও ব্লাড ব্যাংক সংস্করণ',
    labelEn: 'Hospital & Blood Bank Edition',
    audienceBn: 'প্রাইভেট হাসপাতাল, ক্লিনিক ও ডায়াগনস্টিক সেন্টার',
    audienceEn: 'Private Hospitals, Clinics & Transfusion Centers',
    config: {
      brandName: 'MediDrop Bank',
      brandPrimaryWord: 'MediDrop',
      brandSecondaryWord: 'Bank',
      tagline: '24/7 CLINICAL BLOOD DISPATCH',
      organizationName: 'City Central Hospital Transfusion Unit',
      supportPhone: '+8801700000000',
      supportEmail: 'bloodbank@cityhospital.com',
      defaultRealOnlyMode: true,
    },
  },
  {
    id: 'foundation',
    labelBn: 'ফাউন্ডেশন ও বিশ্ববিদ্যালয় ক্লাব',
    labelEn: 'Foundation & University Club',
    audienceBn: 'স্বেচ্ছাসেবী রক্তদান সংগঠন, এনজিও ও ক্যাম্পাস ক্লাব',
    audienceEn: 'Non-Profit Foundations, Youth Clubs & NGOs',
    config: {
      brandName: 'LifePulse BD',
      brandPrimaryWord: 'LifePulse',
      brandSecondaryWord: 'BD',
      tagline: 'COMMUNITY DONOR NETWORK',
      organizationName: 'LifePulse Voluntary Blood Foundation',
      supportPhone: '+8801800000000',
      supportEmail: 'helpdesk@lifepulsebd.org',
      defaultRealOnlyMode: false,
    },
  },
];
