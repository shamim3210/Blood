import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, WifiOff, Phone, Building2 } from 'lucide-react';
import { Language } from '../../types';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { BrandLogo } from '../BrandLogo';

interface PwaInstallPromptProps {
  lang: Language;
  onOpenApkGuide?: () => void;
  onOpenDirectory?: () => void;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  lang,
  onOpenApkGuide,
  onOpenDirectory,
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, isOnline, promptInstall } =
    usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('bloodsearch_pwa_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [installHint, setInstallHint] = useState<string | null>(null);

  useEffect(() => {
    if (isInstalled) {
      setInstallHint(null);
    }
  }, [isInstalled]);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        setDismissed(true);
      }
      return;
    }

    if (isIOS) {
      setInstallHint(
        lang === 'bn'
          ? 'আইফোনে ইনস্টল করতে Safari ব্রাউজারের Share (↑) বাটনে ট্যাপ করে "Add to Home Screen" বেছে নিন।'
          : 'On iPhone/iPad: Tap the Safari Share button and select "Add to Home Screen".'
      );
      return;
    }

    if (isInIframe && onOpenApkGuide) {
      onOpenApkGuide();
      return;
    }

    setInstallHint(
      lang === 'bn'
        ? 'ফোনে ইনস্টল করতে ব্রাউজারের মেন্যু (⋮) থেকে "Install App" বা "Add to Home Screen" চাপুন।'
        : 'Open browser menu (⋮) and tap "Install App" or "Add to Home Screen".'
    );
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('bloodsearch_pwa_dismissed', 'true');
    } catch {}
  };

  const shouldShowBanner = !isInstalled && !dismissed && (isInstallable || isIOS);

  return (
    <>
      {/* Offline Connectivity Emergency Survival Bar */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-0 inset-x-0 z-50 bg-amber-600 text-white py-2 px-3 text-xs font-bold flex flex-wrap items-center justify-center gap-2 shadow-md"
        >
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              {lang === 'bn'
                ? 'অফলাইন মোড সক্রিয় (সংরক্ষিত ডোনার চালু আছে)'
                : 'Offline Mode Active (Cached Donors Ready)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href="tel:999"
              className="px-2 py-0.5 rounded-md bg-white text-rose-700 font-black text-[11px] inline-flex items-center gap-1"
            >
              <Phone className="w-3 h-3" />
              <span>৯৯৯</span>
            </a>
            <a
              href="tel:16263"
              className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-black text-[11px] inline-flex items-center gap-1"
            >
              <Phone className="w-3 h-3" />
              <span>১৬২৬৩</span>
            </a>
            {onOpenDirectory && (
              <button
                type="button"
                onClick={onOpenDirectory}
                className="px-2 py-0.5 rounded-md bg-amber-950 text-amber-100 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Building2 className="w-3 h-3" />
                <span>{lang === 'bn' ? '৩৪+ হটলাইন' : '34+ Hotlines'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1-Tap Native Install Banner */}
      {shouldShowBanner && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-4 z-40 sm:max-w-sm hero-brand-surface text-white p-3.5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo variant="card" className="w-11 h-11 shrink-0" />
              <div className="min-w-0">
                <h4 className="font-bold text-xs text-white leading-tight">
                  {lang === 'bn' ? 'BloodSearch অ্যাপ ফোনে ইনস্টল করুন' : 'Install BloodSearch App'}
                </h4>
                <p className="text-[10px] text-slate-300 truncate mt-0.5">
                  {lang === 'bn'
                    ? 'হোম স্ক্রিন থেকে ১-ট্যাপে ফুলস্ক্রিন APK স্টাইলে ব্যবহার করুন'
                    : 'Fast fullscreen access on your phone home screen'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleInstallClick}
                className="min-h-[38px] px-3 py-1.5 rounded-xl btn-crimson font-bold text-xs cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'ইনস্টল' : 'Install'}</span>
              </button>
              <button
                onClick={handleDismiss}
                className="min-h-[38px] min-w-[34px] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                aria-label="Close install banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {installHint && (
            <p className="text-[11px] text-amber-300 font-medium border-t border-slate-800 pt-1.5">
              {installHint}
            </p>
          )}
        </div>
      )}
    </>
  );
};
