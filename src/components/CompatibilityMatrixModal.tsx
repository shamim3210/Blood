import React, { useState } from 'react';
import { BloodGroup, Language } from '../types';
import { ALL_BLOOD_GROUPS, RED_CELL_COMPATIBILITY, canDonate } from '../data/compatibility';
import { getTranslation } from '../utils/translations';
import { Layers, CheckCircle2, XCircle, Info, Sparkles, Heart } from 'lucide-react';

interface CompatibilityMatrixModalProps {
  lang: Language;
}

export const CompatibilityMatrixModal: React.FC<CompatibilityMatrixModalProps> = ({ lang }) => {
  const t = getTranslation(lang);
  const [activeGroup, setActiveGroup] = useState<BloodGroup>('O-');

  const currentInfo = RED_CELL_COMPATIBILITY[activeGroup];

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 transition-all shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30">
                <Layers className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t.compatibilityTitle}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              {t.compatibilitySubtitle}
            </p>
          </div>
        </div>

        {/* Group Selector Segmented Strip */}
        <div className="pt-4 space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            {lang === 'bn' ? 'যাচাই করতে যেকোনো গ্রুপ চাপুন:' : 'Select any group to inspect compatibility:'}
          </label>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {ALL_BLOOD_GROUPS.map((group) => {
              const isSelected = activeGroup === group;
              return (
                <button
                  key={group}
                  onClick={() => setActiveGroup(group)}
                  className={`min-h-[44px] min-w-[56px] px-3.5 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 scale-105'
                      : 'bg-white/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80'
                  }`}
                >
                  {group}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dynamic Compatibility Inspection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Can Give To Card */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>
                {activeGroup} {lang === 'bn' ? 'রক্ত দিতে পারবে (Can Donate To):' : 'Can Donate Red Cells To:'}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {ALL_BLOOD_GROUPS.map((target) => {
              const compatible = canDonate(activeGroup, target);
              return (
                <div
                  key={target}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                    compatible
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-bold shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 text-slate-400 dark:text-slate-600 opacity-60'
                  }`}
                >
                  <span className="text-base font-extrabold">{target}</span>
                  {compatible ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                      {lang === 'bn' ? 'ম্যাচ করে' : 'Match'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-0.5">✕</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
            {activeGroup === 'O-'
              ? (lang === 'bn' ? '🌟 O Negative হলো ইউনিভার্সাল ডোনার। যেকোনো গ্রুপের জরুরি সংকটে O- ব্যবহার করা যায়।' : '🌟 O Negative is the Universal Donor. Usable for anyone in emergencies.')
              : (lang === 'bn' ? `${activeGroup} ডোনারের লোহিত রক্তকণিকা উপরের সবুজ গ্রুপগুলোর রোগীকে নিরাপদে দেওয়া সম্ভব।` : `Red blood cells from ${activeGroup} can safely be transfused to the highlighted recipient groups.`)}
          </p>
        </div>

        {/* Can Receive From Card */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span>
                {activeGroup} {lang === 'bn' ? 'রক্ত গ্রহণ করতে পারবে (Can Receive From):' : 'Can Receive Red Cells From:'}
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {ALL_BLOOD_GROUPS.map((source) => {
              const compatible = canDonate(source, activeGroup);
              return (
                <div
                  key={source}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                    compatible
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300 font-bold shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 text-slate-400 dark:text-slate-600 opacity-60'
                  }`}
                >
                  <span className="text-base font-extrabold">{source}</span>
                  {compatible ? (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                      {lang === 'bn' ? 'নিতে পারবে' : 'Allowed'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-0.5">✕</span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
            {activeGroup === 'AB+'
              ? (lang === 'bn' ? '🌟 AB Positive হলো ইউনিভার্সাল গ্রহীতা। যেকোনো গ্রুপের রক্ত গ্রহণ করতে পারে।' : '🌟 AB Positive is the Universal Recipient. Can accept red blood cells from any blood group.')
              : (lang === 'bn' ? `${activeGroup} রোগীর রক্তের প্রয়োজনে শুধুমাত্র উপরের নীল গ্রুপগুলোর ডোনার নির্বাচন করুন।` : `A patient with ${activeGroup} can safely receive blood from these highlighted donor groups.`)}
          </p>
        </div>
      </div>

      {/* Full 8x8 Grid Compatibility Matrix */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
            {lang === 'bn' ? 'সম্পূর্ণ রক্তদান ম্যাট্রিক্স চার্ট (Universal Chart)' : 'Complete Blood Transfusion Cross-Match Grid'}
          </h2>
          <span className="text-xs text-slate-500">
            {lang === 'bn' ? 'ডোনার (বামে) ➜ গ্রহীতা (উপরে)' : 'Donor (Row) ➜ Recipient (Col)'}
          </span>
        </div>

        <div className="overflow-x-auto pb-2">
          <table className="w-full text-center border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="p-2.5 text-left font-bold text-slate-500">Donor \ Recipient</th>
                {ALL_BLOOD_GROUPS.map((g) => (
                  <th key={g} className="p-2.5 font-extrabold text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-900/50">
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_BLOOD_GROUPS.map((donor) => (
                <tr key={donor} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/40 dark:hover:bg-slate-800/30">
                  <td className="p-2.5 font-extrabold text-left text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-900/50">
                    {donor}
                  </td>
                  {ALL_BLOOD_GROUPS.map((recipient) => {
                    const ok = canDonate(donor, recipient);
                    return (
                      <td key={recipient} className="p-2.5">
                        {ok ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
