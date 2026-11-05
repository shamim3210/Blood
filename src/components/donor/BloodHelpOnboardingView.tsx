import React, { useState } from 'react';
import { BloodGroup, Language } from '../../types';
import { BrandLogo } from '../BrandLogo';
import { 
  ArrowRight, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Heart, 
  Bell, 
  ExternalLink,
  ChevronRight,
  Flame,
  X
} from 'lucide-react';

interface BloodHelpOnboardingViewProps {
  lang: Language;
  onSelectGroup: (group: BloodGroup) => void;
  onOpenSOSModal: () => void;
}

export const BloodHelpOnboardingView: React.FC<BloodHelpOnboardingViewProps> = ({
  lang,
  onSelectGroup,
  onOpenSOSModal,
}) => {
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>('B+');
  const [currentStep, setCurrentStep] = useState<'TYPE_PICKER' | 'URGENT_FEED' | 'DETAIL_MODAL'>('URGENT_FEED');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [donateSuccess, setDonateSuccess] = useState(false);

  const groups: { group: BloodGroup; posNeg: string; letter: string }[] = [
    { group: 'A+', letter: 'A', posNeg: 'Pos' },
    { group: 'A-', letter: 'A', posNeg: 'Neg' },
    { group: 'B+', letter: 'B', posNeg: 'Pos' },
    { group: 'B-', letter: 'B', posNeg: 'Neg' },
    { group: 'O+', letter: 'O', posNeg: 'Pos' },
    { group: 'O-', letter: 'O', posNeg: 'Neg' },
    { group: 'AB+', letter: 'AB', posNeg: 'Pos' },
    { group: 'AB-', letter: 'AB', posNeg: 'Neg' },
  ];

  const handleDonateNow = () => {
    setDonateSuccess(true);
    setTimeout(() => {
      setDonateSuccess(false);
      setDetailModalOpen(false);
    }, 2000);
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Segment Switcher between Page 2 Screen 1 & Screen 2 */}
      <div className="flex justify-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl text-xs font-bold">
        <button
          onClick={() => setCurrentStep('TYPE_PICKER')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            currentStep === 'TYPE_PICKER'
              ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          {lang === 'bn' ? 'রক্তের গ্রুপ বাছাই' : "What's Your Blood Type?"}
        </button>
        <button
          onClick={() => setCurrentStep('URGENT_FEED')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
            currentStep === 'URGENT_FEED'
              ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          {lang === 'bn' ? 'কাছের জরুরি আবেদন' : 'Urgent Near You'}
        </button>
      </div>

      {/* Screen 1: What's your blood type? (Page 2 Screen 1) */}
      {currentStep === 'TYPE_PICKER' && (
        <div className="bg-white dark:bg-[#1e293b] rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-300 dark:border-slate-700 text-left space-y-5 animate-in fade-in">
          <div className="space-y-3">
            <BrandLogo variant="lockup" size="sm" />
            <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
              {lang === 'bn' ? 'আপনার রক্তের গ্রুপ কোনটি?' : "What's your blood type?"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Takes 5 seconds. Lets us show you exactly when your type is urgently needed nearby.
            </p>
          </div>

          {/* 8 Blood Group Buttons Grid */}
          <div className="grid grid-cols-4 gap-2.5">
            {groups.map((item) => {
              const isSelected = selectedGroup === item.group;
              return (
                <button
                  key={item.group}
                  type="button"
                  onClick={() => setSelectedGroup(item.group)}
                  className={`h-16 rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-600/30 scale-105'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span className="text-base font-black leading-tight">{item.letter}</span>
                  <span className={`text-[10px] font-semibold ${isSelected ? 'text-rose-100' : 'text-slate-400'}`}>
                    {item.posNeg}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-center">
            <button
              onClick={() => onSelectGroup('O-')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Don't know your blood type? →
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectGroup(selectedGroup);
              setCurrentStep('URGENT_FEED');
            }}
            className="w-full py-3.5 bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-100 font-bold text-sm rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Continue →</span>
          </button>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={onOpenSOSModal}
              className="text-xs font-medium text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              Skip — I need blood instead
            </button>
          </div>
        </div>
      )}

      {/* Screen 2: Urgent Near You Feed (Page 2 Screen 2) */}
      {currentStep === 'URGENT_FEED' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Top Live Banner matching Page 2 Screen 2 */}
          <div
            onClick={() => setDetailModalOpen(true)}
            className="w-full rounded-2xl p-3.5 bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-between shadow-lg shadow-rose-600/25 cursor-pointer transition-transform hover:scale-[1.01]"
          >
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded-full bg-white/20 font-mono text-[10px] font-black uppercase tracking-wider">
                LIVE 3
              </span>
              <span className="text-xs font-bold">
                {selectedGroup} needed now. Within 2.4km of you.
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>

          {/* Urgent Near You list */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
              URGENT NEAR YOU
            </span>
            <button
              onClick={() => setDetailModalOpen(true)}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              See all
            </button>
          </div>

          {/* Request Card 1: St. Mary's Hospital */}
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm border border-slate-300 dark:border-slate-700 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-wider block">
                  CRITICAL
                </span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  St. Mary's Hospital (DMCH)
                </h3>
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  {selectedGroup} · 2 units · 1.2 km
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">4 min ago</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDetailModalOpen(true)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
              >
                ✓ Respond Now
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs rounded-xl transition-colors cursor-pointer"
              >
                Later
              </button>
            </div>
          </div>

          {/* Request Card 2: City Blood Bank */}
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm border border-slate-300 dark:border-slate-700 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider block">
                  NEEDED
                </span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                  City Blood Bank (Shahbagh)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {selectedGroup} · 1 unit · 1.9 km
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">11 min ago</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDetailModalOpen(true)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-all active:scale-95"
              >
                ✓ Respond Now
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs rounded-xl transition-colors cursor-pointer"
              >
                Later
              </button>
            </div>
          </div>

          {/* Bottom 3-Metric Counter Strip matching Page 2 Screen 2 */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-black text-white text-center shadow-lg">
            <div className="border-r border-slate-800">
              <span className="text-lg font-black font-mono block">4</span>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Donations</span>
            </div>
            <div className="border-r border-slate-800">
              <span className="text-lg font-black font-mono block text-rose-500">3</span>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Lives</span>
            </div>
            <div>
              <span className="text-lg font-black font-mono block text-emerald-400">{selectedGroup}</span>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Your Type</span>
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: Emergency Detail Modal matching Page 2 Screen 3 */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-sm rounded-[36px] bg-[#0c101a] text-white p-6 shadow-2xl border border-slate-800 space-y-4 text-left relative animate-in zoom-in-95">
            <button
              onClick={() => setDetailModalOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-500 block">
              ● EMERGENCY REQUEST
            </span>

            {/* Giant Crimson Red Card with B+ */}
            <div className="rounded-2xl p-5 bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-xl shadow-red-600/30 flex items-center justify-between">
              <div>
                <span className="text-4xl font-black block">{selectedGroup}</span>
                <span className="text-xs font-semibold text-rose-100 mt-1 block">
                  Critical Cross-Match
                </span>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-full bg-white/20 text-[10px] font-bold uppercase">
                  Critical
                </span>
                <span className="text-xs font-mono block mt-2 text-rose-200">
                  4 min ETA
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">St. Mary's Hospital</h3>
              <p className="text-xs text-slate-400">
                2 units needed · 1.2 km away · Posted 3 minutes ago
              </p>
            </div>

            {/* Simulated Map Snippet */}
            <div className="rounded-2xl p-3 bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-mono font-bold text-slate-300">1.2 KM AWAY</span>
              </div>
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                TAP TO OPEN MAPS
              </span>
            </div>

            {donateSuccess ? (
              <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Response Dispatched! Hospital notified.</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDonateNow}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <span>✓ I Can Donate Now</span>
              </button>
            )}

            <div className="space-y-2 pt-1 text-center">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="text-xs font-semibold text-slate-400 hover:text-white cursor-pointer block w-full"
              >
                Remind me in 1 hour
              </button>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer block w-full"
              >
                Not this time
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-center gap-1.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified by hospital staff · Request #BH-8847</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
