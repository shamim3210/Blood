import React, { useState, useEffect } from 'react';
import { Language, BloodGroup } from '../../types';
import { ALL_BLOOD_GROUPS } from '../../data/compatibility';
import {
  Heart,
  UserPlus,
  Share2,
  Phone,
  X,
  Users,
  Trash2,
  Plus,
} from 'lucide-react';
import { playEmergencyChime } from '../../utils/audioAlert';

interface RepeatDonorSlot {
  name: string;
  phone: string;
  monthSlot: string;
  confirmed: boolean;
}

interface ThalassemiaPatient {
  id: string;
  name: string;
  age: number;
  bloodGroup: BloodGroup;
  hospital: string;
  guardianName: string;
  contactPhone: string;
  transfusionIntervalDays: number;
  lastTransfusionDate: string;
  currentHb: number;
  repeatDonors: RepeatDonorSlot[];
}

interface ThalassemiaManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const ThalassemiaManagerModal: React.FC<ThalassemiaManagerModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  // 100% Real User-Added Patients Only (Zero pre-populated fake patients)
  const [patients, setPatients] = useState<ThalassemiaPatient[]>(() => {
    try {
      const saved = localStorage.getItem('bloodsearch_thalassemia_patients');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (p) => p && typeof p.id === 'string' && !/^th-[1-2]$/.test(p.id)
          );
        }
      }
    } catch {}
    return [];
  });

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    () => patients[0]?.id || ''
  );
  const [isAddingPatient, setIsAddingPatient] = useState<boolean>(() => patients.length === 0);
  const [copiedReminder, setCopiedReminder] = useState(false);

  // New Patient Form
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState(10);
  const [newGroup, setNewGroup] = useState<BloodGroup>('B+');
  const [newHospital, setNewHospital] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newInterval, setNewInterval] = useState(21);
  const [newHb, setNewHb] = useState(8.0);

  // Add Repeat Donor Form
  const [addingDonorForPatient, setAddingDonorForPatient] = useState(false);
  const [slotDonorName, setSlotDonorName] = useState('');
  const [slotDonorPhone, setSlotDonorPhone] = useState('');
  const [slotMonthLabel, setSlotMonthLabel] = useState('১ম মাস');

  useEffect(() => {
    try {
      localStorage.setItem('bloodsearch_thalassemia_patients', JSON.stringify(patients));
    } catch {}
  }, [patients]);

  if (!isOpen) return null;

  const currentPatient = patients.find((p) => p.id === selectedPatientId) || patients[0] || null;

  const calculateDaysRemaining = (patient: ThalassemiaPatient) => {
    const lastDate = new Date(patient.lastTransfusionDate).getTime();
    const cycleMs = patient.transfusionIntervalDays * 24 * 3600 * 1000;
    const nextDate = lastDate + cycleMs;
    return Math.ceil((nextDate - Date.now()) / (1000 * 3600 * 24));
  };

  const daysRemaining = currentPatient ? calculateDaysRemaining(currentPatient) : 0;
  const isUrgent = daysRemaining <= 3;

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim() || !newHospital.trim()) return;

    const newPat: ThalassemiaPatient = {
      id: `th-${Date.now()}`,
      name: newName.trim(),
      age: Number(newAge) || 10,
      bloodGroup: newGroup,
      hospital: newHospital.trim(),
      guardianName: lang === 'bn' ? 'অভিভাবক' : 'Guardian',
      contactPhone: newPhone.trim(),
      transfusionIntervalDays: Number(newInterval) || 21,
      lastTransfusionDate: new Date().toISOString().split('T')[0],
      currentHb: Number(newHb) || 8.0,
      repeatDonors: [],
    };

    setPatients((prev) => [newPat, ...prev]);
    setSelectedPatientId(newPat.id);
    setIsAddingPatient(false);
    setNewName('');
    setNewHospital('');
    setNewPhone('');
    playEmergencyChime();
  };

  const handleDeletePatient = (id: string) => {
    setPatients((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (selectedPatientId === id) {
        setSelectedPatientId(next[0]?.id || '');
      }
      return next;
    });
  };

  const handleAddRepeatDonor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPatient || !slotDonorName.trim() || !slotDonorPhone.trim()) return;
    const newSlot: RepeatDonorSlot = {
      name: slotDonorName.trim(),
      phone: slotDonorPhone.trim(),
      monthSlot: slotMonthLabel.trim() || 'নিয়মিত রক্তদাতা',
      confirmed: true,
    };
    setPatients((prev) =>
      prev.map((p) =>
        p.id === currentPatient.id ? { ...p, repeatDonors: [...p.repeatDonors, newSlot] } : p
      )
    );
    setSlotDonorName('');
    setSlotDonorPhone('');
    setAddingDonorForPatient(false);
  };

  const buildReminderMessage = (patient: ThalassemiaPatient) =>
    `জরুরি থ্যালাসেমিয়া রিমাইন্ডার:\nরোগীর নাম: ${patient.name}\nব্লাড গ্রুপ: ${patient.bloodGroup}\nহাসপাতাল: ${patient.hospital}\nরক্ত নেওয়ার তারিখ: আগামী ${Math.max(1, daysRemaining)} দিনের মধ্যে\nবর্তমান হিমোগ্লোবিন: ${patient.currentHb} g/dL\nঅভিভাবকের নম্বর: ${patient.contactPhone}\n\nঅনুগ্রহ করে রক্তদানে এগিয়ে আসুন। BloodSearch Network BD.`;

  const handleCopyReminder = (patient: ThalassemiaPatient) => {
    const message = buildReminderMessage(patient);
    navigator.clipboard?.writeText(message).catch(() => {});
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-2.5 sm:p-4 bg-black/80 overflow-y-auto modal-scroll-contain"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl my-2 sm:my-auto rounded-3xl bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white p-4 sm:p-6 shadow-2xl border border-slate-300 dark:border-slate-700 transition-all text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-600 text-white flex items-center justify-center shadow-md">
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {lang === 'bn'
                  ? 'থ্যালাসেমিয়া ও নিয়মিত রক্ত সঞ্চালন ট্র্যাকার'
                  : 'Thalassemia & Routine Blood Tracker'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'bn'
                  ? 'থ্যালাসেমিয়া ও ডায়ালাইসিস রোগীদের ব্যক্তিগত রক্তদান শিডিউল ও ডোনার পুল'
                  : 'Personal recurring transfusion schedule and rotating donor pool'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient Selector Strip */}
        <div className="py-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5 shrink-0">
            {patients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedPatientId(p.id);
                  setIsAddingPatient(false);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  currentPatient?.id === p.id && !isAddingPatient
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>{p.name}</span>
                <span className="font-mono font-black">({p.bloodGroup})</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsAddingPatient(!isAddingPatient)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>
              {isAddingPatient && patients.length > 0
                ? lang === 'bn'
                  ? 'বাতিল'
                  : 'Cancel'
                : lang === 'bn'
                  ? '+ নতুন রোগী যুক্ত করুন'
                  : '+ Add Patient'}
            </span>
          </button>
        </div>

        {/* Add Patient Form vs Patient Dashboard */}
        {isAddingPatient || !currentPatient ? (
          <form onSubmit={handleAddPatient} className="py-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {lang === 'bn'
                ? 'নতুন থ্যালাসেমিয়া / ডায়ালাইসিস রোগীর তথ্য যুক্ত করুন'
                : 'Add Thalassemia / Routine Transfusion Patient'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'রোগীর নাম *' : 'Patient Name *'}
                </label>
                <input
                  name="thalPatientName"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={lang === 'bn' ? 'রোগীর আসল নাম লিখুন' : 'Enter patient full name'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'ব্লাড গ্রুপ *' : 'Blood Group *'}
                </label>
                <select
                  name="thalBloodGroup"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value as BloodGroup)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                >
                  {ALL_BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'হাসপাতাল / কেন্দ্রের নাম *' : 'Hospital / Center *'}
                </label>
                <input
                  name="thalHospital"
                  type="text"
                  value={newHospital}
                  onChange={(e) => setNewHospital(e.target.value)}
                  placeholder={lang === 'bn' ? 'হাসপাতালের নাম লিখুন' : 'Hospital name'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'অভিভাবকের মোবাইল নম্বর *' : 'Guardian Mobile *'}
                </label>
                <input
                  name="thalGuardianPhone"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'রক্ত নেওয়ার ব্যবধান' : 'Transfusion Interval'}
                </label>
                <select
                  name="thalIntervalDays"
                  value={newInterval}
                  onChange={(e) => setNewInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold"
                >
                  <option value={14}>১৪ দিন পর পর (14 days)</option>
                  <option value={21}>২১ দিন পর পর (21 days)</option>
                  <option value={28}>২৮ দিন পর পর (28 days)</option>
                  <option value={35}>৩৫ দিন পর পর (35 days)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {lang === 'bn' ? 'বর্তমান হিমোগ্লোবিন (Hb g/dL)' : 'Current Hemoglobin (g/dL)'}
                </label>
                <input
                  name="thalCurrentHb"
                  type="number"
                  step="0.1"
                  value={newHb}
                  onChange={(e) => setNewHb(Number(e.target.value))}
                  placeholder="8.0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              >
                {lang === 'bn' ? 'রোগীর শিডিউল সংরক্ষণ করুন' : 'Save Patient Schedule'}
              </button>
              {patients.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddingPatient(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="py-4 space-y-4">
            {/* Countdown Banner */}
            <div
              className={`p-4 rounded-2xl border text-white shadow-md ${
                isUrgent
                  ? 'bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 border-red-400'
                  : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold text-amber-200 mb-1">
                    {currentPatient.name} · {currentPatient.hospital}
                  </div>
                  <h3 className="text-lg sm:text-xl font-black">
                    {daysRemaining <= 0
                      ? lang === 'bn'
                        ? 'আজই রক্ত গ্রহণ প্রয়োজন!'
                        : 'Transfusion due today!'
                      : lang === 'bn'
                        ? `আগামী ${daysRemaining} দিনের মধ্যে রক্ত প্রয়োজন`
                        : `Next transfusion in ${daysRemaining} day(s)`}
                  </h3>
                </div>

                <div className="flex items-center gap-2 bg-black/30 p-3 rounded-2xl border border-white/20 shrink-0">
                  <div className="text-center font-mono">
                    <span className="text-2xl font-black text-amber-300">
                      {Math.max(0, daysRemaining)}
                    </span>
                    <span className="text-[10px] text-slate-300 block -mt-1 font-bold">
                      {lang === 'bn' ? 'দিন বাকি' : 'Days'}
                    </span>
                  </div>
                  <span className="text-white/40 font-bold">:</span>
                  <div className="text-center font-mono">
                    <span className="text-2xl font-black text-white">
                      {currentPatient.bloodGroup}
                    </span>
                    <span className="text-[10px] text-slate-300 block -mt-1 font-bold">
                      {lang === 'bn' ? 'গ্রুপ' : 'Group'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hb & Guardian Strip */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Hb: <span className="font-mono text-rose-600">{currentPatient.currentHb} g/dL</span>{' '}
                  · {lang === 'bn' ? 'ব্যবধান' : 'Cycle'}: {currentPatient.transfusionIntervalDays}{' '}
                  {lang === 'bn' ? 'দিন' : 'days'}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {currentPatient.contactPhone}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href={`tel:${currentPatient.contactPhone}`}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'কল' : 'Call'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleDeletePatient(currentPatient.id)}
                  className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  title="Remove Patient"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Rotating Donor Pool */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-600" />
                  <span>
                    {lang === 'bn' ? 'রক্তদাতা রোটেশন পুল' : 'Rotating Donor Pool'} (
                    {currentPatient.repeatDonors.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingDonorForPatient(!addingDonorForPatient)}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'ডোনার যুক্ত করুন' : 'Add Donor'}</span>
                </button>
              </div>

              {addingDonorForPatient && (
                <form
                  onSubmit={handleAddRepeatDonor}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  <input
                    name="slotDonorName"
                    type="text"
                    required
                    placeholder={lang === 'bn' ? 'ডোনারের নাম' : 'Donor Name'}
                    value={slotDonorName}
                    onChange={(e) => setSlotDonorName(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                  />
                  <input
                    name="slotDonorPhone"
                    type="tel"
                    required
                    placeholder="01XXXXXXXXX"
                    value={slotDonorPhone}
                    onChange={(e) => setSlotDonorPhone(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                  />
                  <div className="flex gap-1.5">
                    <input
                      name="slotMonthLabel"
                      type="text"
                      placeholder={lang === 'bn' ? 'মাস (যেমন: ১ম মাস)' : 'Month Slot'}
                      value={slotMonthLabel}
                      onChange={(e) => setSlotMonthLabel(e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              {currentPatient.repeatDonors.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
                  {lang === 'bn'
                    ? 'এই রোগীর জন্য এখনো কোনো নির্ধারিত রোটেশন ডোনার যুক্ত করা হয়নি।'
                    : 'No rotating donors added for this patient yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentPatient.repeatDonors.map((donor, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div>
                        <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                          {donor.name}
                        </h5>
                        <span className="text-[11px] text-slate-500 font-mono block">
                          {donor.monthSlot} · {donor.phone}
                        </span>
                      </div>
                      <a
                        href={`tel:${donor.phone}`}
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Share Reminder */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  buildReminderMessage(currentPatient)
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleCopyReminder(currentPatient)}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>
                  {copiedReminder
                    ? lang === 'bn'
                      ? '✓ রিমাইন্ডার কপি হয়েছে ও হোয়াটসঅ্যাপ খুলছে!'
                      : '✓ Reminder Copied & Opening WhatsApp!'
                    : lang === 'bn'
                      ? 'হোয়াটসঅ্যাপে রিমাইন্ডার পাঠান'
                      : 'Send Reminder via WhatsApp'}
                </span>
              </a>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
