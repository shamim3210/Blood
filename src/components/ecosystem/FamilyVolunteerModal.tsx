import React, { useState } from 'react';
import { BloodGroup, Language } from '../../types';
import {
  X,
  Users,
  HeartHandshake,
  UserPlus,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface FamilyVolunteerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onOpenSOSWithGroup?: (group: BloodGroup) => void;
}

interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  bloodGroup: BloodGroup;
  phone: string;
  emergencyContact: boolean;
}

interface OfficialHotlineItem {
  id: string;
  nameBn: string;
  nameEn: string;
  zoneBn: string;
  zoneEn: string;
  phone: string;
}

const OFFICIAL_BLOOD_HOTLINES: OfficialHotlineItem[] = [
  {
    id: 'hl-999',
    nameBn: 'জাতীয় জরুরি সেবা (অ্যাম্বুলেন্স ও পুলিশ)',
    nameEn: 'National Emergency Service (Ambulance & Rescue)',
    zoneBn: 'সারাদেশ ২৪/৭ টোল-ফ্রি',
    zoneEn: 'Nationwide 24/7 Toll-Free',
    phone: '999',
  },
  {
    id: 'hl-rc',
    nameBn: 'বাংলাদেশ রেড ক্রিসেন্ট ব্লাড সেন্টার',
    nameEn: 'Bangladesh Red Crescent Blood Center',
    zoneBn: 'আওরঙ্গজেব রোড, মোহাম্মদপুর, ঢাকা',
    zoneEn: 'Aurangzeb Road, Mohammadpur, Dhaka',
    phone: '+880248110188',
  },
  {
    id: 'hl-quantum',
    nameBn: 'কোয়ান্টাম ফাউন্ডেশন ব্লাড ল্যাব',
    nameEn: 'Quantum Foundation Voluntary Blood Lab',
    zoneBn: 'শান্তিনগর, ঢাকা (২৪ ঘণ্টা ল্যাব)',
    zoneEn: 'Shantinagar, Dhaka (24h Lab)',
    phone: '+8801714010869',
  },
  {
    id: 'hl-health',
    nameBn: 'স্বাস্থ্য বাতায়ন (সরকারি মেডিকেল হেল্পলাইন)',
    nameEn: 'Shasthyo Batayon (Gov Medical Helpline)',
    zoneBn: 'সারাদেশ ২৪/৭',
    zoneEn: 'Nationwide 24/7',
    phone: '16263',
  },
];

export const FamilyVolunteerModal: React.FC<FamilyVolunteerModalProps> = ({
  isOpen,
  onClose,
  lang,
  onOpenSOSWithGroup,
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'volunteers'>('family');
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // 100% Real User-Saved Family Members Only (Zero fake pre-seeded relatives)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_family_members');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (m) => m && typeof m.id === 'string' && !/^fam-[1-4]$/.test(m.id)
          );
        }
      }
    } catch {}
    return [];
  });

  const [isAddingFamily, setIsAddingFamily] = useState(false);
  const [newFamName, setNewFamName] = useState('');
  const [newFamRelation, setNewFamRelation] = useState('Sibling');
  const [newFamGroup, setNewFamGroup] = useState<BloodGroup>('A+');
  const [newFamPhone, setNewFamPhone] = useState('');

  if (!isOpen) return null;

  const handleAddFamilyMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFamName.trim()) return;

    const newMember: FamilyMember = {
      id: `fam-${Date.now()}`,
      name: newFamName.trim(),
      relation: newFamRelation,
      bloodGroup: newFamGroup,
      phone: newFamPhone.trim() || (lang === 'bn' ? 'সংরক্ষিত নয়' : 'Not provided'),
      emergencyContact: true,
    };

    setFamilyMembers((prev) => {
      const next = [newMember, ...prev];
      try {
        localStorage.setItem('bloodsearch_family_members', JSON.stringify(next));
      } catch {}
      return next;
    });
    setIsAddingFamily(false);
    setNewFamName('');
    setNewFamPhone('');
    setSuccessNotice(
      lang === 'bn'
        ? 'পারিবারিক সদস্য সফলভাবে সংরক্ষিত হয়েছে।'
        : 'Family member saved to your emergency circle.'
    );
    setTimeout(() => setSuccessNotice(null), 2500);
  };

  const handleDeleteFamilyMember = (id: string) => {
    setFamilyMembers((prev) => {
      const next = prev.filter((m) => m.id !== id);
      try {
        localStorage.setItem('bloodsearch_family_members', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl my-2 sm:my-auto rounded-3xl bg-white dark:bg-[#0f172a] p-4 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'ফ্যামিলি রক্ত সুরক্ষা ও জরুরি হটলাইন'
                  : 'Family Blood Circle & Official Hotlines'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'bn'
                  ? 'নিজের পরিবারের রক্তের গ্রুপ সংরক্ষণ ও ভেরিফাইড ব্লাড সেন্টার নম্বর'
                  : 'Save your family blood groups & call verified institutional blood banks'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successNotice && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* 2 Segmented Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl my-5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('family')}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'family'
                ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>
              {lang === 'bn' ? 'পারিবারিক তালিকা' : 'Family Circle'} ({familyMembers.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('volunteers')}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'volunteers'
                ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>{lang === 'bn' ? 'অফিশিয়াল হটলাইন' : 'Official Hotlines'}</span>
          </button>
        </div>

        {/* Family Tab */}
        {activeTab === 'family' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {lang === 'bn' ? 'সংরক্ষিত পরিবারের সদস্য' : 'Saved Family Members'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'আপনার ডিভাইসে ব্যক্তিগতভাবে সংরক্ষিত থাকে'
                    : 'Stored privately on your device for instant 1-tap SOS'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingFamily(!isAddingFamily)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs cursor-pointer shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>
                  {isAddingFamily
                    ? lang === 'bn'
                      ? 'বাতিল'
                      : 'Cancel'
                    : lang === 'bn'
                      ? '+ সদস্য যুক্ত করুন'
                      : '+ Add Member'}
                </span>
              </button>
            </div>

            {isAddingFamily && (
              <form
                onSubmit={handleAddFamilyMember}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'সদস্যের নাম *' : 'Member Name *'}
                    </label>
                    <input
                      name="familyMemberName"
                      type="text"
                      placeholder={lang === 'bn' ? 'নাম লিখুন' : 'Full name'}
                      value={newFamName}
                      onChange={(e) => setNewFamName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'সম্পর্ক' : 'Relation'}
                    </label>
                    <select
                      name="familyMemberRelation"
                      value={newFamRelation}
                      onChange={(e) => setNewFamRelation(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="Father">Father (বাবা)</option>
                      <option value="Mother">Mother (মা)</option>
                      <option value="Spouse">Spouse (স্ত্রী/স্বামী)</option>
                      <option value="Child">Child (সন্তান)</option>
                      <option value="Sibling">Sibling (ভাই/বোন)</option>
                      <option value="Relative">Other Relative</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'ব্লাড গ্রুপ' : 'Blood Group'}
                    </label>
                    <select
                      name="familyMemberBloodGroup"
                      value={newFamGroup}
                      onChange={(e) => setNewFamGroup(e.target.value as BloodGroup)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-bold text-rose-600"
                    >
                      {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as BloodGroup[]).map(
                        (g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {lang === 'bn' ? 'মোবাইল নম্বর (ঐচ্ছিক)' : 'Phone Number (Optional)'}
                    </label>
                    <input
                      name="familyMemberPhone"
                      type="tel"
                      placeholder="01XXXXXXXXX"
                      value={newFamPhone}
                      onChange={(e) => setNewFamPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  {lang === 'bn' ? 'সদস্য সংরক্ষণ করুন' : 'Save Family Member'}
                </button>
              </form>
            )}

            {familyMembers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <Users className="w-7 h-7 text-slate-400 mx-auto" />
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {lang === 'bn'
                    ? 'এখনো পরিবারের কোনো সদস্য যুক্ত করা হয়নি'
                    : 'No family members added yet'}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'উপরের "+ সদস্য যুক্ত করুন" বাটনে চাপ দিয়ে বাবা, মা বা পরিবারের সদস্যদের রক্তের গ্রুপ সংরক্ষণ করে রাখুন।'
                    : 'Tap "+ Add Member" above to save your family blood groups for instant emergency access.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {familyMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-rose-600 text-white font-black text-sm flex items-center justify-center shrink-0">
                        {member.bloodGroup}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {member.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {member.relation} · {member.phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenSOSWithGroup) {
                            onOpenSOSWithGroup(member.bloodGroup);
                            onClose();
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        1-Tap SOS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFamilyMember(member.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Official Hotlines Tab */}
        {activeTab === 'volunteers' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white block">
                  {lang === 'bn'
                    ? 'ভেরিফাইড জাতীয় ব্লাড ব্যাংক ও জরুরি হটলাইন'
                    : 'Verified National Blood Bank & Emergency Hotlines'}
                </span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                  {lang === 'bn'
                    ? 'সরাসরি অনুমোদিত ব্লাড সেন্টার ও জাতীয় হেল্পলাইনে কল করুন।'
                    : 'Call authorized institutional blood labs and national emergency lines directly.'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {OFFICIAL_BLOOD_HOTLINES.map((hl) => (
                <div
                  key={hl.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      {lang === 'bn' ? hl.nameBn : hl.nameEn}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {lang === 'bn' ? hl.zoneBn : hl.zoneEn} ·{' '}
                      <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {hl.phone}
                      </span>
                    </div>
                  </div>

                  <a
                    href={`tel:${hl.phone}`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{lang === 'bn' ? 'কল করুন' : 'Call Now'}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
