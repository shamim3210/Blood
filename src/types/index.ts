export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type UrgencyLevel = 'CRITICAL' | 'URGENT' | 'STANDARD';

export type RequiredTimeWindow = 'IMMEDIATE_2H' | 'TODAY_6H' | 'WITHIN_24H' | 'SCHEDULED';

export type RequestStatus = 'PENDING' | 'ACTIVE' | 'ACCEPTED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';

export type RequestLifecycleState =
  | 'SEARCHING'
  | 'DONORS_NOTIFIED'
  | 'RESPONSES_RECEIVED'
  | 'CONTACT_ATTEMPTED'
  | 'DONOR_CONFIRMED'
  | 'FULFILLED'
  | 'NO_RESPONSE'
  | 'CANCELLED'
  | 'EXPIRED';

export type DonorAvailabilityStatus = 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'DND';

export type AvailabilityConfidence =
  | 'CONFIRMED_RECENT'
  | 'UNKNOWN_UNCONFIRMED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'DND';

export type ContactVisibility = 'PUBLIC_OPT_IN' | 'VERIFIED_SEEKERS' | 'REQUEST_ONLY';

export type PortalMode = 'showcase' | 'donor_app' | 'command_center' | 'blood_bank' | 'admin' | 'architecture';

export interface Responder {
  id: string;
  responderUid?: string;
  name: string;
  phone: string;
  bloodGroup: BloodGroup;
  timestamp: string;
  notes?: string;
  avatar?: string;
}

export interface ContactAttemptOutcome {
  donorId: string;
  donorName: string;
  channel: 'CALL' | 'WHATSAPP' | 'SMS' | 'CHAT' | 'CONSENT_REQUEST';
  outcome: 'NO_ANSWER' | 'BUSY_UNAVAILABLE' | 'CONTACTED_AWAITING' | 'CONFIRMED';
  timestampIso: string;
}

export interface BloodRequest {
  id: string;
  authorUid?: string;
  patientName: string;
  patientAge: number;
  bloodGroup: BloodGroup;
  unitsNeeded: number;
  unitsCollected: number;
  hospitalName: string;
  division: string;
  district: string;
  upazila: string;
  urgency: UrgencyLevel;
  requiredTimeWindow?: RequiredTimeWindow;
  contactName: string;
  contactPhone: string;
  seekerSharePhone?: boolean;
  requiredDate: string;
  reason: string;
  responders: Responder[];
  createdAt: string;
  createdAtMs?: number;
  expiresAtMs?: number;
  status: RequestStatus;
  lifecycleState?: RequestLifecycleState;
  notifiedCount?: number;
  viewedCount?: number;
  respondedCount?: number;
  contactAttemptsCount?: number;
  confirmedDonorId?: string;
  confirmedDonorName?: string;
  escalationLevel?: number;
  searchRadiusKm?: number;
  escalationIntervalMinutes?: number;
  lastEscalatedAtMs?: number;
  prescriptionImage?: string;
  distanceKm?: number;
  exchangeAllowed?: boolean;
  lat?: number;
  lng?: number;
}

export interface HealthConditions {
  nonAlcoholic: boolean;
  hivNegative: boolean;
  rheumaticFeverNegative: boolean;
  covidNegative: boolean;
  thalassemiaNegative: boolean;
  hepatitisNegative: boolean;
  normalBloodPressure: boolean;
}

export interface Donor {
  id: string;
  name: string;
  bloodGroup: BloodGroup;
  division: string;
  district: string;
  upazila: string;
  phone: string;
  available: boolean;
  availabilityStatus?: DonorAvailabilityStatus;
  availabilityConfirmedAtMs?: number;
  updatedAtMs?: number;
  shareDirectContact?: boolean;
  contactVisibility?: ContactVisibility;
  allowCall?: boolean;
  allowWhatsApp?: boolean;
  allowSms?: boolean;
  allowInAppChat?: boolean;
  emergencyAlertsOptIn?: boolean;
  alertsPaused?: boolean;
  lastDonatedDate: string; // YYYY-MM-DD
  totalDonations: number;
  verifiedBadge: boolean;
  rating: number;
  reviewsCount: number;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  weightKg: number;
  hospitalAffiliation?: string;
  bio?: string;
  avatar?: string;
  healthConditions?: HealthConditions;
  reliabilityScore?: number; // 0 - 100%
  facebookUrl?: string;
  whatsappPhone?: string;
  isCloudRecord?: boolean;
  panelType?: 'USER' | 'ADMIN';
  lat?: number;
  lng?: number;
}

export interface RequestAlertItem {
  id: string;
  requestId: string;
  authorUid: string;
  donorUid: string;
  bloodGroup: BloodGroup;
  hospitalName: string;
  district: string;
  urgency: UrgencyLevel;
  escalationLevel: number;
  seekerCallbackPhone?: string;
  deliveryState:
    | 'DISPATCHED'
    | 'VIEWED'
    | 'RESPONDED_ACCEPT'
    | 'RESPONDED_DECLINE'
    | 'STOPPED_RESOLVED';
  responseNote?: string;
  responderPhone?: string;
  responderName?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ContactConsentRequestItem {
  id: string;
  seekerUid: string;
  seekerName: string;
  seekerPhone: string;
  donorUid: string;
  donorName: string;
  bloodGroupNeeded: BloodGroup;
  hospitalName: string;
  urgency: UrgencyLevel;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  approvedPhone?: string;
  approvedWhatsApp?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type LiveDonorTripStatus = 'ON_THE_WAY' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';

export interface LiveDonorTrip {
  id: string;
  requestId: string;
  seekerUid: string;
  donorUid: string;
  donorName: string;
  bloodGroup: BloodGroup;
  responderPhone: string;
  hospitalName: string;
  district: string;
  lat: number;
  lng: number;
  hospitalLat: number;
  hospitalLng: number;
  distanceKm: number;
  etaMinutes: number;
  areaLabel: string;
  tripStatus: LiveDonorTripStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AuditLogEntry {
  id: string;
  action:
    | 'UNMASK_PHONE'
    | 'CREATE_SOS'
    | 'RESPOND_SOS'
    | 'STATUS_CHANGE'
    | 'DONOR_REGISTERED'
    | 'DISPATCH_INCIDENT'
    | 'STOCK_UPDATE'
    | 'ESCALATE_SOS'
    | 'CONTACT_ATTEMPT';
  actorName: string;
  targetDetails: string;
  timestamp: string;
  securityHash: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isVoice?: boolean;
  voiceDuration?: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface Conversation {
  id: string;
  participantName: string;
  participantRole: string;
  participantAvatar: string;
  bloodGroup: BloodGroup;
  hospital: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  online: boolean;
  messages: ChatMessage[];
  facebookUrl?: string;
  whatsappPhone?: string;
  participantPhone?: string;
}

export interface BadgeItem {
  id: string;
  title: string;
  category: 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  level: 1 | 2 | 3;
  iconColor: string;
  unlocked: boolean;
  unlockedDate?: string;
  requirements: string[];
}

export interface BloodStockItem {
  bloodGroup: BloodGroup;
  unitsInStock: number;
  requiredUnits: number;
  expiryUnder15Days: number;
  expiry15To30Days: number;
  expiry30To45Days: number;
  status: 'HIGH' | 'SUFFICIENT' | 'CRITICAL';
}

export interface IncidentItem {
  id: string;
  title: string;
  type: string;
  bloodGroup: BloodGroup;
  units: number;
  hospital: string;
  location: string;
  district: string;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'Active Incident' | 'In Progress' | 'Assigned' | 'Resolved';
  timeAgo: string;
  assignee?: string;
  lat: number;
  lng: number;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  bloodGroup: BloodGroup;
  division: string;
  district: string;
  upazila: string;
  photoUrl?: string;
  role: 'USER' | 'ADMIN';
  verifiedStatus: boolean;
  idCardNumber: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  weightKg: number;
  availableToDonate: boolean;
  availabilityStatus?: DonorAvailabilityStatus;
  availabilityConfirmedAtMs?: number;
  shareDirectContact?: boolean;
  contactVisibility?: ContactVisibility;
  allowCall?: boolean;
  allowWhatsApp?: boolean;
  allowSms?: boolean;
  emergencyAlertsOptIn?: boolean;
  alertsPaused?: boolean;
  lastDonationDate?: string;
  totalDonations: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  facebookUrl?: string;
  whatsappPhone?: string;
  authSource?: 'NEON_OIDC' | 'NEON_PASSWORD' | 'NEON_PHONE_OTP' | 'DEV_OTP_SANDBOX';
  mobileOperator?: string;
  createdAt: string;
}

export type ActiveTab =
  | 'home'
  | 'onboarding'
  | 'search'
  | 'sos'
  | 'requests'
  | 'compatibility'
  | 'eligibility'
  | 'security'
  | 'chat'
  | 'badges'
  | 'profile'
  | 'map'
  | 'admin';

export type Language = 'bn' | 'en';
