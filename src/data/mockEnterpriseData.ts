import { BadgeItem, Conversation, BloodStockItem, IncidentItem, BloodGroup } from '../types';

/**
 * Clean Badge Milestone Catalog (Zero fake unlocked dates or pre-unlocked states).
 * Actual unlock status is computed dynamically from the signed-in user's real donation history.
 */
export const ENTERPRISE_BADGES: BadgeItem[] = [
  // Silver Badges
  {
    id: 'badge-s1',
    title: 'Silver Badge Level 1',
    category: 'SILVER',
    level: 1,
    iconColor: '#3b82f6',
    unlocked: false,
    requirements: [
      'Complete 1 verified voluntary blood donation',
      'Verify phone number & profile details',
      'Maintain eligible health screening status',
    ],
  },
  {
    id: 'badge-s2',
    title: 'Silver Badge Level 2',
    category: 'SILVER',
    level: 2,
    iconColor: '#3b82f6',
    unlocked: false,
    requirements: [
      'Complete 2 verified voluntary blood donations',
      'Respond to an emergency blood request',
    ],
  },
  {
    id: 'badge-s3',
    title: 'Silver Badge Level 3',
    category: 'SILVER',
    level: 3,
    iconColor: '#3b82f6',
    unlocked: false,
    requirements: [
      'Complete 3 verified voluntary blood donations',
      'Maintain active availability profile',
    ],
  },

  // Gold Badges
  {
    id: 'badge-g1',
    title: 'Gold Badge Level 1',
    category: 'GOLD',
    level: 1,
    iconColor: '#e11d48',
    unlocked: false,
    requirements: [
      'Reach 5 total lifetime donations',
      'Respond to a hospital emergency request',
    ],
  },
  {
    id: 'badge-g2',
    title: 'Gold Badge Level 2',
    category: 'GOLD',
    level: 2,
    iconColor: '#e11d48',
    unlocked: false,
    requirements: [
      'Reach 8 verified blood donations',
      'Maintain accurate recovery cycle records',
    ],
  },
  {
    id: 'badge-g3',
    title: 'Gold Badge Level 3',
    category: 'GOLD',
    level: 3,
    iconColor: '#e11d48',
    unlocked: false,
    requirements: [
      'Reach 10 total blood donations',
      'Inspire fellow voluntary donors in your district',
    ],
  },

  // Platinum Badges
  {
    id: 'badge-p1',
    title: 'Platinum Badge Level 1',
    category: 'PLATINUM',
    level: 1,
    iconColor: '#64748b',
    unlocked: false,
    requirements: [
      'Reach 15 verified donations across Bangladesh',
      'Sustained multi-year voluntary donor service',
    ],
  },
  {
    id: 'badge-p2',
    title: 'Platinum Badge Level 2',
    category: 'PLATINUM',
    level: 2,
    iconColor: '#64748b',
    unlocked: false,
    requirements: [
      'Reach 20 verified donations',
      'Consistent emergency hospital support',
    ],
  },
  {
    id: 'badge-p3',
    title: 'Platinum Badge Level 3',
    category: 'PLATINUM',
    level: 3,
    iconColor: '#64748b',
    unlocked: false,
    requirements: [
      'Reach 25 lifetime donations',
      'National voluntary blood service milestone',
    ],
  },

  // Diamond Badges
  {
    id: 'badge-d1',
    title: 'Diamond Badge Level 1',
    category: 'DIAMOND',
    level: 1,
    iconColor: '#0ea5e9',
    unlocked: false,
    requirements: [
      'Reach 30 lifetime donations',
      'Humanitarian voluntary blood service',
    ],
  },
  {
    id: 'badge-d2',
    title: 'Diamond Badge Level 2',
    category: 'DIAMOND',
    level: 2,
    iconColor: '#0ea5e9',
    unlocked: false,
    requirements: [
      'Reach 40 lifetime donations',
      'Community blood donor mentor',
    ],
  },
  {
    id: 'badge-d3',
    title: 'Diamond Badge Level 3',
    category: 'DIAMOND',
    level: 3,
    iconColor: '#0ea5e9',
    unlocked: false,
    requirements: [
      'Lifetime achievement: 50+ verified donations',
      'Extraordinary voluntary service to patients',
    ],
  },
];

// 100% Zero Fake Data: No dummy conversations, no preset stock, no synthetic incidents
export const INITIAL_CONVERSATIONS: Conversation[] = [];
export const BLOOD_BANK_INVENTORY: BloodStockItem[] = [];
export const COMMAND_CENTER_INCIDENTS: IncidentItem[] = [];
export const NEARBY_AVAILABILITY: Array<{
  group: BloodGroup;
  distance: string;
  stock: string;
  color: string;
}> = [];
