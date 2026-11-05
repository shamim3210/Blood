import React, { useState } from 'react';
import { Language } from '../types';
import { getTranslation } from '../utils/translations';
import { ClipboardCheck, CheckCircle2, AlertCircle, XCircle, Info, RotateCcw } from 'lucide-react';

interface EligibilityCheckerProps {
  lang: Language;
}

export const EligibilityChecker: React.FC<EligibilityCheckerProps> = ({ lang }) => {
  const t = getTranslation(lang);

  const [age, setAge] = useState<number>(24);
  const [weightKg, setWeightKg] = useState<number>(62);
  const [daysSinceLastDonation, setDaysSinceLastDonation] = useState<number>(100);
  const [hasRecentFeverOrAntibiotics, setHasRecentFeverOrAntibiotics] = useState<boolean>(false);
  const [hasRecentSurgeryOrTattoo, setHasRecentSurgeryOrTattoo] = useState<boolean>(false);
  const [isPregnantOrLactating, setIsPregnantOrLactating] = useState<boolean>(false);
  const [hasChronicIllness, setHasChronicIllness] = useState<boolean>(false);

  // Evaluation logic
  const isAgeValid = age >= 18 && age <= 65;
  const isWeightValid = weightKg >= 48;
  const isCooldownValid = daysSinceLastDonation >= 90;
  const isHealthClear = !hasRecentFeverOrAntibiotics && !hasRecentSurgeryOrTattoo && !isPregnantOrLactating && !hasChronicIllness;

  const isEligible = isAgeValid && isWeightValid && isCooldownValid && isHealthClear;

  const handleReset = () => {
    setAge(24);
    setWeightKg(62);
    setDaysSinceLastDonation(100);
    setHasRecentFeverOrAntibiotics(false);
    setHasRecentSurgeryOrTattoo(false);
    setIsPregnantOrLactating(false);
    setHasChronicIllness(false);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 transition-all shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t.eligibilityTitle}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              {t.eligibilitySubtitle}
            </p>
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
          </button>
        </div>

        {/* Live Eligibility Status Banner */}
        <div className="pt-4">
          {isEligible ? (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {lang === 'bn' ? 'অভিনন্দন! আপনি আজ রক্তদান করতে পারেন।' : 'Congratulations! You are eligible to donate blood today.'}
                </h3>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {lang === 'bn'
                    ? 'আপনার বয়স, ওজন এবং রক্তদানের বিরতি নির্দেশিকা অনুযায়ী সঠিক রয়েছে। পর্যাপ্ত পানি পান করে রক্তদান কেন্দ্রে আসুন।'
                    : 'Your age, weight, and donation interval meet national blood transfusion safety standards.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {lang === 'bn' ? 'বর্তমানে রক্তদান সাময়িকভাবে স্থগিত রাখা উচিত' : 'Temporary Deferral / Not Recommended Today'}
                </h3>
                <ul className="text-xs text-amber-800 dark:text-amber-300 mt-1 space-y-1 list-disc pl-4">
                  {!isAgeValid && (
                    <li>{lang === 'bn' ? 'বয়স ১৮ থেকে ৬৫ বছরের মধ্যে হতে হবে।' : 'Age must be between 18 and 65 years.'}</li>
                  )}
                  {!isWeightValid && (
                    <li>{lang === 'bn' ? 'ওজন কমপক্ষে ৪৮ কেজি হতে হবে।' : 'Body weight must be at least 48 kg.'}</li>
                  )}
                  {!isCooldownValid && (
                    <li>
                      {lang === 'bn'
                        ? `সর্বশেষ রক্তদানের পর কমপক্ষে ৯০ দিন (৩ মাস) বিরতি প্রয়োজন। বাকি আছে ${90 - daysSinceLastDonation} দিন।`
                        : `At least 90 days required between donations. ${90 - daysSinceLastDonation} days remaining.`}
                    </li>
                  )}
                  {hasRecentFeverOrAntibiotics && (
                    <li>{lang === 'bn' ? 'জ্বর বা অ্যান্টিবায়োটিক গ্রহণের পর ৭ দিন অপেক্ষা করুন।' : 'Wait 7 days after fever or antibiotics.'}</li>
                  )}
                  {hasRecentSurgeryOrTattoo && (
                    <li>{lang === 'bn' ? 'বড় সার্জারি বা উল্কি আঁকার পর ৬ মাস বিরতি বাধ্যতামূলক।' : 'Wait 6 months after surgery or tattoos.'}</li>
                  )}
                  {isPregnantOrLactating && (
                    <li>{lang === 'bn' ? 'গর্ভবতী বা স্তন্যদানকারী মায়েদের রক্তদান থেকে বিরত থাকতে হবে।' : 'Blood donation is not permitted during pregnancy or lactation.'}</li>
                  )}
                  {hasChronicIllness && (
                    <li>{lang === 'bn' ? 'গুরুতর হৃদরোগ, ক্যান্সার বা হেপাটাইটিসে রক্তদান নিষিদ্ধ।' : 'Chronic conditions require consulting a physician.'}</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Questionnaire */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {/* Numerical Vitals */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
            {lang === 'bn' ? 'শারীরিক তথ্য (Physical Parameters)' : 'Physical Parameters'}
          </h2>

          {/* Age Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span>{lang === 'bn' ? 'বয়স (বছর)' : 'Age (Years)'}</span>
              <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{age} {lang === 'bn' ? 'বছর' : 'years'}</span>
            </div>
            <input
              name="eligibilityAge"
              type="range"
              min="15"
              max="75"
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>১৫ বছর</span>
              <span>১৮-৬৫ বছর (বৈধ)</span>
              <span>৭৫ বছর</span>
            </div>
          </div>

          {/* Weight Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span>{lang === 'bn' ? 'ওজন (কেজি)' : 'Weight (Kg)'}</span>
              <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{weightKg} kg</span>
            </div>
            <input
              name="eligibilityWeightKg"
              type="range"
              min="35"
              max="110"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>৩৫ কেজি</span>
              <span>ন্যূনতম ৪৮ কেজি</span>
              <span>১১০ কেজি</span>
            </div>
          </div>

          {/* Days Since Last Donation */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span>{lang === 'bn' ? 'সর্বশেষ রক্তদানের বিরতি (দিন)' : 'Days Since Last Donation'}</span>
              <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{daysSinceLastDonation} {lang === 'bn' ? 'দিন' : 'days'}</span>
            </div>
            <input
              name="daysSinceLastDonation"
              type="range"
              min="0"
              max="180"
              value={daysSinceLastDonation}
              onChange={(e) => setDaysSinceLastDonation(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>০ দিন</span>
              <span>৯০ দিন (৩ মাস বিরতি)</span>
              <span>১৮০+ দিন</span>
            </div>
          </div>
        </div>

        {/* Health Check Toggles */}
        <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-5 sm:p-6 space-y-3 shadow-sm">
          <h2 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
            {lang === 'bn' ? 'চিকিৎসাগত ইতিহাস (Medical Screening)' : 'Medical Screening'}
          </h2>

          <label className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 cursor-pointer">
            <input
              name="hasRecentFeverOrAntibiotics"
              type="checkbox"
              checked={hasRecentFeverOrAntibiotics}
              onChange={(e) => setHasRecentFeverOrAntibiotics(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {lang === 'bn'
                ? 'গত ৭ দিনে জ্বর, সর্দি, বা কোনো অ্যান্টিবায়োটিক সেবন করেছেন?'
                : 'Fever, severe cold, or antibiotic medication in the past 7 days?'}
            </span>
          </label>

          <label className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 cursor-pointer">
            <input
              name="hasRecentSurgeryOrTattoo"
              type="checkbox"
              checked={hasRecentSurgeryOrTattoo}
              onChange={(e) => setHasRecentSurgeryOrTattoo(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {lang === 'bn'
                ? 'গত ৬ মাসের মধ্যে কোনো বড় অস্ত্রোপচার বা ট্যাটু/উল্কি করিয়েছেন?'
                : 'Major surgical operation or tattoo in the past 6 months?'}
            </span>
          </label>

          <label className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 cursor-pointer">
            <input
              name="isPregnantOrLactating"
              type="checkbox"
              checked={isPregnantOrLactating}
              onChange={(e) => setIsPregnantOrLactating(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {lang === 'bn'
                ? 'বর্তমানে গর্ভবতী বা শিশুকে দুগ্ধপান করাচ্ছেন?'
                : 'Currently pregnant or breastfeeding infant?'}
            </span>
          </label>

          <label className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 cursor-pointer">
            <input
              name="hasChronicIllness"
              type="checkbox"
              checked={hasChronicIllness}
              onChange={(e) => setHasChronicIllness(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
              {lang === 'bn'
                ? 'হেপাটাইটিস বি/সি, এইডস বা গুরুতর ডায়াবেটিসের সমস্যা রয়েছে?'
                : 'History of Hepatitis B/C, HIV, or severe chronic heart/kidney conditions?'}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};
