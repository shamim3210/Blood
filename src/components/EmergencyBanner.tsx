import React, { useState } from 'react';
import { BloodRequest, Language } from '../types';
import { Flame, AlertCircle, ArrowRight, UserCheck, Volume2, VolumeX } from 'lucide-react';
import { playCriticalSiren } from '../utils/audioAlert';

interface EmergencyBannerProps {
  urgentRequests: BloodRequest[];
  lang: Language;
  onSelectRequest: (req: BloodRequest) => void;
  onQuickRespond: (req: BloodRequest) => void;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({
  urgentRequests,
  lang,
  onSelectRequest,
  onQuickRespond,
}) => {
  const [isPlayingSiren, setIsPlayingSiren] = useState(false);

  if (urgentRequests.length === 0) return null;

  const topRequest = urgentRequests[0];

  const handleTriggerSiren = () => {
    setIsPlayingSiren(true);
    const stopFn = playCriticalSiren();
    setTimeout(() => {
      stopFn();
      setIsPlayingSiren(false);
    }, 2000);
  };

  return (
    <div className="w-full bg-gradient-to-r from-rose-600/90 via-rose-700/90 to-red-600/90 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
        {/* Urgent alert details */}
        <div className="flex items-center gap-2.5 text-center sm:text-left">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-amber-200 fill-amber-200 animate-pulse" />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-bold tracking-wide uppercase bg-black/25 px-2 py-0.5 rounded text-[11px] text-amber-200">
              {topRequest.urgency}
            </span>
            <span className="font-semibold">
              {topRequest.bloodGroup} {lang === 'bn' ? 'রক্তের জরুরি প্রয়োজন:' : 'Blood Needed:'}
            </span>
            <span className="text-rose-100 truncate max-w-xs md:max-w-md">
              {topRequest.hospitalName} ({Math.max(1, topRequest.unitsNeeded - topRequest.unitsCollected)}{' '}
              {lang === 'bn' ? 'ব্যাগ বাকি' : 'bags needed'})
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerSiren}
            className={`p-1.5 rounded-lg border border-white/30 text-white transition-all cursor-pointer ${
              isPlayingSiren ? 'bg-amber-500 animate-bounce' : 'bg-black/20 hover:bg-black/30'
            }`}
            title="জরুরি সাইরেন অ্যালার্ম ও ভাইব্রেশন"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onQuickRespond(topRequest)}
            className="flex items-center gap-1.5 px-3 py-1 bg-white text-rose-700 hover:bg-rose-50 font-bold rounded-md shadow-sm transition-transform active:scale-95 cursor-pointer text-xs"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'আমি দেব' : 'I Can Donate'}</span>
          </button>
          <button
            onClick={() => onSelectRequest(topRequest)}
            className="flex items-center gap-1 px-2.5 py-1 text-white hover:text-amber-200 hover:underline transition-colors cursor-pointer text-xs font-medium"
          >
            <span>{lang === 'bn' ? 'বিস্তারিত' : 'Details'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
