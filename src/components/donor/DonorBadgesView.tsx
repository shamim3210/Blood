import React, { useState, useEffect, useMemo } from 'react';
import { BadgeItem, Language, UserAccount } from '../../types';
import { ENTERPRISE_BADGES } from '../../data/mockEnterpriseData';
import { isFakePersonName } from '../../data/mockDonors';
import { getStoredDonationLogs, DonationLogRecord } from '../../utils/sosAlertEngine';
import { auth, onAuthStateChanged } from '../../services/bloodSearchService';
import {
  Award,
  CheckCircle2,
  Lock,
  Sparkles,
  Download,
  X,
} from 'lucide-react';

interface DonorBadgesViewProps {
  lang: Language;
}

const BADGE_DONATION_THRESHOLDS: Record<string, number> = {
  'badge-s1': 1,
  'badge-s2': 2,
  'badge-s3': 3,
  'badge-g1': 5,
  'badge-g2': 8,
  'badge-g3': 10,
  'badge-p1': 15,
  'badge-p2': 20,
  'badge-p3': 25,
  'badge-d1': 30,
  'badge-d2': 40,
  'badge-d3': 50,
};

export const DonorBadgesView: React.FC<DonorBadgesViewProps> = ({ lang }) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'EARNED' | 'LOCKED'>('ALL');
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && !isFakePersonName(parsed.name)) return parsed;
      }
    } catch {}
    return null;
  });

  const [donationLogs, setDonationLogs] = useState<DonationLogRecord[]>(() =>
    getStoredDonationLogs()
  );

  useEffect(() => {
    const syncState = () => {
      try {
        const saved = localStorage.getItem('bloodsearch_current_user');
        const parsed = saved ? JSON.parse(saved) : null;
        setCurrentUser(parsed && !isFakePersonName(parsed.name) ? parsed : null);
        setDonationLogs(getStoredDonationLogs());
      } catch {}
    };
    const unsub = onAuthStateChanged(auth, () => syncState());
    window.addEventListener('bloodsearch_user_changed', syncState);
    return () => {
      unsub();
      window.removeEventListener('bloodsearch_user_changed', syncState);
    };
  }, []);

  const realDonationCount = useMemo(() => {
    if (!currentUser) return 0;
    const fromProfile = Math.max(0, Number(currentUser.totalDonations) || 0);
    return Math.max(fromProfile, donationLogs.length);
  }, [currentUser, donationLogs]);

  const computedBadges = useMemo<BadgeItem[]>(() => {
    const latestDate = donationLogs[0]?.date
      ? new Date(donationLogs[0].date).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : undefined;

    return ENTERPRISE_BADGES.map((badge) => {
      const requiredCount = BADGE_DONATION_THRESHOLDS[badge.id] ?? 999;
      const isUnlocked = Boolean(currentUser) && realDonationCount >= requiredCount;
      return {
        ...badge,
        unlocked: isUnlocked,
        unlockedDate: isUnlocked ? latestDate || 'Verified' : undefined,
      };
    });
  }, [currentUser, realDonationCount, donationLogs]);

  const filteredBadges = computedBadges.filter((b) => {
    if (activeFilter === 'EARNED') return b.unlocked;
    if (activeFilter === 'LOCKED') return !b.unlocked;
    return true;
  });

  const unlockedTotal = computedBadges.filter((b) => b.unlocked).length;
  const categories: ('SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND')[] = [
    'SILVER',
    'GOLD',
    'PLATINUM',
    'DIAMOND',
  ];

  const handleDownloadCertificate = () => {
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Tabs */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 transition-all shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {lang === 'bn' ? 'আমার ব্যাজ ও সম্মাননা' : 'My Badges & Honors'}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              {lang === 'bn'
                ? `আপনার প্রকৃত রক্তদানের সংখ্যা (${realDonationCount}) অনুযায়ী স্বয়ংক্রিয়ভাবে ব্যাজ আনলক হয়`
                : `Automatically unlocked from your verified donation count (${realDonationCount})`}
            </p>
          </div>

          <div className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
            {unlockedTotal} / {computedBadges.length}{' '}
            {lang === 'bn' ? 'টি অর্জিত' : 'Unlocked'}
          </div>
        </div>

        {/* 3 Segmented Filter Tabs */}
        <div className="pt-4 flex flex-wrap items-center gap-2">
          {(['ALL', 'EARNED', 'LOCKED'] as const).map((filter) => {
            const isSelected = activeFilter === filter;
            const labels = {
              ALL: lang === 'bn' ? 'সকল ব্যাজ (All)' : 'All Badges',
              EARNED: lang === 'bn' ? `অর্জিত (${unlockedTotal})` : `Earned (${unlockedTotal})`,
              LOCKED:
                lang === 'bn'
                  ? `লকড (${computedBadges.length - unlockedTotal})`
                  : `Locked (${computedBadges.length - unlockedTotal})`,
            };
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {labels[filter]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty State when Earned filter selected with 0 unlocked */}
      {filteredBadges.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 text-center space-y-2">
          <Lock className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {lang === 'bn'
              ? 'এখনো কোনো ব্যাজ আনলক হয়নি'
              : 'No Badges Unlocked Yet'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {lang === 'bn'
              ? 'আপনার প্রথম রক্তদান সম্পন্ন করে প্রোফাইলে রেকর্ড করলেই Silver Badge Level 1 আনলক হবে।'
              : 'Complete and log your first voluntary blood donation in your profile to unlock Silver Badge Level 1.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => {
            const catBadges = filteredBadges.filter((b) => b.category === cat);
            if (catBadges.length === 0) return null;

            return (
              <div key={cat} className="space-y-3">
                <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {cat} BADGES
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {catBadges.map((badge) => (
                    <div
                      key={badge.id}
                      onClick={() => setSelectedBadge(badge)}
                      className={`p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 shadow-sm transition-all flex flex-col items-center justify-between text-center group cursor-pointer hover:scale-[1.01] relative ${
                        badge.unlocked
                          ? 'hover:border-rose-400'
                          : 'opacity-75 grayscale-[35%] hover:grayscale-0'
                      }`}
                    >
                      <div className="absolute top-3 right-3">
                        {badge.unlocked ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                            ✓
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]">
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      <div className="my-2 relative flex flex-col items-center">
                        <div
                          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${
                            badge.category === 'SILVER'
                              ? 'bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 text-slate-700'
                              : badge.category === 'GOLD'
                                ? 'bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-600 text-amber-900'
                                : badge.category === 'PLATINUM'
                                  ? 'bg-gradient-to-tr from-cyan-200 via-slate-100 to-cyan-500 text-slate-800'
                                  : 'bg-gradient-to-tr from-sky-400 via-blue-200 to-indigo-600 text-white'
                          }`}
                        >
                          <Award className="w-9 h-9" />
                        </div>
                        <span className="mt-1.5 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                          Level {badge.level}
                        </span>
                      </div>

                      <div className="mt-1">
                        <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {badge.title}
                        </h3>
                        <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block mt-1 hover:underline">
                          {lang === 'bn' ? 'শর্তাবলী দেখুন →' : 'See Requirements →'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Badge Detail Modal */}
      {selectedBadge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setSelectedBadge(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1e293b] p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-all text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              {selectedBadge.unlocked ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Unlocked ({selectedBadge.unlockedDate})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-500 font-bold text-xs">
                  <Lock className="w-4 h-4" />
                  <span>Locked</span>
                </span>
              )}
            </div>

            <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-600 text-amber-900 flex items-center justify-center shadow-xl ring-8 ring-amber-400/20">
              <Award className="w-14 h-14" />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                {selectedBadge.title}
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                Category: {selectedBadge.category}
              </span>
            </div>

            <div className="text-left p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                REQUIREMENTS:
              </span>
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-2">
                {selectedBadge.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-rose-500 font-bold mt-0.5">•</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>

            {selectedBadge.unlocked && (
              <button
                type="button"
                onClick={handleDownloadCertificate}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadSuccess ? 'Certificate Ready' : 'Download Certificate'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
