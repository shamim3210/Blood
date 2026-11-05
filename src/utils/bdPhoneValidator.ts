/**
 * Bangladesh Mobile Phone Validation & E.164 Normalization Utility
 * Supports all 5 BTRC-licensed Bangladesh mobile operators:
 * - Grameenphone (GP): 017, 013
 * - Robi: 018
 * - Airtel (Robi/Airtel): 016
 * - Banglalink: 019, 014
 * - Teletalk: 015
 *
 * Accepts:
 * - +8801XXXXXXXXX
 * - 01XXXXXXXXX
 * (Also normalizes Bangla digits ০-৯ and strips harmless formatting spaces/hyphens)
 */

export type BangladeshMobileOperator =
  | 'GP'
  | 'ROBI'
  | 'AIRTEL'
  | 'BANGLALINK'
  | 'TELETALK';

export interface BangladeshPhoneValidationResult {
  valid: boolean;
  e164: string;
  local11: string;
  national10: string;
  operator: BangladeshMobileOperator | null;
  operatorLabelEn: string;
  operatorLabelBn: string;
  errorCode?:
    | 'EMPTY'
    | 'INVALID_CHARACTERS'
    | 'FOREIGN_COUNTRY_CODE'
    | 'INVALID_OPERATOR_PREFIX'
    | 'INVALID_LENGTH'
    | 'INVALID_FORMAT';
  errorEn?: string;
  errorBn?: string;
}

const BANGLA_TO_ASCII_DIGITS: Record<string, string> = {
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

const OPERATOR_BY_PREFIX: Record<
  string,
  { code: BangladeshMobileOperator; en: string; bn: string }
> = {
  '017': { code: 'GP', en: 'Grameenphone (GP)', bn: 'গ্রামীণফোন (GP)' },
  '013': { code: 'GP', en: 'Grameenphone (GP)', bn: 'গ্রামীণফোন (GP)' },
  '018': { code: 'ROBI', en: 'Robi', bn: 'রবি (Robi)' },
  '016': { code: 'AIRTEL', en: 'Airtel', bn: 'এয়ারটেল (Airtel)' },
  '019': { code: 'BANGLALINK', en: 'Banglalink', bn: 'বাংলালিংক (Banglalink)' },
  '014': { code: 'BANGLALINK', en: 'Banglalink', bn: 'বাংলালিংক (Banglalink)' },
  '015': { code: 'TELETALK', en: 'Teletalk', bn: 'টেলিটক (Teletalk)' },
};

export function toAsciiPhoneDigits(input: string | undefined | null): string {
  if (!input) return '';
  return String(input).replace(/[০-৯]/g, (ch) => BANGLA_TO_ASCII_DIGITS[ch] ?? ch);
}

/**
 * Validates and normalizes a Bangladesh mobile number to E.164 (+8801XXXXXXXXX).
 * Supports +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX, and 1XXXXXXXXX (when typed next to +880 UI badge).
 */
export function validateBangladeshMobile(
  rawInput: string | undefined | null,
  options?: { allowBare10DigitNational?: boolean }
): BangladeshPhoneValidationResult {
  const asciiRaw = toAsciiPhoneDigits(rawInput).trim();

  if (!asciiRaw) {
    return {
      valid: false,
      e164: '',
      local11: '',
      national10: '',
      operator: null,
      operatorLabelEn: '',
      operatorLabelBn: '',
      errorCode: 'EMPTY',
      errorEn: 'Please enter your Bangladesh mobile number (e.g. 01712345678 or +8801712345678).',
      errorBn: 'অনুগ্রহ করে আপনার বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 01712345678 বা +8801712345678)।',
    };
  }

  // Reject letters or unexpected symbols (only digits, single leading +, spaces, hyphens, parentheses allowed)
  if (!/^\+?[\d\s\-()]+$/.test(asciiRaw)) {
    return {
      valid: false,
      e164: '',
      local11: '',
      national10: '',
      operator: null,
      operatorLabelEn: '',
      operatorLabelBn: '',
      errorCode: 'INVALID_CHARACTERS',
      errorEn: 'Mobile number can only contain digits (01XXXXXXXXX or +8801XXXXXXXXX).',
      errorBn: 'মোবাইল নম্বরে শুধুমাত্র সংখ্যা ব্যবহার করুন (01XXXXXXXXX বা +8801XXXXXXXXX)।',
    };
  }

  const compact = asciiRaw.replace(/[\s\-()]/g, '');

  // If user explicitly provided a +country code that is NOT +880, reject clearly
  if (compact.startsWith('+') && !compact.startsWith('+880')) {
    return {
      valid: false,
      e164: '',
      local11: '',
      national10: '',
      operator: null,
      operatorLabelEn: '',
      operatorLabelBn: '',
      errorCode: 'FOREIGN_COUNTRY_CODE',
      errorEn: 'Only Bangladesh (+880) mobile numbers are supported.',
      errorBn: 'শুধুমাত্র বাংলাদেশের (+880) মোবাইল নম্বর সমর্থিত।',
    };
  }

  const digitsOnly = compact.replace(/^\+/, '');
  let local11 = '';

  if (digitsOnly.startsWith('880')) {
    const afterCountry = digitsOnly.slice(3);
    // Handle common typo +880017... vs standard +88017...
    if (afterCountry.startsWith('01') && afterCountry.length === 11) {
      return {
        valid: false,
        e164: '',
        local11: '',
        national10: '',
        operator: null,
        operatorLabelEn: '',
        operatorLabelBn: '',
        errorCode: 'INVALID_FORMAT',
        errorEn: 'Remove the extra 0 after +880 (use +8801XXXXXXXXX or 01XXXXXXXXX).',
        errorBn: '+880 এর পরে অতিরিক্ত ০ বাদ দিন (+8801XXXXXXXXX অথবা 01XXXXXXXXX লিখুন)।',
      };
    }
    local11 = `0${afterCountry}`;
  } else if (digitsOnly.startsWith('0')) {
    local11 = digitsOnly;
  } else if (options?.allowBare10DigitNational && digitsOnly.startsWith('1')) {
    local11 = `0${digitsOnly}`;
  } else {
    return {
      valid: false,
      e164: '',
      local11: '',
      national10: '',
      operator: null,
      operatorLabelEn: '',
      operatorLabelBn: '',
      errorCode: 'INVALID_FORMAT',
      errorEn: 'Start with 01XXXXXXXXX or +8801XXXXXXXXX (GP, Robi, Banglalink, Airtel, or Teletalk).',
      errorBn: 'নম্বরটি 01XXXXXXXXX অথবা +8801XXXXXXXXX ফরম্যাটে লিখুন (GP, Robi, Banglalink, Airtel বা Teletalk)।',
    };
  }

  // Check operator prefix as soon as at least 3 local digits exist
  const prefix3 = local11.slice(0, 3);
  const operatorMeta = OPERATOR_BY_PREFIX[prefix3] || null;

  if (local11.length >= 3 && !operatorMeta) {
    return {
      valid: false,
      e164: '',
      local11,
      national10: local11.slice(1),
      operator: null,
      operatorLabelEn: '',
      operatorLabelBn: '',
      errorCode: 'INVALID_OPERATOR_PREFIX',
      errorEn: `Invalid operator prefix "${prefix3}". Supported prefixes: 013, 014, 015, 016, 017, 018, 019.`,
      errorBn: `"${prefix3}" বৈধ অপারেটর কোড নয়। বৈধ কোডসমূহ: 013, 014, 015, 016, 017, 018, 019।`,
    };
  }

  if (local11.length !== 11 || !/^01[3-9]\d{8}$/.test(local11) || !operatorMeta) {
    return {
      valid: false,
      e164: '',
      local11,
      national10: local11.slice(1),
      operator: operatorMeta?.code ?? null,
      operatorLabelEn: operatorMeta?.en ?? '',
      operatorLabelBn: operatorMeta?.bn ?? '',
      errorCode: 'INVALID_LENGTH',
      errorEn: `Bangladesh mobile numbers must be 11 digits (01XXXXXXXXX) or +8801XXXXXXXXX. Currently ${local11.length} digits.`,
      errorBn: `বাংলাদেশি মোবাইল নম্বর ১১ সংখ্যার হতে হবে (01XXXXXXXXX বা +8801XXXXXXXXX)। বর্তমানে ${local11.length} সংখ্যা দেওয়া হয়েছে।`,
    };
  }

  const national10 = local11.slice(1);
  const e164 = `+880${national10}`;

  return {
    valid: true,
    e164,
    local11,
    national10,
    operator: operatorMeta.code,
    operatorLabelEn: operatorMeta.en,
    operatorLabelBn: operatorMeta.bn,
  };
}

/**
 * Convenience helper to detect operator while the user is still typing (>= 3 local digits).
 */
export function detectBangladeshOperatorPreview(
  rawInput: string | undefined | null
): { code: BangladeshMobileOperator; labelEn: string; labelBn: string } | null {
  const ascii = toAsciiPhoneDigits(rawInput).replace(/[\s\-()]/g, '');
  if (!ascii) return null;
  let digits = ascii.replace(/^\+/, '');
  if (digits.startsWith('880')) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith('1')) {
    digits = `0${digits}`;
  }
  const prefix3 = digits.slice(0, 3);
  const meta = OPERATOR_BY_PREFIX[prefix3];
  return meta ? { code: meta.code, labelEn: meta.en, labelBn: meta.bn } : null;
}

/**
 * Strict E.164 normalizer returning `+8801XXXXXXXXX` when valid, or best-effort `+880...` for partial UI preview.
 */
export function normalizeBangladeshE164Strict(rawInput: string | undefined | null): string | null {
  const res = validateBangladeshMobile(rawInput, { allowBare10DigitNational: true });
  return res.valid ? res.e164 : null;
}
