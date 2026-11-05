import React, { useEffect, useState, useCallback } from 'react';
import { Language } from '../../types';
import { subscribeRemoteAppUpdate, RemoteAppUpdateRelease } from '../../services/bloodSearchService';
import {
  CURRENT_APP_VERSION,
  DetectedBuildUpdate,
  subscribeDetectedBuildUpdate,
  checkForDeployedBuildUpdateNow,
  applySeamlessAppUpdateAndReload,
  compareSemver,
} from '../../utils/appUpdateManager';
import { RefreshCw, Download, CheckCircle2, Sparkles, X } from 'lucide-react';

interface AppUpdateBannerModalProps {
  lang: Language;
}

/**
 * Clean bKash / Modern Mobile APK Style Update Screen (Always rendered in crisp English):
 * - Backward-compatible: Users who tap "Maybe Later" continue running their current APK/app uninterrupted.
 * - Zero APK Re-deploy OTA: Tapping "Update Now" applies live web/Service Worker updates directly inside the installed APK.
 */
export const AppUpdateBannerModal: React.FC<AppUpdateBannerModalProps> = () => {
  const [buildUpdate, setBuildUpdate] = useState<DetectedBuildUpdate | null>(null);
  const [remoteRelease, setRemoteRelease] = useState<RemoteAppUpdateRelease | null>(null);
  const [dismissedSessionKey, setDismissedSessionKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [manualCheckFeedback, setManualCheckFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsubBuild = subscribeDetectedBuildUpdate((upd) => {
      setBuildUpdate(upd);
    });
    const unsubRemote = subscribeRemoteAppUpdate((rel) => {
      setRemoteRelease(rel);
    });

    const handleManualCheck = async () => {
      setManualCheckFeedback('Checking for new updates...');
      const result = await checkForDeployedBuildUpdateNow();
      const ackVer = localStorage.getItem('bloodsearch_ack_remote_version') || '';
      const hasUnseenRemote =
        Boolean(remoteRelease?.active) &&
        (compareSemver(remoteRelease!.version, CURRENT_APP_VERSION) > 0 ||
          ackVer !== remoteRelease!.version);

      if (result.updateAvailable || hasUnseenRemote) {
        setDismissedSessionKey(null);
        setManualCheckFeedback(null);
      } else {
        setManualCheckFeedback(
          `Your app is up to date (v${CURRENT_APP_VERSION}) — Live OTA enabled.`
        );
        window.setTimeout(() => {
          setManualCheckFeedback(null);
        }, 3800);
      }
    };

    const handlePreviewModal = () => {
      setDismissedSessionKey(null);
      setPreviewOpen(true);
    };

    window.addEventListener('bloodsearch_manual_update_check', handleManualCheck);
    window.addEventListener('bloodsearch_preview_update_modal', handlePreviewModal);
    return () => {
      unsubBuild();
      unsubRemote();
      window.removeEventListener('bloodsearch_manual_update_check', handleManualCheck);
      window.removeEventListener('bloodsearch_preview_update_modal', handlePreviewModal);
    };
  }, [remoteRelease]);

  const ackedRemoteVersion = (() => {
    try {
      return localStorage.getItem('bloodsearch_ack_remote_version') || '';
    } catch {
      return '';
    }
  })();

  const remoteIsNewerVersion =
    Boolean(remoteRelease?.active) &&
    compareSemver(remoteRelease!.version, CURRENT_APP_VERSION) > 0;

  const remoteNeedsPrompt =
    Boolean(remoteRelease?.active) &&
    (remoteIsNewerVersion || ackedRemoteVersion !== remoteRelease!.version);

  const hasAnyUpdate = Boolean(buildUpdate?.available) || remoteNeedsPrompt || previewOpen;

  const displayVersion = remoteNeedsPrompt
    ? remoteRelease!.version
    : buildUpdate?.latestVersion || (previewOpen ? '2.6.0' : CURRENT_APP_VERSION);

  const sessionKey = `${displayVersion}-${buildUpdate?.latestBuildId || 'ota'}`;

  const handleDismiss = useCallback(() => {
    setPreviewOpen(false);
    setDismissedSessionKey(sessionKey);
  }, [sessionKey]);

  const handleApplyUpdate = useCallback(async () => {
    if (previewOpen && !buildUpdate?.available && !remoteNeedsPrompt) {
      setPreviewOpen(false);
      setManualCheckFeedback(`Updated seamlessly to latest live build (v${CURRENT_APP_VERSION}).`);
      window.setTimeout(() => setManualCheckFeedback(null), 3500);
      return;
    }
    setIsApplying(true);
    await applySeamlessAppUpdateAndReload(remoteRelease?.version || displayVersion);
  }, [previewOpen, buildUpdate?.available, remoteNeedsPrompt, remoteRelease?.version, displayVersion]);

  if (manualCheckFeedback && !hasAnyUpdate) {
    return (
      <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-sm rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 px-4 py-3 shadow-xl flex items-center gap-2.5 text-xs font-semibold">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>{manualCheckFeedback}</span>
      </div>
    );
  }

  if (!hasAnyUpdate) return null;
  if (!previewOpen && dismissedSessionKey === sessionKey) return null;

  const changelogText =
    remoteNeedsPrompt && remoteRelease?.changelog
      ? remoteRelease.changelog
      : '• Faster live GPS & nearest hospital donor matching\n• Instant mutual Call & WhatsApp contact sync\n• Seamless over-the-air (OTA) update — no APK reinstall needed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl text-left">
        {/* Clean Crimson Brand Top Header (bKash / Modern Mobile App Update Style) */}
        <div className="banner-brand-strip px-5 py-4 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/image_771fa3d8.png"
              alt="BloodSearch"
              className="w-11 h-11 rounded-2xl bg-white p-1 object-contain shadow-sm shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-rose-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Update Available · v{displayVersion}</span>
              </div>
              <h3 className="text-base font-black text-white leading-tight mt-0.5">
                New BloodSearch Update
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-[32px] min-w-[32px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Maybe Later"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            A newer version of <strong>BloodSearch</strong> is ready. Updating takes 2 seconds right inside this app — no new APK installation is required. You can also continue using your current version anytime.
          </p>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            <div className="font-bold text-slate-900 dark:text-white">What&apos;s Improved:</div>
            <p className="whitespace-pre-line leading-relaxed">{changelogText}</p>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isApplying}
              onClick={handleApplyUpdate}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl btn-crimson font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isApplying ? 'animate-spin' : ''}`} />
              <span>{isApplying ? 'Applying Live Update...' : 'Update Now (Instant OTA)'}</span>
            </button>

            {remoteRelease?.apkUrl && (
              <a
                href={remoteRelease.apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[42px] px-4 py-2 rounded-xl btn-emerald font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download Optional .APK File</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl btn-surface font-bold text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Maybe Later (Keep Using Current Version)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
