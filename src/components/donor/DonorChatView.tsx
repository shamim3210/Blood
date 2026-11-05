import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BloodGroup, Donor, Language, UserAccount } from '../../types';
import {
  requestFreshHighAccuracyGPS,
  reverseGeocodeBangladeshCoords,
} from '../../utils/geolocation';
import { isFakeIdentifier, isFakePersonName } from '../../data/mockDonors';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogleReal,
  isUserVerifiedForWrites,
  getStoredDevOtpSandboxSession,
  DevOtpSandboxClientSession,
  parseFirebaseAuthError,
  DEFAULT_AVATAR_DATA_URI,
  subscribeCommunityMessages,
  sendCommunityMessageInFirestore,
  deleteCommunityMessageInFirestore,
  subscribeMyDirectChats,
  subscribeDirectChatMessages,
  sendDirectMessageInFirestore,
  clearAllLocalSavedChats,
  deleteDirectMessageInFirestore,
  deleteDirectChatRoomInFirestore,
  wipeAllMyDirectChatsInFirestore,
  buildDirectChatId,
  buildWhatsAppChatUrl,
  sanitizeFirestoreIdPart,
  compressChatAttachmentImage,
  checkActionCooldownGuard,
  normalizeFacebookProfileUrl,
  CommunityMessageItem,
  DirectChatRoomItem,
  DirectMessageItem,
  User as FirebaseUser,
} from '../../services/bloodSearchService';
import {
  Send,
  Phone,
  ArrowLeft,
  CheckCheck,
  Search,
  MessageSquare,
  Users,
  Reply,
  X,
  Trash2,
  ExternalLink,
  AlertCircle,
  LogIn,
  UserPlus,
  MapPin,
  ImagePlus,
  Mic,
  MicOff,
  Megaphone,
} from 'lucide-react';

interface DonorChatViewProps {
  lang: Language;
  donors?: Donor[];
  initialDonor?: Donor | null;
  onClearInitialDonor?: () => void;
  onOpenAuthModal?: () => void;
  onOpenRegister?: () => void;
}

interface ActivePeerTarget {
  peerUid: string;
  peerName: string;
  peerGroup: BloodGroup;
  peerAvatar: string;
  peerWhatsapp: string;
  peerFb: string;
  peerSubtitle: string;
  chatId: string;
}

interface ParsedRichMessage {
  cleanBody: string;
  locationPin?: { lat: string; lng: string; label: string; mapsUrl: string };
  sosCard?: { group: string; bags: string; hospital: string };
}

const COMMUNITY_ROOM_ID = '__COMMUNITY_LIVE__';
const QUICK_EMOJIS = ['👍', '❤️', '🙏', '🩸', '🏥', '✅', '🤲', '⚡'];
const BLOOD_GROUPS: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

function parseRichChatText(rawText: string): ParsedRichMessage {
  let body = rawText || '';
  let locationPin: ParsedRichMessage['locationPin'];
  let sosCard: ParsedRichMessage['sosCard'];

  const locMatch = body.match(/\[LOC:([0-9.-]+),([0-9.-]+)\|([^\]]+)\]/);
  if (locMatch) {
    const [, lat, lng, label] = locMatch;
    locationPin = {
      lat,
      lng,
      label: label.trim(),
      mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    };
    body = body.replace(locMatch[0], '').trim();
  }

  const sosMatch = body.match(/\[SOS:([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/);
  if (sosMatch) {
    const [, group, bags, hospital] = sosMatch;
    sosCard = {
      group: group.trim(),
      bags: bags.trim(),
      hospital: hospital.trim(),
    };
    body = body.replace(sosMatch[0], '').trim();
  }

  return { cleanBody: body, locationPin, sosCard };
}

export const DonorChatView: React.FC<DonorChatViewProps> = ({
  lang,
  donors = [],
  initialDonor,
  onClearInitialDonor,
  onOpenAuthModal,
  onOpenRegister,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecRef = useRef<any>(null);

  // Live Auth & Current User Profile
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [devOtpSession, setDevOtpSession] = useState<DevOtpSandboxClientSession | null>(() =>
    getStoredDevOtpSandboxSession()
  );
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_current_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    const syncProfile = () => {
      try {
        const saved = localStorage.getItem('bloodsearch_current_user');
        setCurrentUser(saved ? JSON.parse(saved) : null);
      } catch {}
    };
    const syncDevOtp = () => {
      setDevOtpSession(getStoredDevOtpSandboxSession());
    };
    window.addEventListener('bloodsearch_user_changed', syncProfile);
    window.addEventListener('bloodsearch_dev_otp_changed', syncDevOtp);
    return () => {
      unsubAuth();
      window.removeEventListener('bloodsearch_user_changed', syncProfile);
      window.removeEventListener('bloodsearch_dev_otp_changed', syncDevOtp);
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const cloudAuthUid = firebaseUser?.uid || '';
  const myUid = cloudAuthUid || devOtpSession?.uid || '';
  const isVerifiedSignedIn = Boolean(firebaseUser && isUserVerifiedForWrites(firebaseUser));
  const myName =
    (currentUser?.name && !isFakePersonName(currentUser.name) ? currentUser.name : '') ||
    (firebaseUser?.displayName && !isFakePersonName(firebaseUser.displayName)
      ? firebaseUser.displayName
      : '') ||
    firebaseUser?.email?.split('@')[0] ||
    (devOtpSession ? `Donor (${devOtpSession.phoneLocal})` : '') ||
    (lang === 'bn' ? 'রক্তযোদ্ধা' : 'Blood Donor');
  const myGroup: BloodGroup = currentUser?.bloodGroup || 'B+';
  const myAvatar = currentUser?.photoUrl || firebaseUser?.photoURL || DEFAULT_AVATAR_DATA_URI;
  const myDistrict = currentUser?.district || 'ঢাকা';
  const myWhatsapp =
    currentUser?.whatsappPhone ||
    currentUser?.phone ||
    firebaseUser?.phoneNumber ||
    devOtpSession?.phoneE164 ||
    '';
  const myFb = currentUser?.facebookUrl || '';

  // Sidebar Tabs
  const [sidebarTab, setSidebarTab] = useState<'inbox' | 'directory'>('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Room Selection
  const [selectedRoomId, setSelectedRoomId] = useState<string>(COMMUNITY_ROOM_ID);
  const [activePeer, setActivePeer] = useState<ActivePeerTarget | null>(null);
  const [showMobileRoom, setShowMobileRoom] = useState<boolean>(false);

  // Real-time Firestore Data Streams + Persistent Local/WhatsApp Synced History
  const [communityMessages, setCommunityMessages] = useState<CommunityMessageItem[]>([]);
  const [directRooms, setDirectRooms] = useState<DirectChatRoomItem[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessageItem[]>([]);
  const [localSavedCommunity, setLocalSavedCommunity] = useState<CommunityMessageItem[]>(() => {
    try {
      if (localStorage.getItem('bloodsearch_chat_zero_slate_v7') !== 'done') {
        localStorage.removeItem('bloodsearch_saved_community_chat_v1');
        localStorage.removeItem('bloodsearch_saved_direct_chat_v1');
        localStorage.setItem('bloodsearch_chat_zero_slate_v7', 'done');
        return [];
      }
      const raw = localStorage.getItem('bloodsearch_saved_community_chat_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [localSavedDirectByRoom, setLocalSavedDirectByRoom] = useState<
    Record<string, DirectMessageItem[]>
  >(() => {
    try {
      const raw = localStorage.getItem('bloodsearch_saved_direct_chat_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Composer State + Rich Attachments + Voice Dictation + Lightbox
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<string>('');
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [isSharingGps, setIsSharingGps] = useState(false);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [showVoiceTemplates, setShowVoiceTemplates] = useState(false);
  const [showSosComposer, setShowSosComposer] = useState(false);
  const [sosDraftGroup, setSosDraftGroup] = useState<BloodGroup>('O+');
  const [sosDraftBags, setSosDraftBags] = useState('1');
  const [sosDraftHospital, setSosDraftHospital] = useState('');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<{ name: string; text: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [syncWhatsAppOnSend, setSyncWhatsAppOnSend] = useState(false);
  const [visibleMsgLimit, setVisibleMsgLimit] = useState<number>(50);
  const [visibleDirLimit, setVisibleDirLimit] = useState<number>(40);
  const [confirmClearAllChats, setConfirmClearAllChats] = useState<boolean>(false);
  const [isWipingChats, setIsWipingChats] = useState<boolean>(false);

  // Sync React local chat caches whenever clearAllLocalSavedChats() runs
  useEffect(() => {
    const onLocalCleared = (ev: Event) => {
      const roomId = (ev as CustomEvent<{ roomId?: string }>)?.detail?.roomId || 'ALL';
      if (roomId === 'ALL') {
        setLocalSavedCommunity([]);
        setLocalSavedDirectByRoom({});
      } else {
        setLocalSavedDirectByRoom((prev) => {
          const next = { ...prev };
          delete next[roomId];
          return next;
        });
      }
    };
    window.addEventListener('bloodsearch_local_chats_cleared', onLocalCleared);
    return () => window.removeEventListener('bloodsearch_local_chats_cleared', onLocalCleared);
  }, []);

  // Automatic one-time v7 Cloud Direct Chat purge when signed-in user opens Chat
  useEffect(() => {
    if (!firebaseUser) return;
    const chatZeroKey = `bloodsearch_cloud_chat_zero_v7_${firebaseUser.uid}`;
    if (localStorage.getItem(chatZeroKey) === 'done') return;

    localStorage.setItem(chatZeroKey, 'done');
    clearAllLocalSavedChats();
    setDirectRooms([]);
    setDirectMessages([]);
    setActivePeer(null);
    setSelectedRoomId(COMMUNITY_ROOM_ID);
    wipeAllMyDirectChatsInFirestore(firebaseUser).catch(() => 0);
  }, [firebaseUser]);

  const handleDeleteDirectRoom = async (roomId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDirectRooms((prev) => prev.filter((r) => r.id !== roomId));
    setLocalSavedDirectByRoom((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    if (selectedRoomId === roomId || activePeer?.chatId === roomId) {
      setDirectMessages([]);
      setActivePeer(null);
      setSelectedRoomId(COMMUNITY_ROOM_ID);
      setShowMobileRoom(false);
    }
    await deleteDirectChatRoomInFirestore(roomId, firebaseUser).catch(() => false);
  };

  const handleClearAllChats = async () => {
    if (!confirmClearAllChats) {
      setConfirmClearAllChats(true);
      return;
    }
    setIsWipingChats(true);
    setConfirmClearAllChats(false);
    try {
      clearAllLocalSavedChats();
      setLocalSavedCommunity([]);
      setLocalSavedDirectByRoom({});
      setDirectRooms([]);
      setDirectMessages([]);
      setActivePeer(null);
      setSelectedRoomId(COMMUNITY_ROOM_ID);
      if (firebaseUser) {
        await wipeAllMyDirectChatsInFirestore(firebaseUser).catch(() => 0);
      }
    } finally {
      setIsWipingChats(false);
    }
  };

  const appendLocalCommunityMessage = (msg: CommunityMessageItem) => {
    setLocalSavedCommunity((prev) => {
      const next = [...prev.filter((m) => m.id !== msg.id), msg].slice(-80);
      try {
        localStorage.setItem('bloodsearch_saved_community_chat_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const appendLocalDirectMessage = (roomId: string, msg: DirectMessageItem) => {
    setLocalSavedDirectByRoom((prev) => {
      const roomList = prev[roomId] || [];
      const nextRoomList = [...roomList.filter((m) => m.id !== msg.id), msg].slice(-80);
      const next = { ...prev, [roomId]: nextRoomList };
      try {
        localStorage.setItem('bloodsearch_saved_direct_chat_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // 1. Subscribe to Global Real-Time Community Messages (re-subscribes on Auth hydration)
  useEffect(() => {
    if (!cloudAuthUid) {
      setCommunityMessages([]);
      return;
    }
    const unsub = subscribeCommunityMessages((msgs) => {
      setCommunityMessages(msgs);
    });
    return () => unsub();
  }, [cloudAuthUid]);

  // 2. Subscribe to My Real-Time 1-to-1 Direct Chat Rooms
  useEffect(() => {
    if (!cloudAuthUid) {
      setDirectRooms([]);
      return;
    }
    const unsub = subscribeMyDirectChats(cloudAuthUid, (rooms) => {
      setDirectRooms(rooms);
    });
    return () => unsub();
  }, [cloudAuthUid]);

  // Keep activePeer.chatId synchronized if user signs in while viewing a 1-to-1 room
  useEffect(() => {
    if (!myUid || !activePeer) return;
    const realChatId = buildDirectChatId(myUid, activePeer.peerUid);
    if (activePeer.chatId !== realChatId) {
      setActivePeer((prev) => (prev ? { ...prev, chatId: realChatId } : null));
      setSelectedRoomId((prev) => (prev === COMMUNITY_ROOM_ID ? prev : realChatId));
    }
  }, [myUid, activePeer?.peerUid, activePeer?.chatId]);

  // 3. Subscribe to Active 1-to-1 Direct Room Messages
  useEffect(() => {
    if (selectedRoomId === COMMUNITY_ROOM_ID || !activePeer || !cloudAuthUid) {
      setDirectMessages([]);
      return;
    }
    const realChatId = buildDirectChatId(cloudAuthUid, activePeer.peerUid);
    const matchedRoom = directRooms.find((r) => r.id === realChatId);
    const sorted = [
      sanitizeFirestoreIdPart(cloudAuthUid),
      sanitizeFirestoreIdPart(activePeer.peerUid),
    ].sort();
    const p1Uid = matchedRoom ? matchedRoom.participantOneUid : sorted[0];

    const unsub = subscribeDirectChatMessages(realChatId, cloudAuthUid, p1Uid, (msgs) => {
      setDirectMessages(msgs);
    });
    return () => unsub();
  }, [selectedRoomId, activePeer?.chatId, activePeer?.peerUid, cloudAuthUid, directRooms]);

  const enrichedPeer = useMemo<ActivePeerTarget | null>(() => {
    if (!activePeer) return null;
    const room = directRooms.find((r) => r.id === activePeer.chatId);
    if (!room) return activePeer;
    const peerIsOne = room.participantOneUid !== myUid;
    return {
      ...activePeer,
      peerName: (peerIsOne ? room.participantOneName : room.participantTwoName) || activePeer.peerName,
      peerGroup: (peerIsOne ? room.participantOneGroup : room.participantTwoGroup) || activePeer.peerGroup,
      peerAvatar: (peerIsOne ? room.participantOneAvatar : room.participantTwoAvatar) || activePeer.peerAvatar,
      peerWhatsapp:
        (peerIsOne ? room.participantOneWhatsapp : room.participantTwoWhatsapp) || activePeer.peerWhatsapp,
      peerFb: (peerIsOne ? room.participantOneFb : room.participantTwoFb) || activePeer.peerFb,
    };
  }, [activePeer, directRooms, myUid]);

  const openDirectChatWithUser = (target: {
    uid: string;
    name: string;
    bloodGroup: BloodGroup;
    avatar?: string;
    whatsapp?: string;
    fb?: string;
    subtitle?: string;
  }) => {
    const cleanPeerUid = sanitizeFirestoreIdPart(target.uid);
    if (myUid && cleanPeerUid === myUid) {
      setChatError(
        lang === 'bn'
          ? 'এটি আপনার নিজের প্রোফাইল! অন্য যেকোনো রক্তদাতা বা ইউজারের সাথে ১-টু-১ চ্যাট করুন।'
          : 'This is your own profile! Pick another user or donor to start a 1-to-1 chat.'
      );
      return;
    }
    setChatError(null);
    const effectiveMyUid = myUid || 'guest';
    const chatId = buildDirectChatId(effectiveMyUid, cleanPeerUid);
    setActivePeer({
      peerUid: cleanPeerUid,
      peerName: target.name,
      peerGroup: target.bloodGroup,
      peerAvatar: target.avatar || DEFAULT_AVATAR_DATA_URI,
      peerWhatsapp: target.whatsapp || '',
      peerFb: target.fb || '',
      peerSubtitle: target.subtitle || (lang === 'bn' ? 'স্বেচ্ছাসেবী রক্তদাতা' : 'Voluntary Donor'),
      chatId,
    });
    setSelectedRoomId(chatId);
    setShowMobileRoom(true);
    setReplyingTo(null);
  };

  useEffect(() => {
    if (initialDonor) {
      openDirectChatWithUser({
        uid: initialDonor.id,
        name: initialDonor.name,
        bloodGroup: initialDonor.bloodGroup,
        avatar: initialDonor.avatar,
        whatsapp: initialDonor.whatsappPhone || initialDonor.phone,
        fb: initialDonor.facebookUrl,
        subtitle: initialDonor.hospitalAffiliation || `${initialDonor.upazila}, ${initialDonor.district}`,
      });
      if (onClearInitialDonor) {
        onClearInitialDonor();
      }
    }
  }, [initialDonor]);

  useEffect(() => {
    setVisibleMsgLimit(50);
    const el = messagesContainerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [selectedRoomId, showMobileRoom]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 220) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [communityMessages.length, directMessages.length]);

  const handleInstantGoogleSignIn = () => {
    const p = signInWithGoogleReal();
    setChatError(null);
    p.catch((err) => {
      const parsed = parseFirebaseAuthError(err);
      setChatError(lang === 'bn' ? parsed.messageBn : parsed.messageEn);
    });
  };

  // Rich Feature 1: Prescription / Hospital Requisition Image Picker
  const handleSelectImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setChatError(
        lang === 'bn' ? 'অনুগ্রহ করে শুধুমাত্র ছবি ফাইল নির্বাচন করুন।' : 'Please select a valid image file.'
      );
      return;
    }
    setIsCompressingImage(true);
    setChatError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result || '');
      const compressed = await compressChatAttachmentImage(rawDataUrl);
      setIsCompressingImage(false);
      if (!compressed) {
        setChatError(
          lang === 'bn'
            ? 'ছবিটি প্রসেস করা যায়নি। অনুগ্রহ করে অন্য একটি স্পষ্ট ছবি চেষ্টা করুন।'
            : 'Could not compress image. Please try another photo.'
        );
        return;
      }
      setPendingAttachment(compressed);
    };
    reader.onerror = () => {
      setIsCompressingImage(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Rich Feature 2: 1-Tap Live GPS Location Pin Share (with fast area reverse-geocoding)
  const handleShareLiveGpsPin = async () => {
    if (isSharingGps) return;
    setIsSharingGps(true);
    setChatError(null);
    try {
      const gpsRes = await requestFreshHighAccuracyGPS();
      const coords = gpsRes.coords;
      const rev = await reverseGeocodeBangladeshCoords(coords, lang).catch(() => null);
      const lat = coords.latitude.toFixed(5);
      const lng = coords.longitude.toFixed(5);
      const areaTitle = rev ? `${rev.areaText}, ${rev.districtName}` : myDistrict;
      const locLabel =
        lang === 'bn'
          ? `${areaTitle} · লাইভ লোকেশন পিন`
          : `${areaTitle} · Live Location Pin`;
      const locTag = `[LOC:${lat},${lng}|${locLabel}]`;
      const bodyLine =
        lang === 'bn'
          ? `📍 আমার বর্তমান লোকেশন (${areaTitle}) শেয়ার করলাম।`
          : `📍 Shared my live location (${areaTitle}).`;
      setInputText((prev) =>
        prev.trim() ? `${locTag}\n${prev.trim()}` : `${locTag}\n${bodyLine}`
      );
      inputRef.current?.focus();
    } catch {
      setChatError(
        lang === 'bn'
          ? 'জিপিএস লোকেশন পাওয়া যায়নি। আবার চেষ্টা করুন।'
          : 'Could not read GPS location. Please try again.'
      );
    } finally {
      setIsSharingGps(false);
    }
  };

  // Rich Feature 3: 1-Tap Structured SOS Blood Appeal Card
  const handleInsertSosCard = () => {
    const hosp =
      sosDraftHospital.trim() ||
      (lang === 'bn' ? 'ঢাকা মেডিকেল কলেজ হাসপাতাল' : 'Emergency Hospital');
    const cardTag = `[SOS:${sosDraftGroup}|${sosDraftBags} ব্যাগ|${hosp}]`;
    const note =
      lang === 'bn'
        ? `🆘 জরুরি ${sosDraftGroup} রক্ত প্রয়োজন (${sosDraftBags} ব্যাগ) — হাসপাতাল: ${hosp}। প্রস্তুত রক্তদাতারা অনুগ্রহ করে সাড়া দিন!`
        : `🆘 Urgent ${sosDraftGroup} blood needed (${sosDraftBags} bag) at ${hosp}. Please respond!`;
    setInputText(`${cardTag}\n${note}`);
    setShowSosComposer(false);
    inputRef.current?.focus();
  };

  // Rich Feature 4: Bangla / English Voice-to-Text Dictation + Instant Voice Phrase Tray Fallback
  const handleToggleVoiceDictation = () => {
    setChatError(null);
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setShowVoiceTemplates((prev) => !prev);
      return;
    }

    if (isListeningVoice && speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {}
      setIsListeningVoice(false);
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        setIsListeningVoice(true);
        setShowVoiceTemplates(false);
      };
      rec.onend = () => setIsListeningVoice(false);
      rec.onerror = () => {
        setIsListeningVoice(false);
        setShowVoiceTemplates(true);
      };
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setInputText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
          inputRef.current?.focus();
        }
      };
      speechRecRef.current = rec;
      rec.start();
    } catch {
      setIsListeningVoice(false);
      setShowVoiceTemplates(true);
    }
  };

  const triggerExternalLinkSafely = (href: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Saves any WhatsApp message right inside BloodSearch Chat (Local + Cloud Firestore) before opening WhatsApp!
  const handleSendViaWhatsAppAndSave = async (opts?: {
    peer?: {
      uid: string;
      name: string;
      bloodGroup: BloodGroup;
      avatar?: string;
      whatsapp?: string;
      fb?: string;
      subtitle?: string;
    };
    customText?: string;
  }) => {
    const targetPeer = opts?.peer
      ? {
          peerUid: sanitizeFirestoreIdPart(opts.peer.uid),
          peerName: opts.peer.name,
          peerGroup: opts.peer.bloodGroup,
          peerAvatar: opts.peer.avatar || DEFAULT_AVATAR_DATA_URI,
          peerWhatsapp: opts.peer.whatsapp || '',
          peerFb: opts.peer.fb || '',
          peerSubtitle: opts.peer.subtitle || 'Voluntary Donor',
          chatId: buildDirectChatId(myUid || 'guest', sanitizeFirestoreIdPart(opts.peer.uid)),
        }
      : enrichedPeer;

    const draftText =
      opts?.customText?.trim() ||
      inputText.trim() ||
      (targetPeer
        ? lang === 'bn'
          ? `আসসালামু আলাইকুম ${targetPeer.peerName}, আমি BloodSearch বাংলাদেশ অ্যাপ থেকে জরুরি ${targetPeer.peerGroup} রক্তের বিষয়ে যোগাযোগ করছি।`
          : `Hello ${targetPeer.peerName}, reaching out from BloodSearch regarding an urgent ${targetPeer.peerGroup} blood need.`
        : lang === 'bn'
          ? 'আসসালামু আলাইকুম, আমি BloodSearch বাংলাদেশ অ্যাপ থেকে জরুরি রক্তের বিষয়ে যোগাযোগ করছি।'
          : 'Hello, reaching out via BloodSearch Bangladesh regarding an urgent blood need.');

    const savedTextWithBadge = `📲 [WhatsApp Synced] ${draftText}`;
    const nowTimeLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (opts?.peer && (!myUid || sanitizeFirestoreIdPart(opts.peer.uid) !== myUid)) {
      openDirectChatWithUser(opts.peer);
    }

    const waHref = buildWhatsAppChatUrl(targetPeer?.peerWhatsapp || '', draftText);
    triggerExternalLinkSafely(waHref);

    if (!opts?.customText && inputText.trim()) {
      setInputText('');
    }

    if (targetPeer && (!myUid || targetPeer.peerUid !== myUid)) {
      const localMsg: DirectMessageItem = {
        id: `local_wa_${Date.now()}`,
        chatId: targetPeer.chatId,
        senderUid: myUid || 'guest',
        senderName: myName,
        text: savedTextWithBadge,
        replyToText: '',
        timeLabel: nowTimeLabel,
        createdAtMs: Date.now(),
      };
      appendLocalDirectMessage(targetPeer.chatId, localMsg);

      if (isVerifiedSignedIn && myUid && targetPeer.peerUid !== myUid) {
        sendDirectMessageInFirestore({
          myName,
          myGroup,
          myAvatar,
          myWhatsapp,
          myFb,
          peerUid: targetPeer.peerUid,
          peerName: targetPeer.peerName,
          peerGroup: targetPeer.peerGroup,
          peerAvatar: targetPeer.peerAvatar,
          peerWhatsapp: targetPeer.peerWhatsapp,
          peerFb: targetPeer.peerFb,
          text: savedTextWithBadge,
        }).catch(() => {});
      }
    } else {
      const localComm: CommunityMessageItem = {
        id: `local_comm_wa_${Date.now()}`,
        senderUid: myUid || 'guest',
        senderName: myName,
        senderBloodGroup: myGroup,
        senderAvatar: myAvatar,
        senderDistrict: myDistrict,
        text: savedTextWithBadge,
        replyToName: '',
        replyToText: '',
        timeLabel: nowTimeLabel,
        createdAtMs: Date.now(),
      };
      appendLocalCommunityMessage(localComm);

      if (isVerifiedSignedIn) {
        sendCommunityMessageInFirestore({
          text: savedTextWithBadge,
          senderName: myName,
          senderBloodGroup: myGroup,
          senderAvatar: myAvatar,
          senderDistrict: myDistrict,
        }).catch(() => {});
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if ((!trimmed && !pendingAttachment) || isSending) return;

    const guard = checkActionCooldownGuard('CHAT_SEND', 1500);
    if (!guard.allowed) {
      setChatError(
        lang === 'bn'
          ? `অনুগ্রহ করে স্প্যাম রোধে ${guard.waitSeconds} সেকেন্ড অপেক্ষা করে বার্তা পাঠান।`
          : `Please wait ${guard.waitSeconds}s before sending another message.`
      );
      return;
    }

    setChatError(null);
    setIsSending(true);
    const textToSend =
      trimmed ||
      (lang === 'bn'
        ? '📷 হাসপাতালের রিকুইজিশন স্লিপ / প্রেসক্রিপশন ছবি'
        : '📷 Hospital Requisition Slip / Prescription');
    const attachmentToSend = pendingAttachment;
    const quote = replyingTo;
    const nowTimeLabel = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    setInputText('');
    setPendingAttachment('');
    setReplyingTo(null);

    // Save locally immediately so chat messages NEVER disappear even if offline or guest
    if (selectedRoomId === COMMUNITY_ROOM_ID) {
      appendLocalCommunityMessage({
        id: `local_comm_${Date.now()}`,
        senderUid: myUid || 'guest',
        senderName: myName,
        senderBloodGroup: myGroup,
        senderAvatar: myAvatar,
        senderDistrict: myDistrict,
        text: textToSend,
        replyToName: quote?.name || '',
        replyToText: quote?.text || '',
        attachmentUrl: attachmentToSend || undefined,
        timeLabel: nowTimeLabel,
        createdAtMs: Date.now(),
      });
    } else if (enrichedPeer) {
      appendLocalDirectMessage(enrichedPeer.chatId, {
        id: `local_dm_${Date.now()}`,
        chatId: enrichedPeer.chatId,
        senderUid: myUid || 'guest',
        senderName: myName,
        text: textToSend,
        replyToText: quote ? `${quote.name}: ${quote.text}` : '',
        attachmentUrl: attachmentToSend || undefined,
        timeLabel: nowTimeLabel,
        createdAtMs: Date.now(),
      });
    }

    if (!isVerifiedSignedIn) {
      if (syncWhatsAppOnSend && enrichedPeer) {
        const waHref = buildWhatsAppChatUrl(enrichedPeer.peerWhatsapp, textToSend);
        triggerExternalLinkSafely(waHref);
      }
      setIsSending(false);
      inputRef.current?.focus();
      return;
    }

    try {
      if (selectedRoomId === COMMUNITY_ROOM_ID) {
        await sendCommunityMessageInFirestore({
          text: textToSend,
          senderName: myName,
          senderBloodGroup: myGroup,
          senderAvatar: myAvatar,
          senderDistrict: myDistrict,
          replyToName: quote?.name || '',
          replyToText: quote?.text || '',
          attachmentUrl: attachmentToSend || undefined,
        });
      } else if (enrichedPeer) {
        const realChatId = await sendDirectMessageInFirestore({
          myName,
          myGroup,
          myAvatar,
          myWhatsapp,
          myFb,
          peerUid: enrichedPeer.peerUid,
          peerName: enrichedPeer.peerName,
          peerGroup: enrichedPeer.peerGroup,
          peerAvatar: enrichedPeer.peerAvatar,
          peerWhatsapp: enrichedPeer.peerWhatsapp,
          peerFb: enrichedPeer.peerFb,
          text: textToSend,
          replyToText: quote ? `${quote.name}: ${quote.text}` : '',
          attachmentUrl: attachmentToSend || undefined,
        });
        if (realChatId && realChatId !== selectedRoomId) {
          setSelectedRoomId(realChatId);
        }

        if (syncWhatsAppOnSend) {
          const waHref = buildWhatsAppChatUrl(enrichedPeer.peerWhatsapp, textToSend);
          triggerExternalLinkSafely(waHref);
        }
      }
    } catch (err: any) {
      if (String(err?.message).includes('SELF_CHAT_NOT_ALLOWED')) {
        setChatError(
          lang === 'bn'
            ? 'নিজের আইডিতে মেসেজ পাঠানো যাবে না। অন্য রক্তদাতা নির্বাচন করুন।'
            : 'Cannot send direct message to yourself.'
        );
      }
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const filteredDirectRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanRooms = directRooms.filter((r) => {
      const peerIsOne = r.participantOneUid !== myUid;
      const pUid = peerIsOne ? r.participantOneUid : r.participantTwoUid;
      const pName = peerIsOne ? r.participantOneName : r.participantTwoName;
      return !isFakeIdentifier(pUid) && !isFakePersonName(pName);
    });
    if (!q) return cleanRooms;
    return cleanRooms.filter((r) => {
      const peerIsOne = r.participantOneUid !== myUid;
      const pName = (peerIsOne ? r.participantOneName : r.participantTwoName).toLowerCase();
      const pGrp = (peerIsOne ? r.participantOneGroup : r.participantTwoGroup).toLowerCase();
      return pName.includes(q) || pGrp.includes(q) || r.lastMessage.toLowerCase().includes(q);
    });
  }, [directRooms, searchQuery, myUid]);

  const peerDonorsCount = useMemo(
    () => donors.filter((d) => sanitizeFirestoreIdPart(d.id) !== myUid).length,
    [donors, myUid]
  );

  const filteredDirectoryDonors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = donors.filter((d) => sanitizeFirestoreIdPart(d.id) !== myUid);
    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.bloodGroup.toLowerCase().includes(q) ||
        d.district.toLowerCase().includes(q) ||
        d.upazila.toLowerCase().includes(q)
    );
  }, [donors, searchQuery, myUid]);

  const mergedCommunityMessages = useMemo(() => {
    const cloudTexts = new Set(
      communityMessages.map((m) => `${m.senderName}:${m.text.trim()}`)
    );
    const unsyncedLocal = localSavedCommunity.filter(
      (lm) => !cloudTexts.has(`${lm.senderName}:${lm.text.trim()}`)
    );
    return [...communityMessages, ...unsyncedLocal].sort(
      (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)
    );
  }, [communityMessages, localSavedCommunity]);

  const mergedDirectMessages = useMemo(() => {
    const roomKey = activePeer?.chatId || selectedRoomId;
    const localList = localSavedDirectByRoom[roomKey] || [];
    const cloudTexts = new Set(directMessages.map((m) => m.text.trim()));
    const unsyncedLocal = localList.filter((lm) => !cloudTexts.has(lm.text.trim()));
    return [...directMessages, ...unsyncedLocal].sort(
      (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)
    );
  }, [directMessages, localSavedDirectByRoom, activePeer?.chatId, selectedRoomId]);

  const windowedCommunityMessages = useMemo(() => {
    if (mergedCommunityMessages.length <= visibleMsgLimit) return mergedCommunityMessages;
    return mergedCommunityMessages.slice(mergedCommunityMessages.length - visibleMsgLimit);
  }, [mergedCommunityMessages, visibleMsgLimit]);

  const windowedDirectMessages = useMemo(() => {
    if (mergedDirectMessages.length <= visibleMsgLimit) return mergedDirectMessages;
    return mergedDirectMessages.slice(mergedDirectMessages.length - visibleMsgLimit);
  }, [mergedDirectMessages, visibleMsgLimit]);

  const isCommunityActive = selectedRoomId === COMMUNITY_ROOM_ID;
  const activeWaHref = useMemo(() => {
    const draft =
      inputText.trim() ||
      (isCommunityActive
        ? `আসসালামু আলাইকুম, আমি BloodSearch বাংলাদেশ অ্যাপ থেকে জরুরি রক্তের বিষয়ে যোগাযোগ করছি।`
        : `আসসালামু আলাইকুম ${enrichedPeer?.peerName || ''}, আমি BloodSearch বাংলাদেশ অ্যাপ থেকে ${enrichedPeer?.peerGroup || ''} রক্তের বিষয়ে আপনার সাথে যোগাযোগ করছি।`);
    return buildWhatsAppChatUrl(isCommunityActive ? '' : enrichedPeer?.peerWhatsapp, draft);
  }, [isCommunityActive, enrichedPeer, inputText]);

  const renderRichBubbleContent = (rawText: string, attachmentUrl?: string) => {
    const parsed = parseRichChatText(rawText);
    return (
      <div className="space-y-2">
        {/* Structured SOS Appeal Card */}
        {parsed.sosCard && (
          <div className="p-2.5 rounded-xl bg-rose-600 text-white space-y-1 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-100">
                জরুরি রক্তের SOS কার্ড
              </span>
              <span className="px-2 py-0.5 rounded bg-white text-rose-700 font-black text-xs">
                {parsed.sosCard.group} · {parsed.sosCard.bags}
              </span>
            </div>
            <div className="font-bold text-xs leading-snug">🏥 {parsed.sosCard.hospital}</div>
          </div>
        )}

        {/* Interactive Live GPS Location Pin Card */}
        {parsed.locationPin && (
          <div className="p-2.5 rounded-xl bg-slate-900 text-white space-y-1.5 border border-slate-700">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">{parsed.locationPin.label}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-300">
              GPS: {parsed.locationPin.lat}, {parsed.locationPin.lng}
            </div>
            {/^https:\/\/(www\.)?google\.com\/maps\b|^https:\/\/maps\.google\.com\b/i.test(
              parsed.locationPin.mapsUrl
            ) && (
              <a
                href={parsed.locationPin.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center justify-center gap-1 transition-colors"
              >
                <span>Google Maps-এ ডিরেকশন দেখুন</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Compressed Requisition Slip / Prescription Image */}
        {attachmentUrl && (
          <div className="rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/5">
            <img
              src={attachmentUrl}
              alt="Medical Requisition Slip"
              loading="lazy"
              decoding="async"
              onClick={() => setLightboxImage(attachmentUrl)}
              className="w-full max-h-56 object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
            />
            <button
              type="button"
              onClick={() => setLightboxImage(attachmentUrl)}
              className="w-full py-1 px-2 text-[10px] font-bold text-center bg-black/5 dark:bg-white/5 hover:underline cursor-pointer"
            >
              {lang === 'bn' ? '🔍 বড় করে প্রেসক্রিপশন / স্লিপ দেখুন' : '🔍 Tap to enlarge slip'}
            </button>
          </div>
        )}

        {parsed.cleanBody && (
          <p className="whitespace-pre-wrap select-text">{parsed.cleanBody}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-[#111b21] rounded-2xl sm:rounded-3xl overflow-hidden shadow-md border border-slate-300 dark:border-slate-700 h-[calc(100dvh-146px)] min-h-[430px] max-h-[740px] flex flex-col @2xl:flex-row text-left">
      {/* ===================================================================== */}
      {/* LEFT PANE: WHATSAPP-STYLE INBOX & USER DIRECTORY                      */}
      {/* ===================================================================== */}
      <div
        className={`w-full @2xl:w-80 border-b @2xl:border-b-0 @2xl:border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 bg-white dark:bg-[#111b21] ${
          showMobileRoom ? 'hidden @2xl:flex' : 'flex h-full'
        }`}
      >
        <div className="p-3.5 bg-[#075e54] dark:bg-[#1f2c34] text-white space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#25D366] text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
                <MessageSquare className="w-5 h-5 fill-slate-950" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black leading-tight truncate">
                  {lang === 'bn' ? 'BloodSearch মেসেঞ্জার' : 'BloodSearch Messenger'}
                </h2>
                <span className="text-[10px] text-emerald-200 font-semibold block truncate">
                  {lang === 'bn'
                    ? 'লাইভ চ্যাট · GPS পিন · প্রেসক্রিপশন ছবি · ভয়েস'
                    : 'Live Chat · GPS Pin · Slip Photo · Voice'}
                </span>
              </div>
            </div>

            {!isVerifiedSignedIn && (
              <button
                type="button"
                onClick={onOpenAuthModal || handleInstantGoogleSignIn}
                className="px-2.5 py-1 rounded-lg bg-[#25D366] hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer shrink-0 shadow-xs"
              >
                {lang === 'bn' ? 'লগইন' : 'Login'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/25 text-xs font-bold">
            <button
              type="button"
              onClick={() => setSidebarTab('inbox')}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                sidebarTab === 'inbox'
                  ? 'bg-white text-[#075e54] shadow-xs font-black'
                  : 'text-emerald-100 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'চ্যাট ইনবক্স' : 'Chats'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarTab('directory')}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                sidebarTab === 'directory'
                  ? 'bg-white text-[#075e54] shadow-xs font-black'
                  : 'text-emerald-100 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {lang === 'bn'
                  ? `সকল ইউজার (${peerDonorsCount})`
                  : `Users (${peerDonorsCount})`}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="chat-peer-search"
              name="chatSearchQuery"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'নাম, ব্লাড গ্রুপ বা জেলা দিয়ে খুঁজুন...'
                  : 'Search name, blood group, district...'
              }
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-xl bg-white dark:bg-[#2a3942] text-slate-900 dark:text-white border-0 focus:outline-none focus:ring-2 focus:ring-[#25D366] placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto modal-scroll-contain divide-y divide-slate-100 dark:divide-slate-800/70">
          {sidebarTab === 'inbox' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedRoomId(COMMUNITY_ROOM_ID);
                  setActivePeer(null);
                  setShowMobileRoom(true);
                  setReplyingTo(null);
                }}
                className={`w-full p-3 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                  isCommunityActive
                    ? 'bg-emerald-50/90 dark:bg-[#202c33]'
                    : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/60'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#075e54] to-[#25D366] text-white flex items-center justify-center font-black text-base shadow-xs">
                    🇧🇩
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-xs text-slate-900 dark:text-white truncate">
                      {lang === 'bn'
                        ? 'সবার উন্মুক্ত লাইভ চ্যাট (BD Live)'
                        : 'Bangladesh Live Community Chat'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-[#25D366] shrink-0">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                    {communityMessages.length > 0
                      ? `${communityMessages[communityMessages.length - 1].senderName}: ${
                          parseRichChatText(communityMessages[communityMessages.length - 1].text)
                            .cleanBody || '📍 লোকেশন / 📷 স্লিপ'
                        }`
                      : lang === 'bn'
                      ? 'সকল রক্তদাতা ও রোগীর সাথে সরাসরি কথা বলুন...'
                      : 'Chat live with all donors & recipients...'}
                  </p>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {lang === 'bn'
                      ? `${communityMessages.length}টি বার্তা · GPS পিন ও প্রেসক্রিপশন স্লিপ শেয়ারযোগ্য`
                      : `${communityMessages.length} live messages · GPS & slip share enabled`}
                  </div>
                </div>
              </button>

              {(filteredDirectRooms.length > 0 || mergedCommunityMessages.length > 0) && (
                <div className="px-3 py-2 bg-slate-50 dark:bg-[#182229] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {lang === 'bn' ? 'চ্যাট তালিকা' : 'Conversations'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {confirmClearAllChats && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearAllChats(false)}
                        className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold cursor-pointer"
                      >
                        {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isWipingChats}
                      onClick={handleClearAllChats}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        confirmClearAllChats
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>
                        {isWipingChats
                          ? lang === 'bn'
                            ? 'মুছে ফেলা হচ্ছে...'
                            : 'Deleting...'
                          : confirmClearAllChats
                            ? lang === 'bn'
                              ? 'নিশ্চিত সব মুছুন'
                              : 'Confirm Delete All'
                            : lang === 'bn'
                              ? 'সব চ্যাট মুছুন'
                              : 'Clear All Chats'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {filteredDirectRooms.map((room) => {
                const peerIsOne = room.participantOneUid !== myUid;
                const pUid = peerIsOne ? room.participantOneUid : room.participantTwoUid;
                const pName = peerIsOne ? room.participantOneName : room.participantTwoName;
                const pGrp = peerIsOne ? room.participantOneGroup : room.participantTwoGroup;
                const pAvatar = peerIsOne ? room.participantOneAvatar : room.participantTwoAvatar;
                const pWa = peerIsOne ? room.participantOneWhatsapp : room.participantTwoWhatsapp;
                const pFb = peerIsOne ? room.participantOneFb : room.participantTwoFb;
                const isSelected = selectedRoomId === room.id;

                return (
                  <div
                    key={room.id}
                    className={`w-full p-3 text-left flex items-center gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/90 dark:bg-[#202c33]'
                        : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        openDirectChatWithUser({
                          uid: pUid,
                          name: pName,
                          bloodGroup: pGrp,
                          avatar: pAvatar,
                          whatsapp: pWa,
                          fb: pFb,
                          subtitle: lang === 'bn' ? 'ব্যক্তিগত ১-টু-১ চ্যাট' : 'Direct 1-to-1 Chat',
                        })
                      }
                      className="flex-1 min-w-0 text-left flex items-start gap-3 cursor-pointer"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={pAvatar || DEFAULT_AVATAR_DATA_URI}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_DATA_URI;
                          }}
                          alt={pName}
                          className="w-11 h-11 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded bg-rose-600 text-white text-[9px] font-black">
                          {pGrp}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {pName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {room.timeLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {room.lastSenderUid === myUid ? '✓✓ আপনি: ' : ''}
                          {parseRichChatText(room.lastMessage).cleanBody || '📍 লোকেশন / 📷 স্লিপ'}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteDirectRoom(room.id, e)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                      title={lang === 'bn' ? 'এই চ্যাট ডিলিট করুন' : 'Delete conversation'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {filteredDirectRooms.length === 0 && (
                <div className="p-4 text-center space-y-2.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'bn'
                      ? 'যেকোনো রক্তদাতা বা ইউজারের সাথে ব্যক্তিগত (User-to-User) চ্যাট বা WhatsApp শুরু করতে নিচের বাটনে চাপুন:'
                      : 'Start a private User-to-User or WhatsApp chat with any registered donor:'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('directory')}
                    className="px-3.5 py-2 rounded-xl bg-[#075e54] hover:bg-[#128c7e] text-white font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'bn' ? 'সকল ইউজার ও রক্তদাতা দেখুন →' : 'Browse Users & Donors →'}
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {filteredDirectoryDonors.slice(0, visibleDirLimit).map((d) => {
                const waUrl = buildWhatsAppChatUrl(
                  d.whatsappPhone || d.phone,
                  `আসসালামু আলাইকুম ${d.name}, আমি BloodSearch বাংলাদেশ অ্যাপ থেকে জরুরি ${d.bloodGroup} রক্তের বিষয়ে যোগাযোগ করছি।`
                );
                return (
                  <div
                    key={d.id}
                    className="p-3 flex items-center justify-between gap-2.5 hover:bg-slate-50 dark:hover:bg-[#202c33]/60 transition-colors"
                  >
                    <div
                      onClick={() =>
                        openDirectChatWithUser({
                          uid: d.id,
                          name: d.name,
                          bloodGroup: d.bloodGroup,
                          avatar: d.avatar,
                          whatsapp: d.whatsappPhone || d.phone,
                          fb: d.facebookUrl,
                          subtitle: `${d.upazila}, ${d.district}`,
                        })
                      }
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="relative shrink-0">
                        <img
                          src={d.avatar || DEFAULT_AVATAR_DATA_URI}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_DATA_URI;
                          }}
                          alt={d.name}
                          className="w-10 h-10 rounded-2xl object-cover"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded bg-rose-600 text-white text-[9px] font-black">
                          {d.bloodGroup}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {d.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {d.upazila}, {d.district}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          openDirectChatWithUser({
                            uid: d.id,
                            name: d.name,
                            bloodGroup: d.bloodGroup,
                            avatar: d.avatar,
                            whatsapp: d.whatsappPhone || d.phone,
                            fb: d.facebookUrl,
                            subtitle: `${d.upazila}, ${d.district}`,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-black text-white font-bold text-[11px] cursor-pointer"
                      >
                        {lang === 'bn' ? 'চ্যাট' : 'Chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendViaWhatsAppAndSave({
                            peer: {
                              uid: d.id,
                              name: d.name,
                              bloodGroup: d.bloodGroup,
                              avatar: d.avatar,
                              whatsapp: d.whatsappPhone || d.phone,
                              fb: d.facebookUrl,
                              subtitle: `${d.upazila}, ${d.district}`,
                            },
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-emerald-500 text-slate-950 font-black text-[11px] cursor-pointer"
                        title="WhatsApp-এ পাঠান ও চ্যাটে সেভ রাখুন"
                      >
                        WA
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredDirectoryDonors.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'কোনো ম্যাচিং ইউজার পাওয়া যায়নি।'
                    : 'No matching users found.'}
                </div>
              )}
              {filteredDirectoryDonors.length > visibleDirLimit && (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleDirLimit((prev) => prev + 40)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#202c33] text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                  >
                    {lang === 'bn'
                      ? `আরও ইউজার দেখুন (${filteredDirectoryDonors.length - visibleDirLimit})`
                      : `Load more users (${filteredDirectoryDonors.length - visibleDirLimit})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* RIGHT PANE: WHATSAPP-STYLE ACTIVE LIVE CHAT STREAM                    */}
      {/* ===================================================================== */}
      <div
        className={`flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-[#0b141a] min-w-0 ${
          !showMobileRoom ? 'hidden @2xl:flex' : 'flex'
        }`}
      >
        {/* Active Room Header */}
        <div className="px-3 py-2.5 bg-[#075e54] dark:bg-[#202c33] text-white flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowMobileRoom(false)}
              className="@2xl:hidden p-1.5 -ml-1 rounded-lg text-white hover:bg-white/10 cursor-pointer shrink-0"
              title="Back to chats"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {isCommunityActive ? (
              <div className="w-9 h-9 rounded-2xl bg-[#25D366] text-slate-950 flex items-center justify-center font-black text-sm shrink-0">
                🇧🇩
              </div>
            ) : (
              <img
                src={enrichedPeer?.peerAvatar || DEFAULT_AVATAR_DATA_URI}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_DATA_URI;
                }}
                alt={enrichedPeer?.peerName || 'User'}
                className="w-9 h-9 rounded-2xl object-cover ring-2 ring-white/25 shrink-0"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-xs @md:text-sm text-white truncate">
                  {isCommunityActive
                    ? lang === 'bn'
                      ? 'সবার উন্মুক্ত লাইভ চ্যাট (BD)'
                      : 'BD Live Community Chat'
                    : enrichedPeer?.peerName}
                </h3>
                {!isCommunityActive && enrichedPeer && (
                  <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-black text-[10px] shrink-0">
                    {enrichedPeer.peerGroup}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-100 truncate">
                {isCommunityActive
                  ? lang === 'bn'
                    ? 'আনলিমিটেড লাইভ চ্যাট · GPS লোকেশন ও প্রেসক্রিপশন ছবি পাঠান'
                    : 'Unlimited live chat · Share GPS pins & prescription photos'
                  : enrichedPeer?.peerSubtitle ||
                    (lang === 'bn' ? 'রিয়েল-টাইম ক্লাউড চ্যাট' : 'Live Cloud Chat')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSendViaWhatsAppAndSave()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-emerald-400 text-slate-950 font-black text-xs transition-colors cursor-pointer shadow-xs whitespace-nowrap"
              title="Send via WhatsApp & Auto-Save in Chat"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
              </svg>
              <span>WhatsApp</span>
            </button>

            {!isCommunityActive && normalizeFacebookProfileUrl(enrichedPeer?.peerFb) && (
              <a
                href={normalizeFacebookProfileUrl(enrichedPeer?.peerFb)!}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                title="Facebook প্রোফাইল"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {!isCommunityActive &&
              enrichedPeer?.peerWhatsapp &&
              !enrichedPeer.peerWhatsapp.includes('*') &&
              !enrichedPeer.peerWhatsapp.includes('X') &&
              /^\+?\d{8,16}$/.test(enrichedPeer.peerWhatsapp.replace(/[^\d+]/g, '')) && (
                <a
                  href={`tel:${enrichedPeer.peerWhatsapp.replace(/[^\d+]/g, '')}`}
                  className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                  title="সরাসরি কল করুন"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>
              )}

            {!isCommunityActive && enrichedPeer && (
              <button
                type="button"
                onClick={() => handleDeleteDirectRoom(enrichedPeer.chatId)}
                className="p-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white transition-colors cursor-pointer"
                title={lang === 'bn' ? 'এই সম্পূর্ণ চ্যাট ডিলিট করুন' : 'Delete entire conversation'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Message Canvas */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto modal-scroll-contain p-3 @md:p-4 space-y-2.5"
        >
          <div className="text-center my-1">
            <span className="inline-block text-[11px] font-semibold text-slate-700 dark:text-amber-200/90 bg-[#fff5c4] dark:bg-[#182229] px-3 py-1 rounded-xl shadow-2xs max-w-[94%]">
              {isCommunityActive
                ? lang === 'bn'
                  ? '🔓 লাইভ কমিউনিটি রুম — নিচে 📍 GPS লোকেশন পিন, 📷 প্রেসক্রিপশন স্লিপ বা 🆘 জরুরি রক্তের কার্ড পাঠাতে পারবেন!'
                  : '🔓 Live Community Room — Share GPS pins, requisition photos, or SOS cards!'
                : lang === 'bn'
                ? '🔒 ব্যক্তিগত ইউজার-টু-ইউজার চ্যাট — শুধুমাত্র আপনি ও অপর পক্ষ এই মেসেজ ও প্রেসক্রিপশন ছবি দেখতে পাবেন।'
                : '🔒 Private 1-to-1 User-to-User Chat — Isolated strictly to both participants.'}
            </span>
          </div>

          {((isCommunityActive && communityMessages.length > visibleMsgLimit) ||
            (!isCommunityActive && directMessages.length > visibleMsgLimit)) && (
            <div className="text-center py-1">
              <button
                type="button"
                onClick={() => setVisibleMsgLimit((prev) => prev + 50)}
                className="px-3 py-1 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {lang === 'bn' ? '↑ পূর্ববর্তী মেসেজ দেখুন' : '↑ Load older messages'}
              </button>
            </div>
          )}

          {isCommunityActive &&
            (windowedCommunityMessages.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'প্রথম লাইভ বার্তাটি আপনিই পাঠান! (যেমন: সালাম বা রক্তের গ্রুপ জানান)'
                    : 'Send the first live message to the community!'}
                </p>
              </div>
            ) : (
              windowedCommunityMessages.map((msg) => {
                const isMe = Boolean(myUid && msg.senderUid === myUid);
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[86%] @md:max-w-md rounded-2xl px-3 py-2 shadow-xs text-xs @md:text-sm leading-relaxed break-words ${
                        isMe
                          ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white rounded-tr-none'
                          : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 rounded-tl-none'
                      }`}
                    >
                      {!isMe && (
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <button
                            type="button"
                            onClick={() =>
                              openDirectChatWithUser({
                                uid: msg.senderUid,
                                name: msg.senderName,
                                bloodGroup: msg.senderBloodGroup,
                                avatar: msg.senderAvatar,
                                subtitle: msg.senderDistrict || 'BloodSearch User',
                              })
                            }
                            className="font-black text-[11px] text-emerald-700 dark:text-[#25D366] hover:underline cursor-pointer flex items-center gap-1"
                            title="এই ইউজারের সাথে ১-টু-১ ব্যক্তিগত চ্যাট শুরু করুন"
                          >
                            <span>{msg.senderName}</span>
                            <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[9px]">
                              {msg.senderBloodGroup}
                            </span>
                          </button>
                          {msg.senderDistrict && (
                            <span className="text-[10px] text-slate-400">{msg.senderDistrict}</span>
                          )}
                        </div>
                      )}

                      {msg.replyToText && (
                        <div className="mb-1.5 p-1.5 rounded-lg bg-black/5 dark:bg-black/25 border border-emerald-500/30 text-[11px] opacity-90">
                          {msg.replyToName && (
                            <span className="font-bold block text-emerald-700 dark:text-emerald-400">
                              {msg.replyToName}
                            </span>
                          )}
                          <span className="line-clamp-2">{msg.replyToText}</span>
                        </div>
                      )}

                      {renderRichBubbleContent(msg.text, msg.attachmentUrl)}

                      <div className="flex items-center justify-end gap-2 mt-1 text-[10px] text-slate-500 dark:text-emerald-100/70">
                        <button
                          type="button"
                          onClick={() => setReplyingTo({ name: msg.senderName, text: msg.text })}
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          title="উত্তর দিন (Reply)"
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                        <a
                          href={buildWhatsAppChatUrl('', msg.text)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-emerald-700 dark:text-[#25D366] hover:underline"
                          title="WhatsApp-এ ফরোয়ার্ড করুন"
                        >
                          WA
                        </a>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteCommunityMessageInFirestore(msg.id).catch(() => {})
                            }
                            className="text-red-500 hover:text-red-700 cursor-pointer"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <span className="font-mono">{msg.timeLabel}</span>
                        {isMe && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                      </div>
                    </div>
                  </div>
                );
              })
            ))}

          {!isCommunityActive &&
            (windowedDirectMessages.length === 0 ? (
              <div className="py-10 text-center space-y-2.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {lang === 'bn'
                    ? `${enrichedPeer?.peerName || 'রক্তদাতা'}-কে আপনার বার্তা, 📍 লোকেশন বা 📷 রিকুইজিশন স্লিপ পাঠান!`
                    : `Send a live message, GPS location, or requisition slip to ${enrichedPeer?.peerName || 'this donor'}!`}
                </p>
                <button
                  type="button"
                  onClick={() => handleSendViaWhatsAppAndSave()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-emerald-500 text-slate-950 font-black text-xs shadow-xs cursor-pointer"
                >
                  <span>
                    {lang === 'bn'
                      ? '📲 WhatsApp-এ পাঠান (চ্যাটেও সেভ থাকবে)'
                      : '📲 Send on WhatsApp & Save in Chat'}
                  </span>
                </button>
              </div>
            ) : (
              windowedDirectMessages.map((msg) => {
                const isMe = Boolean(myUid && msg.senderUid === myUid);
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[86%] @md:max-w-md rounded-2xl px-3 py-2 shadow-xs text-xs @md:text-sm leading-relaxed break-words ${
                        isMe
                          ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white rounded-tr-none'
                          : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 rounded-tl-none'
                      }`}
                    >
                      {msg.replyToText && (
                        <div className="mb-1.5 p-1.5 rounded-lg bg-black/5 dark:bg-black/25 border border-emerald-500/30 text-[11px] opacity-90">
                          <span className="line-clamp-2">{msg.replyToText}</span>
                        </div>
                      )}

                      {renderRichBubbleContent(msg.text, msg.attachmentUrl)}

                      <div className="flex items-center justify-end gap-2 mt-1 text-[10px] text-slate-500 dark:text-emerald-100/70">
                        <button
                          type="button"
                          onClick={() =>
                            setReplyingTo({
                              name: isMe ? myName : enrichedPeer?.peerName || 'User',
                              text: msg.text,
                            })
                          }
                          className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          title="Reply"
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                        <a
                          href={buildWhatsAppChatUrl(enrichedPeer?.peerWhatsapp, msg.text)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-emerald-700 dark:text-[#25D366] hover:underline"
                          title="এই মেসেজটি সরাসরি WhatsApp-এও পাঠান"
                        >
                          WA
                        </a>
                        {isMe && (
                          <button
                            type="button"
                            onClick={() => {
                              const roomKey = msg.chatId || activePeer?.chatId || selectedRoomId;
                              setLocalSavedDirectByRoom((prev) => ({
                                ...prev,
                                [roomKey]: (prev[roomKey] || []).filter((m) => m.id !== msg.id),
                              }));
                              setDirectMessages((prev) => prev.filter((m) => m.id !== msg.id));
                              deleteDirectMessageInFirestore(roomKey, msg.id).catch(() => false);
                            }}
                            className="text-red-500 hover:text-red-700 cursor-pointer"
                            title={lang === 'bn' ? 'মেসেজ মুছুন' : 'Delete message'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <span className="font-mono">{msg.timeLabel}</span>
                        {isMe && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                      </div>
                    </div>
                  </div>
                );
              })
            ))}
        </div>

        {/* Error / Auth Prompt Banner */}
        {/* Anti-bKash Advance Scam Safety Line */}
        <div className="px-3 py-1.5 bg-amber-50/90 dark:bg-amber-950/30 border-t border-amber-200/80 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200/90 flex items-center justify-between gap-2">
          <span className="truncate">
            {lang === 'bn'
              ? 'সতর্কতা: রক্তদানের আগে বিকাশ/নগদে অগ্রিম ভাড়া পাঠাবেন না · সেবা ১০০% বিনামূল্যে'
              : 'Safety: Never send advance bKash/Nagad fare before meeting at hospital'}
          </span>
        </div>

        {chatError && (
          <div className="px-3 py-2 bg-red-50 dark:bg-red-950/60 border-t border-red-200 dark:border-red-900 flex items-center justify-between gap-2 text-xs text-red-700 dark:text-red-300 font-bold">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{chatError}</span>
            </div>
            <button
              type="button"
              onClick={() => setChatError(null)}
              className="p-1 text-red-500 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Guest Fast Sign-In Strip */}
        {!isVerifiedSignedIn && (
          <div className="px-3 py-2 bg-emerald-50 dark:bg-[#182229] border-t border-emerald-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
              {lang === 'bn'
                ? 'লাইভ চ্যাট ও ছবি পাঠাতে ১-ক্লিকে আসল Gmail দিয়ে যুক্ত হোন:'
                : 'Sign in with Gmail in 1 tap to send live messages & photos:'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleInstantGoogleSignIn}
                className="px-3 py-1.5 rounded-lg bg-[#075e54] hover:bg-[#128c7e] text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'Google লগইন' : 'Google Login'}</span>
              </button>
              {onOpenRegister && (
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'আইডি খুলুন' : 'Create ID'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick SOS Card Builder Drawer */}
        {showSosComposer && (
          <div className="px-3 py-2.5 bg-rose-50 dark:bg-rose-950/60 border-t border-rose-200 dark:border-rose-900 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-black text-rose-700 dark:text-rose-300">
                {lang === 'bn' ? '🆘 চ্যাটে জরুরি রক্তের কার্ড তৈরি করুন' : '🆘 Build Urgent Blood Card'}
              </span>
              <button
                type="button"
                onClick={() => setShowSosComposer(false)}
                className="p-0.5 text-rose-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <select
                id="chat-sos-draft-group"
                name="sosDraftGroup"
                value={sosDraftGroup}
                onChange={(e) => setSosDraftGroup(e.target.value as BloodGroup)}
                className="h-8 px-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 font-black text-rose-600 text-xs"
              >
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                id="chat-sos-draft-bags"
                name="sosDraftBags"
                value={sosDraftBags}
                onChange={(e) => setSosDraftBags(e.target.value)}
                className="h-8 px-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 font-bold text-xs text-slate-800 dark:text-white"
              >
                {['1', '2', '3', '4', '5'].map((n) => (
                  <option key={n} value={n}>
                    {n} {lang === 'bn' ? 'ব্যাগ' : 'Bag'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleInsertSosCard}
                className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer"
              >
                {lang === 'bn' ? 'যুক্ত করুন' : 'Insert'}
              </button>
            </div>
            <input
              id="chat-sos-draft-hospital"
              name="sosDraftHospital"
              type="text"
              value={sosDraftHospital}
              onChange={(e) => setSosDraftHospital(e.target.value)}
              placeholder={
                lang === 'bn'
                  ? 'হাসপাতালের নাম (যেমন: ঢাকা মেডিকেল ওয়ার্ড ২০৪)...'
                  : 'Hospital & ward name...'
              }
              className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-xs text-slate-900 dark:text-white"
            />
          </div>
        )}

        {/* Pending Prescription Image Preview Strip */}
        {(pendingAttachment || isCompressingImage) && (
          <div className="px-3 py-2 bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              {pendingAttachment && (
                <img
                  src={pendingAttachment}
                  alt="Attachment preview"
                  className="w-11 h-11 rounded-xl object-cover border border-emerald-500/40 shrink-0"
                />
              )}
              <div className="min-w-0">
                <span className="font-bold text-emerald-700 dark:text-[#25D366] block">
                  {isCompressingImage
                    ? lang === 'bn'
                      ? 'ছবিটি অপ্টিমাইজ হচ্ছে...'
                      : 'Optimizing photo...'
                    : lang === 'bn'
                    ? '📷 রিকুইজিশন স্লিপ / প্রেসক্রিপশন ছবি যুক্ত হয়েছে'
                    : '📷 Prescription / Requisition Slip Ready'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn' ? 'সেন্ড বাটনে চাপলেই চ্যাটে চলে যাবে' : 'Press Send to share in chat'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPendingAttachment('')}
              className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Reply Preview Strip */}
        {replyingTo && (
          <div className="px-3 py-1.5 bg-white dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1 pl-2 border border-emerald-500/30 rounded-lg py-1">
              <span className="font-bold text-emerald-700 dark:text-[#25D366] block text-[11px]">
                {replyingTo.name}
              </span>
              <span className="text-slate-600 dark:text-slate-300 truncate block text-[11px]">
                {replyingTo.text}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Rich Medical Action Bar + Quick Emojis */}
        <div className="px-2.5 py-1.5 bg-white/95 dark:bg-[#1f2c34] border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
          {/* Hidden Image File Input */}
          <input
            id="chat-slip-file"
            name="chatSlipAttachment"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleSelectImageFile}
            className="hidden"
          />

          {/* 1. Share Live GPS Pin */}
          <button
            type="button"
            onClick={handleShareLiveGpsPin}
            disabled={isSharingGps}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            title="লাইভ জিপিএস লোকেশন পিন পাঠান"
          >
            <MapPin className="w-3.5 h-3.5 text-rose-500" />
            <span>{isSharingGps ? 'GPS...' : lang === 'bn' ? 'লোকেশন পিন' : 'GPS Pin'}</span>
          </button>

          {/* 2. Upload Prescription / Requisition Image */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            title="হাসপাতালের রিকুইজিশন স্লিপ বা প্রেসক্রিপশন ছবি যুক্ত করুন"
          >
            <ImagePlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{lang === 'bn' ? 'স্লিপ / ছবি' : 'Slip Photo'}</span>
          </button>

          {/* 3. Insert Urgent SOS Card */}
          <button
            type="button"
            onClick={() => setShowSosComposer(!showSosComposer)}
            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'SOS কার্ড' : 'SOS Card'}</span>
          </button>

          {!isCommunityActive && (
            <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-[#25D366] font-bold shrink-0 cursor-pointer">
              <input
                id="chat-sync-whatsapp"
                name="syncWhatsAppOnSend"
                type="checkbox"
                checked={syncWhatsAppOnSend}
                onChange={(e) => setSyncWhatsAppOnSend(e.target.checked)}
                className="w-3 h-3 accent-emerald-600"
              />
              <span>WA সিঙ্ক</span>
            </label>
          )}

          {QUICK_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setInputText((prev) => `${prev}${em}`)}
              className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0 text-sm"
            >
              {em}
            </button>
          ))}
        </div>

        {/* 1-Tap Quick Voice Message Tray when Browser/iFrame Mic Permission is Blocked */}
        {showVoiceTemplates && (
          <div className="px-3 py-2 bg-slate-50 dark:bg-[#182229] border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                {lang === 'bn'
                  ? '🎙️ কুইক ভয়েস মেসেজ (১-ট্যাপে মেসেজ বক্সে যুক্ত করুন):'
                  : '🎙️ Quick Voice Phrases (1-tap insert):'}
              </span>
              <button
                type="button"
                onClick={() => setShowVoiceTemplates(false)}
                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(lang === 'bn'
                ? [
                    'আসসালামু আলাইকুম, জরুরি রক্তের প্রয়োজন — আপনি কি এখন রক্ত দিতে পারবেন?',
                    'আমি রক্ত দিতে প্রস্তুত আছি, হাসপাতালের নাম ও ওয়ার্ড নম্বর জানান।',
                    'আমি হাসপাতালের পথে রওনা দিয়েছি, শীঘ্রই পৌঁছাবো ইনশাআল্লাহ।',
                    'রোগীর প্রেসক্রিপশন বা রিকুইজিশন স্লিপটি শেয়ার করুন।',
                  ]
                : [
                    'Hello, urgent blood is needed at the hospital — are you available now?',
                    'I am ready to donate blood. Please share the hospital & ward details.',
                    'I am on the way to the hospital blood bank right now.',
                    'Please share the hospital requisition slip and attendant phone number.',
                  ]
              ).map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => {
                    setInputText(phrase);
                    setShowVoiceTemplates(false);
                    inputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500 cursor-pointer text-left"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* WhatsApp-Style Unlimited Message Composer + Voice Dictation + WA Auto-Save */}
        <form
          onSubmit={handleSendMessage}
          className="p-2 @md:p-2.5 bg-[#f0f2f5] dark:bg-[#202c33] flex items-end gap-1.5 shrink-0"
        >
          <button
            type="button"
            onClick={handleToggleVoiceDictation}
            className={`w-[42px] h-[42px] rounded-2xl flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isListeningVoice || showVoiceTemplates
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-[#2a3942] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
            title={lang === 'bn' ? 'ভয়েস টাইপিং বা কুইক মেসেজ' : 'Voice Dictation / Quick Phrases'}
          >
            {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <textarea
            id="chat-message-input"
            name="chatMessage"
            ref={inputRef}
            rows={1}
            placeholder={
              isListeningVoice
                ? lang === 'bn'
                  ? '🎙️ কথা বলুন... স্বয়ংক্রিয়ভাবে লেখা হচ্ছে'
                  : '🎙️ Listening...'
                : lang === 'bn'
                ? 'মেসেজ লিখুন বা লোকেশন / স্লিপ পাঠান...'
                : 'Type message or share GPS / slip...'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 min-h-[42px] max-h-28 py-2.5 px-3 text-xs @md:text-sm rounded-2xl bg-white dark:bg-[#2a3942] text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-[#128c7e] resize-none placeholder:text-slate-400"
          />

          <button
            type="button"
            onClick={() => handleSendViaWhatsAppAndSave()}
            className="h-[42px] px-2.5 rounded-2xl bg-[#25D366] hover:bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs cursor-pointer shrink-0 transition-colors"
            title="WhatsApp-এ পাঠান ও এই চ্যাটেও সেভ রাখুন"
          >
            <span>WA</span>
          </button>

          <button
            type="submit"
            disabled={isSending || (!inputText.trim() && !pendingAttachment)}
            className="w-[42px] h-[42px] rounded-2xl bg-[#075e54] hover:bg-[#128c7e] disabled:opacity-50 text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer shrink-0"
            title="লাইভ চ্যাটে পাঠান ও সেভ করুন"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Expandable Medical Prescription / Slip Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-slate-950 rounded-2xl p-2 border border-slate-800 space-y-2"
          >
            <div className="flex items-center justify-between px-2 py-1 text-white text-xs font-bold">
              <span>
                {lang === 'bn'
                  ? 'হাসপাতালের রিকুইজিশন স্লিপ / প্রেসক্রিপশন প্রিভিউ'
                  : 'Hospital Requisition Slip Preview'}
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={lightboxImage}
              alt="Full Medical Slip"
              className="w-full max-h-[78dvh] object-contain rounded-xl bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
};
