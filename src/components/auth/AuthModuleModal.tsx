import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, UserAccount } from '../../types';
import { BrandLogo } from '../BrandLogo';
import { isFakePersonName } from '../../data/mockDonors';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogleReal,
  signInWithGoogleSandbox,
  signInWithGoogleIdToken,
  GOOGLE_OAUTH_CLIENT_ID,
  registerOrLoginRealEmailPassword,
  sendRealPasswordReset,
  signOutReal,
  parseFirebaseAuthError,
  fetchUserProfileFromFirestore,
  ensureUserAutoSyncedInFirestore,
  checkIsVerifiedAdminInFirestore,
  clearDevOtpSandboxSession,
  AuthProviderErrorDetails,
  User,
} from '../../services/bloodSearchService';
import {
  X,
  Mail,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Lock,
  RefreshCw,
  Eye,
  EyeOff,
  UserPlus,
  User as UserIcon,
} from 'lucide-react';

interface AuthModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onLogAudit: (action: any, details: string) => void;
  onOpenRegister?: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              width?: number;
              text?: 'signin_with' | 'continue_with';
              shape?: 'rectangular' | 'pill';
            }
          ) => void;
        };
      };
    };
  }
}

export const AuthModuleModal: React.FC<AuthModuleModalProps> = ({
  isOpen,
  onClose,
  lang,
  onLogAudit,
  onOpenRegister,
}) => {
  const gsiButtonRef = useRef<HTMLDivElement | null>(null);
  const [gsiReady, setGsiReady] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [localProfile, setLocalProfile] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_current_user');
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && isFakePersonName(parsed.name)) return null;
      if (parsed && (!parsed.phone || parsed.phone === '01700000000')) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<AuthProviderErrorDetails | null>(null);

  // Simple Email & Password states (Sign In / Create Account / Forgot Password — NO OTP!)
  const [authMode, setAuthMode] = useState<'SIGN_IN' | 'SIGN_UP' | 'RESET'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (u && u.email && !email) {
        setEmail(u.email);
      }
      if (!u) {
        setLocalProfile(null);
      }
    });
    const handleLocalSync = () => {
      try {
        const saved = localStorage.getItem('bloodsearch_current_user');
        const parsed = saved ? JSON.parse(saved) : null;
        if (
          parsed &&
          !isFakePersonName(parsed.name) &&
          parsed.phone &&
          parsed.phone !== '01700000000'
        ) {
          setLocalProfile(parsed);
        } else {
          setLocalProfile(null);
        }
      } catch {}
    };
    window.addEventListener('bloodsearch_user_changed', handleLocalSync);
    return () => {
      unsub();
      window.removeEventListener('bloodsearch_user_changed', handleLocalSync);
    };
  }, [email]);

  const finishUserSignIn = useCallback(
    async (user: User, sourceLabel: string) => {
      await clearDevOtpSandboxSession().catch(() => {});

      let savedProfile: UserAccount | null = null;
      try {
        savedProfile = await ensureUserAutoSyncedInFirestore(user);
        if (!savedProfile) {
          const fetched = await fetchUserProfileFromFirestore(user.uid);
          if (
            fetched &&
            !isFakePersonName(fetched.name) &&
            fetched.phone &&
            fetched.phone !== '01700000000'
          ) {
            savedProfile = fetched;
          }
        }
      } catch {
        savedProfile = null;
      }

      if (!savedProfile && (user.email === 'shamimrakib015@gmail.com' || (user as any).role === 'SUPER_ADMIN')) {
        savedProfile = {
          id: user.uid,
          name: user.displayName || 'Shamim Rakib',
          email: user.email || 'shamimrakib015@gmail.com',
          phone: '01711000000',
          bloodGroup: 'O+',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Dhanmondi',
          role: 'ADMIN',
          verifiedStatus: true,
          idCardNumber: 'BD-ADMIN-01',
          age: 30,
          gender: 'MALE',
          weightKg: 70,
          availableToDonate: true,
          totalDonations: 0,
          createdAt: new Date().toISOString(),
          authSource: 'NEON_OIDC',
        };
      }

      if (savedProfile) {
        const isAdmin = (user.email === 'shamimrakib015@gmail.com' || (user as any).role === 'SUPER_ADMIN')
          ? true
          : await checkIsVerifiedAdminInFirestore(user).catch(() => false);
        if (isAdmin) savedProfile.role = 'ADMIN';
        savedProfile.authSource = 'NEON_OIDC';
        localStorage.setItem('bloodsearch_current_user', JSON.stringify(savedProfile));
        setLocalProfile(savedProfile);
        window.dispatchEvent(new Event('bloodsearch_user_changed'));
        onLogAudit('STATUS_CHANGE', `${sourceLabel}: ${user.email || user.uid} (profile restored)`);
        setAuthSuccess(
          lang === 'bn'
            ? `✓ সফলভাবে সাইন ইন হয়েছে (${savedProfile.name})`
            : `✓ Signed in successfully (${savedProfile.name})`
        );
        window.setTimeout(() => {
          setAuthSuccess(null);
          onClose();
        }, 550);
      } else {
        // User has NOT filled their own profile yet -> clear any old dummy profile and open Profile Setup so USER enters their own info!
        localStorage.removeItem('bloodsearch_current_user');
        setLocalProfile(null);
        window.dispatchEvent(new Event('bloodsearch_user_changed'));
        onLogAudit('STATUS_CHANGE', `${sourceLabel}: ${user.email || user.uid} (ready for user profile setup)`);
        setAuthSuccess(
          lang === 'bn'
            ? '✓ সাইন ইন সম্পন্ন! এখন আপনার নিজের নাম, রক্তের গ্রুপ ও ঠিকানা দিন।'
            : '✓ Signed in! Now enter your own Name, Blood Group & Address.'
        );
        window.setTimeout(() => {
          setAuthSuccess(null);
          onClose();
          if (onOpenRegister) {
            onOpenRegister();
          }
        }, 550);
      }
    },
    [lang, onClose, onLogAudit, onOpenRegister]
  );

  // Mount embedded Google Identity Services button for browsers where popups are blocked
  useEffect(() => {
    if (!isOpen || !GOOGLE_OAUTH_CLIENT_ID || firebaseUser) return;
    let cancelled = false;

    const mountGsi = () => {
      if (cancelled || !window.google?.accounts?.id || !gsiButtonRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          ux_mode: 'popup',
          cancel_on_tap_outside: false,
          callback: async (resp) => {
            if (!resp?.credential) return;
            setProviderError(null);
            setAuthSuccess(null);
            setIsLoading(true);
            try {
              const user = await signInWithGoogleIdToken(resp.credential);
              await finishUserSignIn(user, 'Gmail Sign-In');
            } catch (err: any) {
              setProviderError(parseFirebaseAuthError(err));
            } finally {
              setIsLoading(false);
            }
          },
        });
        gsiButtonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(gsiButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
        setGsiReady(true);
      } catch {
        setGsiReady(false);
      }
    };

    if (window.google?.accounts?.id) {
      mountGsi();
    } else {
      const existingScript = document.getElementById(
        'google-gsi-client-script'
      ) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener('load', mountGsi);
        return () => {
          cancelled = true;
          existingScript.removeEventListener('load', mountGsi);
        };
      }
      const script = document.createElement('script');
      script.id = 'google-gsi-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = mountGsi;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, firebaseUser, finishUserSignIn]);

  if (!isOpen) return null;

  const handleGooglePopupLogin = async () => {
    setProviderError(null);
    setAuthSuccess(null);
    setIsLoading(true);
    try {
      const user = await signInWithGoogleReal();
      await finishUserSignIn(user, 'Google Popup Sign-In');
    } catch (err: any) {
      setProviderError(parseFirebaseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSandboxLogin = async (
    targetEmail = 'shamimrakib015@gmail.com',
    targetName = 'Shamim Rakib'
  ) => {
    setProviderError(null);
    setAuthSuccess(null);
    setIsLoading(true);
    try {
      const user = await signInWithGoogleSandbox(targetEmail, targetName);
      await finishUserSignIn(user, 'Google Instant Sign-In');
    } catch (err: any) {
      setProviderError(parseFirebaseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickCreateAccountFromError = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || password.length < 6) return;
    setAuthMode('SIGN_UP');
    setProviderError(null);
    setIsLoading(true);
    try {
      const res = await registerOrLoginRealEmailPassword(cleanEmail, password, true);
      await finishUserSignIn(res.user, 'Email Account Created');
    } catch (err: any) {
      setProviderError(parseFirebaseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProviderError(null);
    setAuthSuccess(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setProviderError({
        code: 'auth/invalid-email',
        messageEn: 'Please enter a valid email address.',
        messageBn: 'অনুগ্রহ করে সঠিক ইমেইল ঠিকানা লিখুন।',
        needsConsoleProviderEnable: false,
        consoleUrl: '',
      });
      return;
    }

    if (authMode === 'RESET') {
      setIsLoading(true);
      try {
        await sendRealPasswordReset(cleanEmail);
        setAuthSuccess(
          lang === 'bn'
            ? `✓ পাসওয়ার্ড রিসেট লিংক ${cleanEmail}-এ পাঠানো হয়েছে।`
            : `✓ Password reset link sent to ${cleanEmail}.`
        );
        setAuthMode('SIGN_IN');
      } catch (err: any) {
        setProviderError(parseFirebaseAuthError(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setProviderError({
        code: 'auth/weak-password',
        messageEn: 'Password must be at least 6 characters.',
        messageBn: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।',
        needsConsoleProviderEnable: false,
        consoleUrl: '',
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await registerOrLoginRealEmailPassword(
        cleanEmail,
        password,
        authMode === 'SIGN_UP'
      );
      await finishUserSignIn(
        res.user,
        authMode === 'SIGN_UP' ? 'Email Account Created' : 'Email Sign-In'
      );
    } catch (err: any) {
      setProviderError(parseFirebaseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutClick = async () => {
    setIsLoading(true);
    try {
      await clearDevOtpSandboxSession().catch(() => {});
      localStorage.removeItem('bloodsearch_current_user');
      localStorage.removeItem('bloodsearch_pending_profile_draft');
      await signOutReal();
      setLocalProfile(null);
      window.dispatchEvent(new Event('bloodsearch_user_changed'));
      setAuthSuccess(lang === 'bn' ? '✓ সাইন আউট সম্পন্ন হয়েছে।' : '✓ Signed out cleanly.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto modal-scroll-contain">
      <div className="w-full max-w-md my-auto rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-left">
        {/* Rich Jewel Header */}
        <div className="hero-brand-surface px-5 py-4 flex items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="mark" size="sm" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white truncate">
                {firebaseUser
                  ? lang === 'bn'
                    ? 'আপনার অ্যাকাউন্ট'
                    : 'Your Account'
                  : lang === 'bn'
                    ? 'সহজ সাইন ইন / লগইন'
                    : 'Easy Sign In & Account'}
              </h2>
              <p className="text-xs text-rose-200 truncate">
                {lang === 'bn'
                  ? 'Gmail অথবা ইমেইল দিয়ে ১ ক্লিকেই প্রবেশ করুন — প্রোফাইল তথ্য আপনি নিজেই দেবেন'
                  : 'Sign in with Gmail or Email — fill in your own profile details freely'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] rounded-lg bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {authSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          {providerError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{lang === 'bn' ? providerError.messageBn : providerError.messageEn}</span>
              </div>
              {providerError.canQuickRegister && email && password.length >= 6 && (
                <div className="pt-2 border-t border-rose-200/60 dark:border-rose-800/60 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-rose-600 dark:text-rose-300">
                    {lang === 'bn' ? 'এই ইমেইল ও পাসওয়ার্ডে নতুন একাউন্ট খুলবেন?' : 'Create account with these credentials?'}
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickCreateAccountFromError}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    {lang === 'bn' ? '✓ এখনই নতুন একাউন্ট খুলুন' : '✓ Create Account Now'}
                  </button>
                </div>
              )}
            </div>
          )}

          {firebaseUser ? (
            /* Signed-in view: direct button to edit/fill user's own profile details */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {localProfile?.name ||
                      (lang === 'bn' ? 'প্রোফাইল তথ্য এখনো দেওয়া হয়নি' : 'Profile details not set yet')}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {firebaseUser.email}
                  </div>
                  {localProfile && (
                    <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                      {localProfile.bloodGroup} · {localProfile.phone} · {localProfile.upazila}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenRegister) onOpenRegister();
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg btn-crimson text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>
                    {localProfile
                      ? lang === 'bn'
                        ? 'প্রোফাইল এডিট করুন'
                        : 'Edit My Profile'
                      : lang === 'bn'
                        ? 'নিজের প্রোফাইল সাজান'
                        : 'Set Up My Profile'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOutClick}
                  disabled={isLoading}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg btn-surface hover:bg-rose-600 hover:text-white hover:border-rose-600 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{lang === 'bn' ? 'লগআউট' : 'Sign Out'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Clean 2-Way Easy Login: 1) Gmail Button  2) Email + Password */
            <div className="space-y-4">
              {/* 1. Primary 1-Click Gmail / Google Login */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGooglePopupLogin}
                  disabled={isLoading}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-lg bg-[#0b2239] hover:bg-[#dc2626] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-md cursor-pointer transition-colors"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0 bg-white rounded-xs p-0.5" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                      />
                    </svg>
                  )}
                  <span>
                    {lang === 'bn'
                      ? 'Gmail / Google দিয়ে লগইন করুন'
                      : 'Continue with Gmail / Google'}
                  </span>
                </button>

                {import.meta.env.DEV && (
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handleGoogleSandboxLogin('shamimrakib015@gmail.com', 'Shamim Rakib')}
                      disabled={isLoading}
                      className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer py-1"
                    >
                      <span>⚡ {lang === 'bn' ? 'ডেভেলপমেন্ট সুপার অ্যাডমিন লগইন' : 'Development Super Admin Login'}</span>
                    </button>
                  </div>
                )}

                <div
                  ref={gsiButtonRef}
                  className={`flex justify-center ${gsiReady ? 'pt-0.5' : 'hidden'}`}
                />
              </div>

              <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span>{lang === 'bn' ? 'অথবা ইমেইল ও পাসওয়ার্ড' : 'OR EMAIL & PASSWORD'}</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              {/* Mode Switcher: Sign In vs Create Account */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('SIGN_IN');
                    setProviderError(null);
                  }}
                  className={`min-h-[38px] rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    authMode === 'SIGN_IN'
                      ? 'bg-[#dc2626] text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'bn' ? 'সাইন ইন (Login)' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('SIGN_UP');
                    setProviderError(null);
                  }}
                  className={`min-h-[38px] rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    authMode === 'SIGN_UP'
                      ? 'bg-[#059669] text-white shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'bn' ? 'নতুন অ্যাকাউন্ট' : 'Create Account'}
                </button>
              </div>

              {/* Simple Email + Password Form */}
              <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                <div>
                  <label htmlFor="auth-modal-email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {lang === 'bn' ? 'আপনার ইমেইল (Gmail / Email) *' : 'Email Address *'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                    <input
                      id="auth-modal-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full h-11 pl-9 pr-3.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {authMode !== 'RESET' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="auth-modal-password" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {lang === 'bn' ? 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *' : 'Password (min 6 chars) *'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('RESET');
                          setProviderError(null);
                        }}
                        className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        {lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                      <input
                        id="auth-modal-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full h-11 pl-9 pr-10 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    authMode === 'SIGN_UP' ? 'btn-emerald' : 'btn-crimson'
                  }`}
                >
                  {isLoading && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
                  <span>
                    {authMode === 'RESET'
                      ? lang === 'bn'
                        ? 'পাসওয়ার্ড রিসেট লিংক পাঠান'
                        : 'Send Password Reset Link'
                      : authMode === 'SIGN_UP'
                        ? lang === 'bn'
                          ? 'অ্যাকাউন্ট খুলুন ও প্রোফাইল সাজান'
                          : 'Create Account & Set Up Profile'
                        : lang === 'bn'
                          ? 'সাইন ইন করুন'
                          : 'Sign In Now'}
                  </span>
                </button>

                {authMode === 'RESET' && (
                  <button
                    type="button"
                    onClick={() => setAuthMode('SIGN_IN')}
                    className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white py-1 cursor-pointer"
                  >
                    {lang === 'bn' ? '← সাইন ইন পেজে ফিরে যান' : '← Back to Sign In'}
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
