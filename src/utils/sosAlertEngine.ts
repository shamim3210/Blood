import { BloodGroup, BloodRequest, Language } from '../types';

export type DonationIntervalType = 'WHOLE_BLOOD' | 'PLATELET';

export interface DonationLogRecord {
  id: string;
  date: string;
  type: DonationIntervalType;
  hospital: string;
}

export interface RecoveryCountdownResult {
  isEligible: boolean;
  intervalDays: number;
  remainingDays: number;
  remainingHours: number;
  remainingMinutes: number;
  daysSinceLast: number | null;
  progressPercent: number;
  nextEligibleDateLabel: string;
  lastDonatedLabel: string;
}

/**
 * Biological RBC compatibility: can a donor of `donorGroup` donate packed red cells to `patientGroup`?
 */
export function canDonorGiveToPatient(donorGroup: BloodGroup, patientGroup: BloodGroup): boolean {
  const compatibilityMap: Record<BloodGroup, BloodGroup[]> = {
    'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    'O+': ['O+', 'A+', 'B+', 'AB+'],
    'A-': ['A-', 'A+', 'AB-', 'AB+'],
    'A+': ['A+', 'AB+'],
    'B-': ['B-', 'B+', 'AB-', 'AB+'],
    'B+': ['B+', 'AB+'],
    'AB-': ['AB-', 'AB+'],
    'AB+': ['AB+'],
  };
  return (compatibilityMap[donorGroup] || []).includes(patientGroup);
}

export function isRareNegativeGroup(group: BloodGroup): boolean {
  return group.endsWith('-');
}

export function getStoredDonationLogs(): DonationLogRecord[] {
  try {
    const raw = localStorage.getItem('bloodsearch_donation_history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Computes real live recovery countdown for either Whole Blood (90 days) or Platelet Apheresis (14 days).
 */
export function calculateRecoveryCountdown(
  lastDonatedIso?: string | null,
  donationType: DonationIntervalType = 'WHOLE_BLOOD',
  lang: Language = 'bn'
): RecoveryCountdownResult {
  const intervalDays = donationType === 'PLATELET' ? 14 : 90;

  if (!lastDonatedIso || !lastDonatedIso.trim()) {
    return {
      isEligible: true,
      intervalDays,
      remainingDays: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      daysSinceLast: null,
      progressPercent: 100,
      nextEligibleDateLabel: lang === 'bn' ? 'এখনই প্রস্তুত' : 'Eligible Now',
      lastDonatedLabel: lang === 'bn' ? 'এখনো লগ করা হয়নি' : 'Not logged yet',
    };
  }

  const parsedMs = Date.parse(
    lastDonatedIso.length === 10 ? `${lastDonatedIso}T09:00:00` : lastDonatedIso
  );

  if (Number.isNaN(parsedMs)) {
    return {
      isEligible: true,
      intervalDays,
      remainingDays: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      daysSinceLast: null,
      progressPercent: 100,
      nextEligibleDateLabel: lang === 'bn' ? 'এখনই প্রস্তুত' : 'Eligible Now',
      lastDonatedLabel: lastDonatedIso,
    };
  }

  const nowMs = Date.now();
  const totalCooldownMs = intervalDays * 24 * 60 * 60 * 1000;
  const targetMs = parsedMs + totalCooldownMs;
  const elapsedMs = Math.max(0, nowMs - parsedMs);
  const daysSinceLast = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  const lastDateObj = new Date(parsedMs);
  const lastDonatedLabel = lastDateObj.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (nowMs >= targetMs) {
    return {
      isEligible: true,
      intervalDays,
      remainingDays: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      daysSinceLast,
      progressPercent: 100,
      nextEligibleDateLabel: lang === 'bn' ? 'এখনই রক্তদানে প্রস্তুত' : 'Cleared to Donate Now',
      lastDonatedLabel,
    };
  }

  const diffMs = targetMs - nowMs;
  const remainingDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const remainingHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const progressPercent = Math.min(99, Math.max(2, Math.round((elapsedMs / totalCooldownMs) * 100)));

  const nextDateObj = new Date(targetMs);
  const nextEligibleDateLabel = nextDateObj.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    isEligible: false,
    intervalDays,
    remainingDays,
    remainingHours,
    remainingMinutes,
    daysSinceLast,
    progressPercent,
    nextEligibleDateLabel,
    lastDonatedLabel,
  };
}

let sharedAudioCtx: AudioContext | null = null;

/**
 * Synthesizes a clean two-tone clinical emergency alert chime via Web Audio API (offline-safe, zero MP3 needed).
 * Reuses a single AudioContext instance to prevent mobile browser hardware context exhaustion.
 */
export function playEmergencySosChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const baseTime = ctx.currentTime;
    const notes = [
      { freq: 784, start: 0, dur: 0.14 },
      { freq: 1046.5, start: 0.16, dur: 0.18 },
      { freq: 784, start: 0.38, dur: 0.14 },
      { freq: 1174.66, start: 0.54, dur: 0.26 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, baseTime + start);
      gain.gain.setValueAtTime(0.001, baseTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, baseTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, baseTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(baseTime + start);
      osc.stop(baseTime + start + dur + 0.02);
    });
  } catch {}
}

export async function requestSosNotificationPermission(): Promise<NotificationPermission | 'UNSUPPORTED'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'UNSUPPORTED';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function dispatchBrowserSosNotification(req: BloodRequest, lang: Language): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const title =
      lang === 'bn'
        ? `জরুরি ${req.bloodGroup} রক্তের আবেদন · ${req.district}`
        : `Emergency ${req.bloodGroup} Blood Needed · ${req.district}`;
    const body =
      lang === 'bn'
        ? `${req.hospitalName}-এ ${Math.max(1, req.unitsNeeded - req.unitsCollected)} ব্যাগ ${req.bloodGroup} রক্ত প্রয়োজন (${req.reason})।`
        : `${Math.max(1, req.unitsNeeded - req.unitsCollected)} unit(s) needed at ${req.hospitalName}.`;
    new Notification(title, {
      body,
      tag: `sos-${req.id}`,
    });
  } catch {}
}

function triggerCanvasDownload(canvas: HTMLCanvasElement, filename: string): void {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates and downloads a crisp 1600x1120 High-DPI Royal Humanitarian Certificate PNG.
 */
export function downloadRoyalCertificatePng(params: {
  donorName: string;
  bloodGroup: string;
  serialNumber: string;
  totalDonations: number;
  issueDate: string;
  lang: Language;
}): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1120;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Parchment background
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#fffef9');
  bg.addColorStop(0.5, '#fffaf0');
  bg.addColorStop(1, '#fef3c7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Royal Double Frame
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 14;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 3;
  ctx.strokeRect(58, 58, canvas.width - 116, canvas.height - 116);

  // Corner Ornaments
  const corners = [
    [76, 76],
    [canvas.width - 116, 76],
    [76, canvas.height - 116],
    [canvas.width - 116, canvas.height - 116],
  ];
  ctx.fillStyle = '#d97706';
  corners.forEach(([x, y]) => {
    ctx.fillRect(x, y, 40, 6);
    ctx.fillRect(x, y, 6, 40);
  });

  // Top Header Crest
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('BLOODSEARCH BANGLADESH · NATIONAL LIFE-SAVER REGISTRY', canvas.width / 2, 155);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText(
    params.lang === 'bn'
      ? 'জাতীয় রক্তদাতা সম্মাননা সনদপত্র'
      : 'CERTIFICATE OF HUMANITARIAN HONOR',
    canvas.width / 2,
    240
  );

  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(
    params.lang === 'bn'
      ? 'জীবন রক্ষাকারী নিঃস্বার্থ রক্তদানের আনুষ্ঠানিক স্বীকৃতিস্বরূপ'
      : 'IN OFFICIAL RECOGNITION OF SELFLESS VOLUNTARY BLOOD DONATION',
    canvas.width / 2,
    288
  );

  // Serial Pill
  ctx.fillStyle = '#fef3c7';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.fillRect(canvas.width / 2 - 260, 315, 520, 44);
  ctx.strokeRect(canvas.width / 2 - 260, 315, 520, 44);
  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`SERIAL: ${params.serialNumber}`, canvas.width / 2, 344);

  // Citation Lead
  ctx.fillStyle = '#475569';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText(
    params.lang === 'bn'
      ? 'অত্যন্ত কৃতজ্ঞতা, সম্মান ও জাতীয় গর্বের সাথে এই প্রশংসাপত্র প্রদান করা হচ্ছে:'
      : 'This prestigious citation of honor is proudly bestowed upon:',
    canvas.width / 2,
    430
  );

  // Donor Hero Name
  ctx.fillStyle = '#e11d48';
  ctx.font = 'bold 68px Georgia, serif';
  ctx.fillText(params.donorName, canvas.width / 2, 530);

  // Gold Underline
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 340, 555);
  ctx.lineTo(canvas.width / 2 + 340, 555);
  ctx.stroke();

  // Citation Paragraph
  ctx.fillStyle = '#1e293b';
  ctx.font = '26px sans-serif';
  const line1 =
    params.lang === 'bn'
      ? `যিনি "${params.bloodGroup}" রক্তের গ্রুপের গর্বিত ধারক হিসেবে মুমূর্ষু রোগীর জীবন বাঁচাতে স্বেচ্ছায় এগিয়ে এসেছেন`
      : `For exceptional humanitarian service as a verified voluntary donor of Blood Group "${params.bloodGroup}",`;
  const line2 =
    params.lang === 'bn'
      ? `এবং এ পর্যন্ত মোট ${params.totalDonations} বার সফল রক্তদানের মাধ্যমে মানবিকতার অনন্য দৃষ্টান্ত স্থাপন করেছেন।`
      : `having completed ${params.totalDonations} life-saving blood donation(s) across Bangladesh.`;
  ctx.fillText(line1, canvas.width / 2, 630);
  ctx.fillText(line2, canvas.width / 2, 672);

  // 3 Stat Boxes
  const boxes = [
    { label: 'BLOOD GROUP', val: params.bloodGroup, color: '#e11d48' },
    { label: 'TOTAL DONATIONS', val: `${params.totalDonations} BAG(S)`, color: '#d97706' },
    { label: 'VERIFICATION', val: 'VERIFIED HERO', color: '#059669' },
  ];
  boxes.forEach((b, idx) => {
    const bx = 260 + idx * 380;
    const by = 730;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.fillRect(bx, by, 320, 100);
    ctx.strokeRect(bx, by, 320, 100);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(b.label, bx + 160, by + 36);

    ctx.fillStyle = b.color;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(b.val, bx + 160, by + 76);
  });

  // Signatures & Gold Seal
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(190, 960);
  ctx.lineTo(540, 960);
  ctx.moveTo(1060, 960);
  ctx.lineTo(1410, 960);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'italic bold 24px Georgia, serif';
  ctx.fillText('ডা. তানভীরুল ইসলাম', 365, 945);
  ctx.fillText('জাতীয় সমন্বয়ক পর্ষদ', 1235, 945);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText('রক্ত সঞ্চালন বিশেষজ্ঞ · BloodSearch BD', 365, 992);
  ctx.fillText(`ইস্যু তারিখ: ${params.issueDate}`, 1235, 992);

  // Center Gold Medallion
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 950, 68, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fef3c7';
  ctx.stroke();

  ctx.fillStyle = '#451a03';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('GOLD HONOR', canvas.width / 2, 946);
  ctx.font = 'bold 15px monospace';
  ctx.fillText('VERIFIED', canvas.width / 2, 970);

  triggerCanvasDownload(
    canvas,
    `BloodSearch-Certificate-${params.serialNumber.replace(/[^a-zA-Z0-9_-]/g, '')}.png`
  );
}

/**
 * Generates and downloads a 1080x680 Smart Donor PVC Digital ID Card PNG.
 */
export function downloadSmartDonorIdCardPng(params: {
  donorName: string;
  bloodGroup: string;
  idCardNumber: string;
  phone: string;
  district: string;
  totalDonations: number;
  isAvailable: boolean;
}): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Card Dark Slate + Crimson Header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const headerGrad = ctx.createLinearGradient(0, 0, canvas.width, 170);
  headerGrad.addColorStop(0, '#be123c');
  headerGrad.addColorStop(1, '#e11d48');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, canvas.width, 165);

  // Header Brand Text
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('BLOODSEARCH BANGLADESH', 48, 76);

  ctx.fillStyle = '#fecdd3';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('NATIONAL SMART BLOOD DONOR IDENTITY PASS', 48, 118);

  // Blood Group Giant Crest on Right
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(850, 36, 180, 180);
  ctx.strokeStyle = '#fb7185';
  ctx.lineWidth = 6;
  ctx.strokeRect(850, 36, 180, 180);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e11d48';
  ctx.font = 'bold 80px sans-serif';
  ctx.fillText(params.bloodGroup, 940, 145);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('BLOOD GROUP', 940, 192);

  // Donor Details Left Column
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('DONOR FULL NAME', 48, 235);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(params.donorName.slice(0, 32), 48, 288);

  const cleanCardPhone =
    params.phone && params.phone !== '01700000000' && params.phone !== '—'
      ? params.phone
      : 'Verified on App';

  const fields = [
    { label: 'SMART CARD ID', value: params.idCardNumber },
    { label: 'DISTRICT / ZONE', value: params.district || 'Bangladesh' },
    { label: 'CONTACT PHONE', value: cleanCardPhone },
    {
      label: 'DONATION STATUS',
      value:
        params.totalDonations > 0
          ? `${params.totalDonations} Time(s) Donated`
          : params.isAvailable
          ? 'Ready Donor'
          : 'Registered Donor',
    },
  ];

  fields.forEach((f, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const fx = 48 + col * 390;
    const fy = 365 + row * 110;

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(f.label, fx, fy);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(String(f.value).slice(0, 24), fx, fy + 38);
  });

  // Mini Verification Matrix on Bottom Right
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(850, 260, 180, 180);
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if ((r + c * 3 + params.idCardNumber.charCodeAt(c % params.idCardNumber.length)) % 2 === 0) {
        ctx.fillRect(868 + c * 21, 278 + r * 21, 16, 16);
      }
    }
  }
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(866, 276, 40, 40);
  ctx.fillRect(974, 276, 40, 40);
  ctx.fillRect(866, 384, 40, 40);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(874, 284, 24, 24);
  ctx.fillRect(982, 284, 24, 24);
  ctx.fillRect(874, 392, 24, 24);

  // Footer Strip
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 590, canvas.width, 90);
  ctx.textAlign = 'left';
  ctx.fillStyle = params.isAvailable ? '#34d399' : '#fbbf24';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(
    params.isAvailable
      ? '● STATUS: ACTIVE & ELIGIBLE FOR EMERGENCY DONATION'
      : '● STATUS: POST-DONATION RECOVERY COOLDOWN',
    48,
    644
  );

  triggerCanvasDownload(
    canvas,
    `BloodSearch-SmartID-${params.idCardNumber.replace(/[^a-zA-Z0-9_-]/g, '')}.png`
  );
}

const BN_DIGITS_TO_ASCII: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

function toAsciiPhone(phone: string): string {
  const ascii = (phone || '').replace(/[০-৯]/g, (ch) => BN_DIGITS_TO_ASCII[ch] ?? ch);
  const digits = ascii.replace(/\D/g, '');
  if (digits.length === 11 && /^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
  if (digits.length === 13 && /^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
  if (digits.length === 10 && /^1[3-9]\d{8}$/.test(digits)) return `+880${digits}`;
  return ascii.replace(/[^0-9+]/g, '');
}

/**
 * Builds a universal cross-platform native SMS URI (works with zero mobile internet on both Android & iOS).
 */
export function buildOfflineEmergencySmsUri(phone: string, bodyText: string): string {
  const cleanDigits = toAsciiPhone(phone);
  const isApple =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
  const sep = isApple ? '&' : '?';
  return `sms:${cleanDigits}${sep}body=${encodeURIComponent(bodyText)}`;
}

/**
 * Copies text reliably across desktop, mobile, and sandboxed preview iframes.
 */
export async function copyTextReliable(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback for iframe permissions policy
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Shares via native Web Share sheet ONLY in top-level mobile/desktop windows;
 * inside iframes or when Web Share fails/cancels, falls back to reliable clipboard copy.
 */
export async function shareOrCopyEmergencyText(params: {
  title: string;
  text: string;
  url?: string;
}): Promise<'SHARED' | 'COPIED'> {
  const fullPayload = params.url ? `${params.text}\n${params.url}` : params.text;
  const isTopWindow =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self === window.top;
      } catch {
        return false;
      }
    })();

  if (isTopWindow && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: params.title,
        text: params.text,
        url: params.url,
      });
      return 'SHARED';
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        await copyTextReliable(fullPayload);
        return 'COPIED';
      }
    }
  }

  await copyTextReliable(fullPayload);
  return 'COPIED';
}

/**
 * Live relative timestamp formatter so request cards never freeze on "Just now".
 */
export function formatRelativeRequestTime(
  createdAtMs?: number,
  fallbackLabel?: string,
  lang: Language = 'bn',
  nowMs: number = Date.now()
): string {
  if (!createdAtMs || createdAtMs <= 0) {
    if (fallbackLabel && fallbackLabel !== 'Just now' && fallbackLabel !== 'এইমাত্র') {
      return fallbackLabel;
    }
    return lang === 'bn' ? 'সাম্প্রতিক আবেদন' : 'Recent request';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
  if (diffSec < 60) {
    return lang === 'bn' ? 'এইমাত্র পোস্ট করা হয়েছে' : 'Posted just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return lang === 'bn' ? `${diffMin} মিনিট আগে` : `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return lang === 'bn' ? `${diffHours} ঘণ্টা আগে` : `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) {
    return lang === 'bn' ? `${diffDays} দিন আগে` : `${diffDays}d ago`;
  }
  return new Date(createdAtMs).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Generates and downloads a crisp 1080x1920 High-DPI Mobile Lock-Screen Medical ID (ICE) Wallpaper PNG.
 * Designed so the top clock area stays unobstructed while the lower-middle displays emergency medical info.
 */
export function downloadIceLockScreenWallpaperPng(params: {
  fullName: string;
  bloodGroup: string;
  guardianName: string;
  guardianPhone: string;
  secondaryPhone?: string;
  medicalConditions?: string;
  allergies?: string;
  district?: string;
}): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep OLED-friendly dark slate background (saves phone battery & keeps OS clock crystal clear)
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#090d16');
  bg.addColorStop(0.45, '#0f172a');
  bg.addColorStop(1, '#180c14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle top hint below phone lock-screen clock zone (y = 0..560 reserved for OS Clock/Notifications)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('IN CASE OF EMERGENCY (ICE) · জরুরি মেডিকেল পরিচয়পত্র', canvas.width / 2, 585);

  // Main Medical Card Container (y = 630..1690)
  const cx = 68;
  const cy = 625;
  const cw = canvas.width - 136;
  const ch = 1065;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 6;
  ctx.strokeRect(cx, cy, cw, ch);

  // Red Emergency Header Banner inside card
  const hdr = ctx.createLinearGradient(cx, cy, cx + cw, cy + 165);
  hdr.addColorStop(0, '#be123c');
  hdr.addColorStop(1, '#e11d48');
  ctx.fillStyle = hdr;
  ctx.fillRect(cx, cy, cw, 165);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('EMERGENCY MEDICAL ID', cx + 44, cy + 78);
  ctx.fillStyle = '#fecdd3';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('দুর্ঘটনা বা অচেতন অবস্থায় নিচের নম্বরে কল করুন', cx + 44, cy + 126);

  // Giant Blood Group Badge on Right
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx + cw - 230, cy + 28, 190, 190);
  ctx.strokeStyle = '#fb7185';
  ctx.lineWidth = 6;
  ctx.strokeRect(cx + cw - 230, cy + 28, 190, 190);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e11d48';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText(params.bloodGroup || 'O+', cx + cw - 135, cy + 138);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('BLOOD GROUP', cx + cw - 135, cy + 190);

  // Person Name & Location
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('PATIENT / HOLDER NAME', cx + 44, cy + 248);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText((params.fullName || 'BloodSearch User').slice(0, 26), cx + 44, cy + 308);

  if (params.district) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`ঠিকানা / জেলা: ${params.district.slice(0, 32)}`, cx + 44, cy + 354);
  }

  // Primary Emergency Guardian Contact Box
  const gx = cx + 40;
  const gy = cy + 395;
  const gw = cw - 80;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(gx, gy, gw, 235);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.strokeRect(gx, gy, gw, 235);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('☎ EMERGENCY GUARDIAN CONTACT (জরুরি অভিভাবক)', gx + 32, gy + 48);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText((params.guardianName || 'পরিবারের অভিভাবক').slice(0, 30), gx + 32, gy + 102);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 54px monospace';
  ctx.fillText((params.guardianPhone || '999').slice(0, 20), gx + 32, gy + 174);

  if (params.secondaryPhone && params.secondaryPhone.trim()) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`বিকল্প নম্বর: ${params.secondaryPhone.trim().slice(0, 20)}`, gx + 32, gy + 216);
  }

  // Allergies & Medical Conditions Box
  const mx = cx + 40;
  const my = cy + 665;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(mx, my, gw, 250);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx, my, gw, 250);

  ctx.fillStyle = '#fda4af';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('⚕ MEDICAL CONDITIONS & ALLERGIES (রোগ ও অ্যালার্জি)', mx + 32, my + 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(
    `রোগের তথ্য: ${(params.medicalConditions || 'কোনো দীর্ঘমেয়াদী রোগ নেই (None)').slice(0, 36)}`,
    mx + 32,
    my + 112
  );

  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(
    `ওষুধ/অ্যালার্জি: ${(params.allergies || 'কোনো অ্যালার্জি নেই (No Known Allergies)').slice(0, 36)}`,
    mx + 32,
    my + 172
  );

  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  ctx.fillText('জাতীয় জরুরি সেবা: 999  ·  স্বাস্থ্য বাতায়ন: 16263', mx + 32, my + 224);

  // Footer inside card
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('GENERATED BY BLOODSEARCH BANGLADESH · EMERGENCY CARE NETWORK', canvas.width / 2, cy + ch - 46);

  triggerCanvasDownload(
    canvas,
    `BloodSearch-ICE-Wallpaper-${(params.bloodGroup || 'O').replace('+', 'Pos').replace('-', 'Neg')}.png`
  );
}

/**
 * Generates and downloads a crisp 1080x1080 Square HD Emergency Blood Appeal Poster PNG for Facebook, WhatsApp & Messenger.
 */
export function downloadEmergencyPosterPng(params: {
  bloodGroup: string;
  unitsNeeded: number;
  patientName: string;
  hospitalName: string;
  location: string;
  contactPhone: string;
  requiredDate: string;
  reason: string;
}): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Crimson-Dark Emergency Background
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#4c0519');
  bg.addColorStop(0.5, '#881337');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Frame
  ctx.strokeStyle = '#fb7185';
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  // Top Urgent Strip
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(36, 36, canvas.width - 72, 130);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('জরুরি রক্তের আবেদন · EMERGENCY SOS', canvas.width / 2, 118);

  // Giant Blood Group Circle Badge
  ctx.beginPath();
  ctx.arc(canvas.width / 2, 330, 128, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#fda4af';
  ctx.stroke();

  ctx.fillStyle = '#be123c';
  ctx.font = 'bold 108px sans-serif';
  ctx.fillText(params.bloodGroup, canvas.width / 2, 358);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`${params.unitsNeeded} ব্যাগ প্রয়োজন`, canvas.width / 2, 412);

  // Patient & Hospital Info Card
  const bx = 80;
  const by = 495;
  const bw = canvas.width - 160;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(bx, by, bw, 385);
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, 385);

  ctx.textAlign = 'left';
  const rows = [
    { label: 'রোগীর নাম:', value: params.patientName },
    { label: 'হাসপাতাল:', value: params.hospitalName },
    { label: 'অবস্থান:', value: params.location },
    { label: 'প্রয়োজনের সময়:', value: params.requiredDate },
    { label: 'রোগের কারণ:', value: params.reason },
  ];

  rows.forEach((r, idx) => {
    const ry = by + 62 + idx * 64;
    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(r.label, bx + 36, ry);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(String(r.value || '').slice(0, 38), bx + 235, ry);
  });

  // Bottom Contact Callout Bar
  ctx.fillStyle = '#059669';
  ctx.fillRect(80, 905, bw, 105);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px monospace';
  ctx.fillText(`☎ যোগাযোগ: ${params.contactPhone}`, canvas.width / 2, 972);

  triggerCanvasDownload(
    canvas,
    `BloodSearch-SOS-Poster-${params.bloodGroup.replace('+', 'Pos').replace('-', 'Neg')}.png`
  );
}
