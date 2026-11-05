import React from 'react';
import { ActiveTab, Language } from '../types';
import { Home, Search, PlusCircle, MessageCircle, ShieldCheck, User } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  lang: Language;
  userRole?: 'USER' | 'ADMIN';
  unreadSosCount?: number;
  unreadChatCount?: number;
  onOpenSOSModal: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  lang,
  userRole = 'USER',
  unreadSosCount = 0,
  unreadChatCount = 0,
  onOpenSOSModal,
}) => {
  const isAdmin = userRole === 'ADMIN';

  return (
    <nav
      aria-label="Primary Mobile Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 w-full bg-white/95 dark:bg-[#091120]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800/90 shadow-[0_-6px_24px_rgba(11,34,57,0.08)] pb-safe transition-colors"
    >
      <div className="max-w-lg mx-auto h-16 px-2 grid grid-cols-5 items-center gap-1.5">
        {/* 1. Home (Indigo) */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap transition-all duration-200 ${
            activeTab === 'home'
              ? 'bg-[#4f46e5] border-[#4338ca] text-white font-bold shadow-sm'
              : 'bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#4f46e5] hover:border-[#4338ca] hover:text-white font-semibold'
          }`}
        >
          <Home className="w-4.5 h-4.5 stroke-[2.2]" />
          <span className="text-[10px] leading-tight">
            {lang === 'bn' ? 'হোম' : 'Home'}
          </span>
        </button>

        {/* 2. Search Donors (Sky) */}
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap transition-all duration-200 ${
            activeTab === 'search' || activeTab === 'onboarding'
              ? 'bg-[#0284c7] border-[#0369a1] text-white font-bold shadow-sm'
              : 'bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#0284c7] hover:border-[#0369a1] hover:text-white font-semibold'
          }`}
        >
          <Search className="w-4.5 h-4.5 stroke-[2.2]" />
          <span className="text-[10px] leading-tight">
            {lang === 'bn' ? 'ডোনার' : 'Donors'}
          </span>
        </button>

        {/* 3. Primary Emergency SOS (Crimson) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenSOSModal}
            aria-label={lang === 'bn' ? 'জরুরি রক্তের আবেদন করুন' : 'Post Emergency Blood Request'}
            className="relative w-full min-h-[48px] px-2 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] border border-[#b91c1c] text-white flex flex-col items-center justify-center gap-0.5 shadow-md cursor-pointer whitespace-nowrap transition-all duration-200"
          >
            <PlusCircle className="w-5 h-5 stroke-[2.3]" />
            <span className="text-[10px] font-black tracking-tight leading-none">
              {lang === 'bn' ? 'রক্ত চাই' : 'SOS'}
            </span>
            {unreadSosCount > 0 && (
              <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                {unreadSosCount > 9 ? '9+' : unreadSosCount}
              </span>
            )}
          </button>
        </div>

        {/* 4. Live Chat (Violet) */}
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`relative min-h-[48px] rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap transition-all duration-200 ${
            activeTab === 'chat'
              ? 'bg-[#7c3aed] border-[#6d28d9] text-white font-bold shadow-sm'
              : 'bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#7c3aed] hover:border-[#6d28d9] hover:text-white font-semibold'
          }`}
        >
          <div className="relative">
            <MessageCircle className="w-4.5 h-4.5 stroke-[2.2]" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-md bg-rose-600 text-white text-[9px] font-bold tabular-nums flex items-center justify-center">
                {unreadChatCount > 9 ? '9+' : unreadChatCount}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-tight">
            {lang === 'bn' ? 'চ্যাট' : 'Chat'}
          </span>
        </button>

        {/* 5. Profile (Amber-Gold for Admin vs Emerald for Regular Donor) */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap transition-all duration-200 ${
            isAdmin
              ? activeTab === 'profile'
                ? 'bg-[#d97706] border-[#b45309] text-white font-bold shadow-sm'
                : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-[#d97706] hover:border-[#b45309] hover:text-white font-semibold'
              : activeTab === 'profile'
                ? 'bg-[#059669] border-[#047857] text-white font-bold shadow-sm'
                : 'bg-slate-50/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#059669] hover:border-[#047857] hover:text-white font-semibold'
          }`}
        >
          {isAdmin ? (
            <ShieldCheck className="w-4.5 h-4.5 stroke-[2.2]" />
          ) : (
            <User className="w-4.5 h-4.5 stroke-[2.2]" />
          )}
          <span className="text-[10px] leading-tight">
            {isAdmin
              ? lang === 'bn'
                ? 'অ্যাডমিন'
                : 'Admin'
              : lang === 'bn'
                ? 'প্রোফাইল'
                : 'Profile'}
          </span>
        </button>
      </div>
    </nav>
  );
};

