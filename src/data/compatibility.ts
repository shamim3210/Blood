import { BloodGroup } from '../types';

export const ALL_BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

// Red blood cell compatibility dictionary
export const RED_CELL_COMPATIBILITY: Record<
  BloodGroup,
  { canGiveTo: BloodGroup[]; canReceiveFrom: BloodGroup[]; rarityBangla: string; rarityPercent: string }
> = {
  'O-': {
    canGiveTo: ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
    canReceiveFrom: ['O-'],
    rarityBangla: 'অতি বিরল ও মূল্যবান (ইউনিভার্সাল ডোনার)',
    rarityPercent: '~1.4% (বাংলাদেশে)',
  },
  'O+': {
    canGiveTo: ['O+', 'A+', 'B+', 'AB+'],
    canReceiveFrom: ['O+', 'O-'],
    rarityBangla: 'সবচেয়ে বেশি প্রাপ্তিযোগ্য',
    rarityPercent: '~33.8% (বাংলাদেশে)',
  },
  'A-': {
    canGiveTo: ['A-', 'A+', 'AB-', 'AB+'],
    canReceiveFrom: ['A-', 'O-'],
    rarityBangla: 'খুব বিরল',
    rarityPercent: '~0.8% (বাংলাদেশে)',
  },
  'A+': {
    canGiveTo: ['A+', 'AB+'],
    canReceiveFrom: ['A+', 'A-', 'O+', 'O-'],
    rarityBangla: 'সাধারণত পর্যাপ্ত',
    rarityPercent: '~23.6% (বাংলাদেশে)',
  },
  'B-': {
    canGiveTo: ['B-', 'B+', 'AB-', 'AB+'],
    canReceiveFrom: ['B-', 'O-'],
    rarityBangla: 'খুব বিরল',
    rarityPercent: '~1.2% (বাংলাদেশে)',
  },
  'B+': {
    canGiveTo: ['B+', 'AB+'],
    canReceiveFrom: ['B+', 'B-', 'O+', 'O-'],
    rarityBangla: 'বাংলাদেশে অত্যন্ত সাধারণ',
    rarityPercent: '~32.5% (বাংলাদেশে)',
  },
  'AB-': {
    canGiveTo: ['AB-', 'AB+'],
    canReceiveFrom: ['AB-', 'A-', 'B-', 'O-'],
    rarityBangla: 'সবচেয়ে বিরল গ্রুপের একটি',
    rarityPercent: '~0.5% (বাংলাদেশে)',
  },
  'AB+': {
    canGiveTo: ['AB+'],
    canReceiveFrom: ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
    rarityBangla: 'সার্বজনীন গ্রহীতা (Universal Recipient)',
    rarityPercent: '~6.2% (বাংলাদেশে)',
  },
};

export function canDonate(donor: BloodGroup, recipient: BloodGroup): boolean {
  return RED_CELL_COMPATIBILITY[donor].canGiveTo.includes(recipient);
}

export function getCompatibleDonors(recipient: BloodGroup): BloodGroup[] {
  return RED_CELL_COMPATIBILITY[recipient].canReceiveFrom;
}

export function getCompatibleRecipients(donor: BloodGroup): BloodGroup[] {
  return RED_CELL_COMPATIBILITY[donor].canGiveTo;
}
