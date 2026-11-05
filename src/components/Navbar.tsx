import React, { useState } from 'react';
import { ActiveTab, Language, PortalMode } from '../types';
import { getTranslation } from '../utils/translations';
import { BrandLogo } from './BrandLogo';
import { 
  HeartHandshake, 
  Search, 
  Flame, 
  Layers, 
  ClipboardCheck, 
  ShieldCheck, 
  Moon, 
  Sun, 
  Smartphone, 
  Monitor, 
  PlusCircle,
  Radio,
  Building2,
  FileCode,
  Users,
  MessageSquare,
  Award,
  User,
  MapPin,
  ChevronDown,
  Shield,
  Droplet,
  Tablet,
  CheckCircle2
} from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  portalMode: PortalMode;
  setPortalMode: (mode: PortalMode) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  devicePreview: 'desktop' | 'iphone' | 'android' | 'tablet';
  setDevicePreview: (device: 'desktop' | 'iphone' | 'android' | 'tablet') => void;
  onOpenSOSModal: () => void;
  onOpenRegisterModal: () => void;
  onOpenAuthModal: () => void;
  onOpenFamilyModal: () => void;
  onOpenArchitectureModal: () => void;
  unreadChatCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  portalMode,
  setPortalMode,
  lang,
  setLang,
  darkMode,
  setDarkMode,
  devicePreview,
  setDevicePreview,
  onOpenSOSModal,
  onOpenRegisterModal,
  onOpenAuthModal,
  onOpenFamilyModal,
  onOpenArchitectureModal,
  unreadChatCount = 1,
}) => {
  const t = getTranslation(lang);
  const [isPortalDropdownOpen, setIsPortalDropdownOpen] = useState(false);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);

  // Desktop navigation links for Donor App
  const donorNavLinks = [
    { id: 'home' as ActiveTab, label: lang === 'bn' ? 'হোম ড্যাশবোর্ড' : 'Home', icon: HeartHandshake },
    { id: 'onboarding' as ActiveTab, label: lang === 'bn' ? 'ব্লাড হেল্প' : 'Blood Help', icon: Droplet },
    { id: 'search' as ActiveTab, label: t.navFindDonors, icon: Search },
    { id: 'requests' as ActiveTab, label: t.navRequestsFeed, icon: Flame },
    { id: 'map' as ActiveTab, label: lang === 'bn' ? 'ম্যাপ ও হাসপাতাল' : 'Hospitals Map', icon: MapPin },
    { id: 'chat' as ActiveTab, label: lang === 'bn' ? 'চ্যাট' : 'Chat', icon: MessageSquare, badge: unreadChatCount },
    { id: 'badges' as ActiveTab, label: lang === 'bn' ? 'ব্যাজ' : 'Badges', icon: Award },
    { id: 'profile' as ActiveTab, label: lang === 'bn' ? 'প্রোফাইল ও QR' : 'Profile & QR', icon: User },
    { id: 'compatibility' as ActiveTab, label: t.navCompatibility, icon: Layers },
    { id: 'eligibility' as ActiveTab, label: t.navEligibility, icon: ClipboardCheck },
    { id: 'security' as ActiveTab, label: t.navSecurity, icon: ShieldCheck },
  ];

  const portalOptions: { id: PortalMode; label: string; icon: any; color: string }[] = [
    {
      id: 'showcase',
      label: lang === 'bn' ? '📱 পিডিএফ ৩-ফোন ভিউ (PDF Exact Match)' : '📱 PDF 3-Phone Match',
      icon: Smartphone,
      color: 'text-amber-500',
    },
    {
      id: 'donor_app',
      label: lang === 'bn' ? '🩸 ডোনার ও রোগী অ্যাপ (Donor App)' : '🩸 Donor & Patient App',
      icon: HeartHandshake,
      color: 'text-rose-500',
    },
    {
      id: 'command_center',
      label: lang === 'bn' ? '🚨 ইমার্জেন্সি কমান্ড সেন্টার' : '🚨 Emergency Command Center',
      icon: Radio,
      color: 'text-red-500',
    },
    {
      id: 'blood_bank',
      label: lang === 'bn' ? '🏥 ব্লাড ব্যাংক ইনভেন্টরি' : '🏥 Blood Bank Inventory',
      icon: Building2,
      color: 'text-blue-500',
    },
    {
      id: 'architecture',
      label: lang === 'bn' ? '📐 ব্লুপ্রিন্ট ও আর্কিটেকচার ডক' : '📐 Architecture & Flutter Specs',
      icon: FileCode,
      color: 'text-amber-500',
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 shadow-xs">
      {/* Top Portal Switcher Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 py-2 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 shrink-0">
              {lang === 'bn' ? 'মডিউল' : 'ECOSYSTEM'}:
            </span>
            {portalOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  if (opt.id === 'architecture') {
                    onOpenArchitectureModal();
                  } else {
                    setPortalMode(opt.id);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  portalMode === opt.id && opt.id !== 'architecture'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              onClick={onOpenFamilyModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span>{lang === 'bn' ? 'ফ্যামিলি ও ভলান্টিয়ার' : 'Family & Volunteers'}</span>
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>{lang === 'bn' ? 'অ্যাকাউন্ট সিকিউরিটি' : 'Auth & Devices'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              setPortalMode('donor_app');
              setActiveTab('search');
            }}
            className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none"
          >
            <BrandLogo
              variant="lockup"
              size="md"
              className="group-hover:scale-[1.02] transition-transform"
            />
          </button>
        </div>

        {/* Zone 2: Navigation Links (Desktop) */}
        {portalMode === 'donor_app' && (
          <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 overflow-x-auto scrollbar-none">
            {donorNavLinks.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer relative ${
                    isActive
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Actions & Quick Toggles */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            title="Toggle Language / ভাষা পরিবর্তন"
            className="h-9 px-2.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200/60 dark:border-slate-700/60 cursor-pointer"
          >
            {lang === 'bn' ? 'English' : 'বাংলা'}
          </button>

          {/* Dark / Light Mode Switcher */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Device Simulator Selector: Desktop, iPhone 16 Pro, Android Galaxy, iPad Tablet */}
          <div className="relative">
            <button
              onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
              className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer"
            >
              {devicePreview === 'desktop' && <Monitor className="w-3.5 h-3.5 text-blue-500" />}
              {devicePreview === 'iphone' && <Smartphone className="w-3.5 h-3.5 text-rose-500" />}
              {devicePreview === 'android' && <Smartphone className="w-3.5 h-3.5 text-emerald-500" />}
              {devicePreview === 'tablet' && <Tablet className="w-3.5 h-3.5 text-purple-500" />}
              <span className="capitalize">{devicePreview}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isDeviceDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-2xl glass-card-adaptive p-1.5 shadow-2xl border border-slate-200 dark:border-slate-800 z-50 animate-in fade-in">
                <button
                  onClick={() => {
                    setDevicePreview('desktop');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl font-semibold transition-all cursor-pointer ${
                    devicePreview === 'desktop' ? 'bg-rose-50 dark:bg-rose-950 text-rose-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5 text-blue-500" />
                  <span>Desktop View</span>
                </button>
                <button
                  onClick={() => {
                    setDevicePreview('iphone');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl font-semibold transition-all cursor-pointer ${
                    devicePreview === 'iphone' ? 'bg-rose-50 dark:bg-rose-950 text-rose-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-rose-500" />
                  <span>iPhone 16 Pro</span>
                </button>
                <button
                  onClick={() => {
                    setDevicePreview('android');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl font-semibold transition-all cursor-pointer ${
                    devicePreview === 'android' ? 'bg-rose-50 dark:bg-rose-950 text-rose-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Android Galaxy</span>
                </button>
                <button
                  onClick={() => {
                    setDevicePreview('tablet');
                    setIsDeviceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-xl font-semibold transition-all cursor-pointer ${
                    devicePreview === 'tablet' ? 'bg-rose-50 dark:bg-rose-950 text-rose-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5 text-purple-500" />
                  <span>iPad Tablet</span>
                </button>
              </div>
            )}
          </div>

          {/* User Auth Profile Trigger */}
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 transition-colors cursor-pointer"
            title="User Profile & Security"
          >
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {lang === 'bn' ? 'অ্যাকাউন্ট' : 'Account'}
            </span>
          </button>

          {/* Register as Donor Button */}
          <button
            onClick={onOpenRegisterModal}
            className="hidden md:flex items-center gap-1.5 h-9 px-3 text-xs font-semibold rounded-lg text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>{t.registerDonorBtn}</span>
          </button>

          {/* Primary SOS Action Button */}
          <button
            onClick={onOpenSOSModal}
            className="flex items-center gap-1.5 h-9 px-3.5 sm:px-4 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500 shadow-md shadow-rose-600/25 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            <Flame className="w-4 h-4 text-white fill-white animate-pulse" />
            <span>{lang === 'bn' ? 'জরুরি আবেদন' : 'Emergency SOS'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
