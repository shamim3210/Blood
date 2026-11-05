import React, { useState } from 'react';
import { BloodGroup, Language } from '../../types';
import { 
  ChevronRight, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Check, 
  Award, 
  Play, 
  Pause, 
  ShieldCheck, 
  Flame, 
  Bell, 
  Search, 
  Heart, 
  Droplet, 
  Hospital, 
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  X,
  Radio,
  Send,
  MoreVertical,
  Phone,
  Mic,
  Calendar,
  Share2,
  Layers,
  Sparkles,
  Sliders,
  Shield,
  Eye,
  LayoutGrid
} from 'lucide-react';

interface PdfExactShowcaseProps {
  lang: Language;
  darkMode: boolean;
  onOpenSOSModal: () => void;
}

export const PdfExactShowcase: React.FC<PdfExactShowcaseProps> = ({
  lang,
  darkMode,
  onOpenSOSModal,
}) => {
  // 'all' = All slides view (Presentation Deck mode)
  // 'page1' = Page 1 Trio (Blood Request, Dashboard, Donor Events)
  // 'page2' = Page 2 Trio (What's blood type, Urgent Near You, Emergency Detail)
  // 'page3' = Page 3 Trio (Urgency Form, Request Sent ✓, Group Selector)
  // 'page5' = Page 5 Duo (Light & Dark mode side-by-side)
  // 'page6' = Page 6 Duo (Badges List, Badge Detail with ribbon medal)
  // 'page7' = Page 7 Duo (7 Health condition switches, Donor responds modal)
  // 'page8' = Page 8, 10, 14 (Incident Command Center & Evacuation Alert)
  // 'page18' = Page 18 Trio (Post Request, Inbox, Chat with Audio Waveform)
  const [activePage, setActivePage] = useState<
    'all' | 'page1' | 'page2' | 'page3' | 'page5' | 'page6' | 'page7' | 'page8' | 'page18'
  >('all');

  // Interactive states for phone mockups
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup>('B+');
  const [rsvpState, setRsvpState] = useState<Record<string, boolean>>({ 'ev-1': false, 'ev-2': true, 'ev-3': false });
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [healthSwitches, setHealthSwitches] = useState({
    nonAlcoholic: true,
    hivNegative: true,
    rheumaticFever: true,
    covidNegative: true,
    thalassemiaNegative: true,
    hepatitisNegative: true,
    normalBP: true,
  });

  const toggleHealth = (key: keyof typeof healthSwitches) => {
    setHealthSwitches((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRsvp = (id: string) => {
    setRsvpState((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Reusable Smartphone Frame wrapper with SOLID clean backgrounds and ultra-high contrast text
  const PhoneMockup: React.FC<{ title?: string; children: React.ReactNode; isLightPhone?: boolean }> = ({
    title,
    children,
    isLightPhone = false,
  }) => {
    const isDark = isLightPhone ? false : true;

    return (
      <div className="flex flex-col items-center my-2">
        {title && (
          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700">
            {title}
          </span>
        )}
        <div
          className={`w-[320px] sm:w-[350px] h-[720px] rounded-[48px] p-2.5 shadow-2xl relative overflow-hidden flex flex-col border-[7px] transition-colors ${
            isDark
              ? 'bg-[#090d16] border-[#222f44] shadow-black/80 ring-1 ring-slate-800'
              : 'bg-[#f1f5f9] border-[#cbd5e1] shadow-slate-400/50 ring-1 ring-slate-300'
          }`}
        >
          {/* Dynamic Island Notch */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-26 h-6.5 bg-black rounded-full z-50 flex items-center justify-between px-3 border border-slate-800/80">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-950 flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-blue-900" />
            </div>
          </div>

          {/* Screen Content Container with SOLID normal background */}
          <div
            className={`w-full h-full rounded-[38px] overflow-y-auto overflow-x-hidden pt-8 px-4 pb-6 font-sans text-xs select-none scrollbar-none transition-colors ${
              isDark
                ? 'bg-[#0f172a] text-[#f8fafc]'
                : 'bg-[#f8fafc] text-[#0f172a]'
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    );
  };

  /* Render Page 1 */
  const renderPage1 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: Blood Request Form (Page 1 Left) */}
      <PhoneMockup title="Screen 1: Blood Request">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-800">
            <span className="text-base font-bold text-slate-300 cursor-pointer">‹</span>
            <h3 className="text-base font-bold text-white">Blood Request</h3>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Request Type</label>
            <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 text-white text-xs font-bold flex justify-between items-center shadow-xs">
              <span>Emergency</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Patient Details</label>
            <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 text-white text-xs flex items-center gap-2.5 shadow-xs">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs">👤</div>
              <div>
                <span className="font-bold block text-white">H. Roberts</span>
                <span className="text-[10px] text-slate-300">Age: 34 · ICU Patient</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Location</label>
            <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 text-white text-xs flex items-center gap-2.5 shadow-xs">
              <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
              <div>
                <span className="font-bold text-white block">City Hospital (DMCH)</span>
                <span className="text-[10px] text-slate-300">Secretariat Road, Shahbagh, Dhaka</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Urgency</label>
            <div className="p-3 rounded-xl bg-[#1e293b] border border-red-500 text-white text-xs flex justify-between items-center shadow-xs">
              <span className="font-black text-rose-400">IMMEDIATE</span>
              <span className="text-[10px] text-rose-200 font-bold bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
                Critical Priority
              </span>
            </div>
            <span className="text-[11px] text-slate-300 mt-1.5 block">
              Emit immediate high-priority alert to nearby verified donors
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSOSModal}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer mt-3"
          >
            Submit Request →
          </button>
        </div>
      </PhoneMockup>

      {/* Phone 2: Dashboard with Circular Progress Inventory (Page 1 Center) */}
      <PhoneMockup title="Screen 2: Dashboard">
        <div className="space-y-4 text-left">
          {/* Header */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="space-y-1 cursor-pointer">
                <div className="w-4 h-0.5 bg-white" />
                <div className="w-3 h-0.5 bg-white" />
              </div>
              <h3 className="text-base font-bold text-white">Dashboard</h3>
            </div>
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-slate-300 cursor-pointer" />
              <Bell className="w-4 h-4 text-slate-300 cursor-pointer" />
            </div>
          </div>

          {/* Blood type Inventory */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-white">Blood type Inventory</span>
              <span className="text-[11px] text-rose-400 font-bold cursor-pointer hover:underline">See all</span>
            </div>

            {/* 3 Circular Cards matching Page 1 */}
            <div className="grid grid-cols-3 gap-2">
              {/* Card 1: A+ 85% */}
              <div className="p-2.5 rounded-2xl bg-gradient-to-b from-red-600 to-rose-700 text-white text-center flex flex-col items-center shadow-md">
                <span className="text-base font-black">A+</span>
                <div className="relative w-11 h-11 my-1.5 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeDasharray="85, 100" />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold text-white">85%</span>
                </div>
                <span className="text-[9px] font-black text-rose-100 uppercase tracking-tight">High Stock</span>
              </div>

              {/* Card 2: B- 12% */}
              <div className="p-2.5 rounded-2xl bg-[#1e293b] border border-slate-700 text-center flex flex-col items-center shadow-xs">
                <span className="text-base font-black text-white">B-</span>
                <div className="relative w-11 h-11 my-1.5 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#334155" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ef4444" strokeWidth="3.5" strokeDasharray="12, 100" />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold text-red-400">12%</span>
                </div>
                <span className="text-[9px] font-black text-red-400 uppercase tracking-tight">Critical</span>
              </div>

              {/* Card 3: O+ 95% */}
              <div className="p-2.5 rounded-2xl bg-[#1e293b] border border-slate-700 text-center flex flex-col items-center shadow-xs">
                <span className="text-base font-black text-white">O+</span>
                <div className="relative w-11 h-11 my-1.5 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#334155" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3.5" strokeDasharray="95, 100" />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold text-emerald-400">95%</span>
                </div>
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tight">Sufficient</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-white">Recent activity</span>
              <span className="text-[11px] text-rose-400 font-bold cursor-pointer hover:underline">See all</span>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex justify-between items-center shadow-xs">
                <div>
                  <span className="font-bold text-xs text-white block">Recent Recovery</span>
                  <span className="text-[10px] text-slate-300">3 minutes ago · City Center</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex justify-between items-center shadow-xs">
                <div>
                  <span className="font-bold text-xs text-white block">Profile verification</span>
                  <span className="text-[10px] text-slate-300">2 months ago · Level 3 Donor</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&q=80"
                    alt="Profile"
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <div>
                    <span className="font-bold text-xs text-white block">Profile Status</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Sufficient is succeeded</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Bottom Nav Mockup matching Page 1 Center */}
          <div className="pt-4 border-t border-slate-800 flex justify-around text-slate-300 text-xs">
            <span className="text-rose-500 font-bold">🏠 Home</span>
            <span>💬 Chat</span>
            <span>❤️ Donate</span>
            <span>👤 User</span>
            <span>⚙️ Settings</span>
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 3: Donor Events with Red RSVP (Page 1 Right) */}
      <PhoneMockup title="Screen 3: Donor Events">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-800">
            <span className="text-base font-bold text-slate-300 cursor-pointer">‹</span>
            <h3 className="text-base font-bold text-white">Donor Events</h3>
          </div>

          <div className="space-y-3">
            {[
              { id: 'ev-1', date: 'Oct 28', title: 'City Blood Drive', time: 'Oct 28 · 9-4pm', place: 'Local Donation Drive at Dhaka Medical College Gate 2' },
              { id: 'ev-2', date: 'Oct 28', title: 'Metro Health Event', time: 'Oct 28 · 10-5pm', place: 'Community Center, Dhanmondi 27 Red Cross Booth' },
              { id: 'ev-3', date: 'Oct 31', title: 'Community Donor Day', time: 'Oct 31 · 9-3pm', place: 'Mirpur Indoor Stadium Blood Donation Camp' },
            ].map((event) => {
              const isRsvpd = rsvpState[event.id];
              return (
                <div key={event.id} className="p-3.5 rounded-2xl bg-[#1e293b] border border-slate-700 space-y-2 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-1 rounded-lg bg-rose-600 text-white font-black text-[10px] uppercase">
                        {event.date}
                      </span>
                      <div>
                        <h4 className="font-bold text-xs text-white">{event.title}</h4>
                        <span className="text-[10px] text-slate-300 block font-mono">{event.time}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRsvp(event.id)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                        isRsvpd
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                      }`}
                    >
                      {isRsvpd ? 'RSVP ✓' : 'RSVP'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    {event.place}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Bottom Nav */}
          <div className="pt-6 border-t border-slate-800 flex justify-around text-slate-300 text-xs">
            <span className="text-rose-500 font-bold">📅 Events</span>
            <span>❤️ Blood</span>
            <span>🔔 Alert</span>
            <span>👤 Profile</span>
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 2 */
  const renderPage2 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: What's your blood type? 8 Buttons Grid (Page 2 Screen 1) */}
      <PhoneMockup isLightPhone title="Screen 1: Type Selection">
        <div className="space-y-4 text-left">
          <div>
            <span className="text-[10px] font-extrabold text-rose-600 uppercase tracking-wider block">
              ● BLOOD HELP
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-1">
              What's your blood type?
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Takes 5 seconds. Lets us show you exactly when your type is urgently needed nearby.
            </p>
          </div>

          {/* 8 Blood Type Buttons (2 rows x 4 cols) matching Page 2 Screen 1 */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { group: 'A+', label: 'A', sub: 'Pos' },
              { group: 'A-', label: 'A', sub: 'Neg' },
              { group: 'B+', label: 'B', sub: 'Pos' },
              { group: 'B-', label: 'B', sub: 'Neg' },
              { group: 'O+', label: 'O', sub: 'Pos' },
              { group: 'O-', label: 'O', sub: 'Neg' },
              { group: 'AB+', label: 'AB', sub: 'Pos' },
              { group: 'AB-', label: 'AB', sub: 'Neg' },
            ].map((item) => {
              const isSelected = selectedGroup === item.group;
              return (
                <button
                  key={item.group}
                  type="button"
                  onClick={() => setSelectedGroup(item.group as any)}
                  className={`h-16 rounded-2xl flex flex-col items-center justify-center border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md scale-105'
                      : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'
                  }`}
                >
                  <span className="text-base font-black leading-tight">{item.label}</span>
                  <span className={`text-[10px] font-bold ${isSelected ? 'text-rose-100' : 'text-slate-600'}`}>
                    {item.sub}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-center pt-2">
            <span className="text-xs font-bold text-slate-700 hover:underline cursor-pointer">
              Don't know your blood type? →
            </span>
          </div>

          <button
            type="button"
            className="w-full py-3.5 bg-black hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Continue →
          </button>

          <div className="text-center">
            <span className="text-xs text-slate-500 font-semibold cursor-pointer">
              Skip — I need blood instead
            </span>
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 2: Urgent Near You Feed (Page 2 Screen 2) */}
      <PhoneMockup isLightPhone title="Screen 2: Urgent Near You">
        <div className="space-y-4 text-left">
          <div>
            <span className="text-[10px] font-extrabold text-rose-600 uppercase tracking-wider block">
              ● BLOOD HELP
            </span>
          </div>

          {/* Top Red Live Banner matching Page 2 Screen 2 */}
          <div className="p-3.5 rounded-2xl bg-rose-600 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-white/25 text-[10px] font-black uppercase">
                LIVE 3
              </span>
              <span className="text-xs font-bold">
                {selectedGroup} needed now. Within 2.4km.
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                URGENT NEAR YOU
              </span>
              <span className="text-[11px] text-rose-600 font-bold cursor-pointer hover:underline">See all</span>
            </div>

            {/* Card 1: St. Mary's */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-2.5 mb-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black text-red-600 uppercase">CRITICAL</span>
                  <h4 className="font-bold text-xs text-slate-900 mt-0.5">St. Mary's Hospital</h4>
                  <span className="text-xs text-slate-700 font-medium">{selectedGroup} · 2 units · 1.2 km</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono font-bold">4 min ago</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-lg shadow-sm">
                  ✓ Respond Now
                </button>
                <button className="px-3 py-1.5 bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg">
                  Later
                </button>
              </div>
            </div>

            {/* Card 2: City Blood Bank */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-300 shadow-sm space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-black text-amber-600 uppercase">NEEDED</span>
                  <h4 className="font-bold text-xs text-slate-900 mt-0.5">City Blood Bank</h4>
                  <span className="text-xs text-slate-700 font-medium">{selectedGroup} · 1 unit · 1.9 km</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono font-bold">11 min ago</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-lg shadow-sm">
                  ✓ Respond Now
                </button>
                <button className="px-3 py-1.5 bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg">
                  Later
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Counter Strip */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-900 text-white text-center border border-slate-800">
            <div>
              <span className="text-base font-black font-mono block text-white">4</span>
              <span className="text-[9px] text-slate-300 uppercase font-semibold">Donations</span>
            </div>
            <div className="border-x border-slate-700">
              <span className="text-base font-black font-mono text-rose-400 block">3</span>
              <span className="text-[9px] text-slate-300 uppercase font-semibold">Lives</span>
            </div>
            <div>
              <span className="text-base font-black font-mono text-emerald-400 block">{selectedGroup}</span>
              <span className="text-[9px] text-slate-300 uppercase font-semibold">Your Type</span>
            </div>
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 3: Giant Red B+ Emergency Card (Page 2 Screen 3) */}
      <PhoneMockup title="Screen 3: Emergency Detail">
        <div className="space-y-4 text-left">
          <div className="flex justify-between items-center pb-1 border-b border-slate-800">
            <span className="text-[10px] font-black text-red-400 uppercase">● EMERGENCY REQUEST</span>
            <span className="text-xs text-slate-300 font-bold cursor-pointer">✕</span>
          </div>

          {/* Giant Red Card with huge B+ */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-xl shadow-red-600/30">
            <span className="text-5xl font-black block tracking-tight">{selectedGroup}</span>
            <span className="text-xs text-rose-100 mt-1 block font-bold">St. Mary's Hospital</span>
            <div className="flex justify-between items-center text-xs text-rose-200 mt-2">
              <span className="font-semibold">2 units needed</span>
              <span className="px-2 py-0.5 rounded-full bg-white/20 font-black uppercase text-[10px]">Critical</span>
            </div>
            <span className="text-[11px] text-rose-200 block mt-1 font-mono">1.2 km away · Posted 3 minutes ago</span>
          </div>

          {/* Map Preview Box */}
          <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex justify-between items-center shadow-xs">
            <span className="font-mono font-bold text-xs text-slate-200">1.2 KM AWAY</span>
            <span className="text-[10px] font-black text-rose-400 uppercase cursor-pointer hover:underline">TAP TO OPEN MAPS</span>
          </div>

          {/* Big Green Action Button */}
          <button
            type="button"
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer"
          >
            ✓ I Can Donate Now
          </button>

          <div className="text-center space-y-1.5">
            <span className="text-xs text-slate-300 block cursor-pointer hover:underline">Remind me in 1 hour</span>
            <span className="text-xs text-slate-400 block cursor-pointer hover:underline">Not this time</span>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-300 text-center font-mono">
            Verified by hospital staff · Request #BH-8847
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 3 */
  const renderPage3 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: Urgency Radios matching Page 3 Left */}
      <PhoneMockup isLightPhone title="Screen 1: Set Urgency">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
            <span className="text-slate-600 font-bold cursor-pointer">‹</span>
            <h3 className="text-sm font-bold text-slate-900">Request Blood</h3>
          </div>

          <div className="space-y-2.5">
            <div className="p-3.5 rounded-xl border-2 border-red-500 bg-red-50 text-slate-900">
              <span className="font-black text-xs text-red-600 block">Critical</span>
              <span className="text-xs text-slate-700 font-medium">Immediate within 2 hours · 5 km emergency radius</span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-300 bg-white text-slate-900">
              <span className="font-bold text-xs text-amber-600 block">Urgent</span>
              <span className="text-xs text-slate-700 font-medium">Needed today · 10 km radius</span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-300 bg-white text-slate-900">
              <span className="font-bold text-xs text-slate-800 block">Standard</span>
              <span className="text-xs text-slate-700 font-medium">Scheduled surgery / 24-48 hours</span>
            </div>
          </div>

          <button className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow mt-4 cursor-pointer">
            Continue →
          </button>
        </div>
      </PhoneMockup>

      {/* Phone 2: Request Sent Checkmark matching Page 3 Center */}
      <PhoneMockup isLightPhone title="Screen 2: Request Sent ✓">
        <div className="space-y-4 text-center py-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center ring-8 ring-emerald-50">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Request Sent</h3>
            <span className="text-xs text-slate-600 font-medium block mt-1">
              Dhaka Medical College Area · 1 km
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-100 text-center font-mono border border-slate-200">
            <div>
              <span className="text-xs text-slate-600 block font-bold">Group</span>
              <span className="font-black text-rose-600 text-base">{selectedGroup}</span>
            </div>
            <div>
              <span className="text-xs text-slate-600 block font-bold">Priority</span>
              <span className="font-black text-red-600 text-base">Critical</span>
            </div>
          </div>

          <button className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer">
            Back to Home
          </button>
        </div>
      </PhoneMockup>

      {/* Phone 3: Select Blood Group matching Page 3 Right */}
      <PhoneMockup isLightPhone title="Screen 3: Select Blood Group">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
            <span className="text-slate-600 font-bold cursor-pointer">‹</span>
            <h3 className="text-sm font-bold text-slate-900">Request Blood</h3>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGroup(g as any)}
                className={`h-14 rounded-xl font-black text-sm border-2 cursor-pointer ${
                  selectedGroup === g
                    ? 'bg-red-600 text-white border-red-600 shadow'
                    : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <button className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow mt-6 cursor-pointer">
            Continue →
          </button>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 5 */
  const renderPage5 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Light Mode Phone (Page 5 Left) */}
      <PhoneMockup isLightPhone title="Light Mode (Page 5 Left)">
        <div className="space-y-4 text-left">
          {/* User header */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&q=80"
                alt="Alex"
                className="w-9 h-9 rounded-full object-cover"
              />
              <div>
                <span className="text-xs text-slate-600 block font-semibold">Good Morning 👋</span>
                <h4 className="font-bold text-xs text-slate-900">Alex Johnson</h4>
              </div>
            </div>
            <Bell className="w-4 h-4 text-slate-700" />
          </div>

          {/* Big Red EMERGENCY REQUEST */}
          <div className="p-3.5 rounded-2xl bg-rose-600 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base">📢</span>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-200 block">BROADCAST</span>
                <span className="text-xs font-black">EMERGENCY REQUEST</span>
                <span className="text-[10px] text-rose-100 block">Broadcast urgent need nearby</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>

          {/* Eligible to Donate */}
          <div className="p-3 rounded-xl bg-white border border-slate-300 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                Eligible to Donate <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600 text-white" />
              </span>
              <span className="text-xs text-slate-600 font-medium">Last donation: 3 months ago</span>
            </div>
            <span className="font-mono text-xs font-black text-slate-900">12 : 09 : 25</span>
          </div>

          {/* 4 Quick Actions */}
          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="p-2 rounded-xl bg-white border border-slate-300">
              <span className="text-base block">🩸</span>
              <span className="font-bold text-slate-900">Request</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-300">
              <span className="text-base block">🤝</span>
              <span className="font-bold text-slate-900">Donor</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-300">
              <span className="text-base block">🏥</span>
              <span className="font-bold text-slate-900">Hospital</span>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-300">
              <span className="text-base block">⭐</span>
              <span className="font-bold text-slate-900">Events</span>
            </div>
          </div>

          {/* Active Requests */}
          <div className="p-3 rounded-2xl bg-white border border-slate-300 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center">
                A+
              </div>
              <div>
                <h5 className="font-bold text-xs text-slate-900">St. Mary's Hospital</h5>
                <span className="text-xs text-slate-600">1.2 km away</span>
              </div>
            </div>
            <button className="px-3 py-1 bg-rose-600 text-white font-bold text-[10px] rounded-lg cursor-pointer">
              Donate Now
            </button>
          </div>
        </div>
      </PhoneMockup>

      {/* Dark Mode Phone (Page 5 Right) */}
      <PhoneMockup title="Dark Mode (Page 5 Right)">
        <div className="space-y-4 text-left">
          {/* User header */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=64&q=80"
                alt="Alex"
                className="w-9 h-9 rounded-full object-cover"
              />
              <div>
                <span className="text-xs text-slate-300 block font-semibold">Good Morning 👋</span>
                <h4 className="font-bold text-xs text-white">Alex Johnson</h4>
              </div>
            </div>
            <Bell className="w-4 h-4 text-slate-300" />
          </div>

          {/* Big Red EMERGENCY REQUEST */}
          <div className="p-3.5 rounded-2xl bg-rose-600 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base">📢</span>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-200 block">BROADCAST</span>
                <span className="text-xs font-black">EMERGENCY REQUEST</span>
                <span className="text-[10px] text-rose-100 block">Broadcast urgent need nearby</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white" />
          </div>

          {/* Eligible to Donate */}
          <div className="p-3 rounded-xl bg-[#1e293b] border border-slate-700 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs font-bold text-white flex items-center gap-1">
                Eligible to Donate <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 text-slate-900" />
              </span>
              <span className="text-xs text-slate-300">Last donation: 3 months ago</span>
            </div>
            <span className="font-mono text-xs font-black text-white">12 : 09 : 25</span>
          </div>

          {/* 4 Quick Actions */}
          <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="p-2 rounded-xl bg-[#1e293b] border border-slate-700">
              <span className="text-base block">🩸</span>
              <span className="font-bold text-slate-200">Request</span>
            </div>
            <div className="p-2 rounded-xl bg-[#1e293b] border border-slate-700">
              <span className="text-base block">🤝</span>
              <span className="font-bold text-slate-200">Donor</span>
            </div>
            <div className="p-2 rounded-xl bg-[#1e293b] border border-slate-700">
              <span className="text-base block">🏥</span>
              <span className="font-bold text-slate-200">Hospital</span>
            </div>
            <div className="p-2 rounded-xl bg-[#1e293b] border border-slate-700">
              <span className="text-base block">⭐</span>
              <span className="font-bold text-slate-200">Events</span>
            </div>
          </div>

          {/* Active Requests */}
          <div className="p-3 rounded-2xl bg-[#1e293b] border border-slate-700 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center">
                A+
              </div>
              <div>
                <h5 className="font-bold text-xs text-white">St. Mary's Hospital</h5>
                <span className="text-xs text-slate-300">1.2 km away</span>
              </div>
            </div>
            <button className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg cursor-pointer">
              Donate Now
            </button>
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 6 */
  const renderPage6 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: Badges List matching Page 6 Left */}
      <PhoneMockup isLightPhone title="Screen 1: My Badges List">
        <div className="space-y-4 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
            <span className="text-base font-bold text-slate-600 cursor-pointer">‹</span>
            <h3 className="text-base font-bold text-slate-900">My Badges</h3>
          </div>

          {/* 3 Tabs */}
          <div className="flex gap-2 text-xs font-bold text-slate-600 border-b border-slate-300 pb-2">
            <span className="text-slate-900 border-b-2 border-rose-600 pb-1">All Badges</span>
            <span className="cursor-pointer hover:text-slate-900">Earned Badges</span>
            <span className="cursor-pointer hover:text-slate-900">Locked Badges</span>
          </div>

          {/* Silver Badges */}
          <div>
            <span className="text-[10px] font-black uppercase text-slate-600 block mb-2 tracking-wide">SILVER BADGE</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center">
                <span className="text-2xl">🎖️</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 1</span>
                <span className="text-[9px] text-emerald-600 font-bold">✓ Unlocked</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center">
                <span className="text-2xl">🎖️</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 2</span>
                <span className="text-[9px] text-emerald-600 font-bold">✓ Unlocked</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center">
                <span className="text-2xl">🎖️</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 3</span>
                <span className="text-[9px] text-emerald-600 font-bold">✓ Unlocked</span>
              </div>
            </div>
          </div>

          {/* Gold Badges */}
          <div>
            <span className="text-[10px] font-black uppercase text-amber-600 block mb-2 tracking-wide">GOLD BADGE</span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center">
                <span className="text-2xl">🥇</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 1</span>
                <span className="text-[9px] text-emerald-600 font-bold">✓ Unlocked</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center">
                <span className="text-2xl">🥇</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 2</span>
                <span className="text-[9px] text-emerald-600 font-bold">✓ Unlocked</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 shadow-sm flex flex-col items-center opacity-60">
                <span className="text-2xl">🔒</span>
                <span className="text-[10px] font-bold text-slate-900 mt-1">Level 3</span>
                <span className="text-[9px] text-slate-500 font-semibold">Locked</span>
              </div>
            </div>
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 2: Badge Detail View with Star Ribbon Medal (Page 6 Right) */}
      <PhoneMockup isLightPhone title="Screen 2: Ribbon Medal Detail">
        <div className="space-y-4 text-center">
          <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-200">
            <span className="text-slate-600 font-bold cursor-pointer">‹</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px]">
              Unlocked ✓
            </span>
            <span className="text-slate-600 font-bold cursor-pointer">✕</span>
          </div>

          <div className="pt-2">
            <h3 className="text-base font-black text-slate-900 uppercase">SILVER BADGE</h3>
            <span className="text-xs text-slate-600 font-bold">Level 1</span>
          </div>

          {/* Huge Golden Star Ribbon Medal matching Page 6 */}
          <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 flex items-center justify-center shadow-xl ring-8 ring-amber-100">
            <span className="text-5xl">⭐</span>
          </div>

          {/* Requirements Box matching Page 6 bullet points */}
          <div className="p-4 rounded-2xl bg-slate-100 border border-slate-300 text-left space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-700 block tracking-wider">
              REQUIREMENTS
            </span>
            <ul className="text-xs text-slate-800 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-rose-600 font-bold">•</span>
                <span>Each donation must meet eligibility criteria (e.g., age, weight, health status).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-600 font-bold">•</span>
                <span>Donate blood at least three times within a year.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-600 font-bold">•</span>
                <span>Maintain verified status across all Bangladesh regional centers.</span>
              </li>
            </ul>
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 7 */
  const renderPage7 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: 7 Health Condition Switches matching Page 7 Bottom Left */}
      <PhoneMockup isLightPhone title="Screen 1: 7 Health Switches">
        <div className="space-y-3.5 text-left">
          <div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">CLINICAL ELIGIBILITY</span>
            <h4 className="font-bold text-sm text-slate-900 mt-0.5">Health Condition</h4>
            <p className="text-xs text-slate-600">
              Clinical safety parameters for recipient trust
            </p>
          </div>

          <div className="space-y-2 pt-1">
            {[
              { key: 'nonAlcoholic' as const, label: 'Non-alcoholic (মদ্যপানমুক্ত)' },
              { key: 'hivNegative' as const, label: 'HIV negative (এইচআইভি নেগেটিভ)' },
              { key: 'rheumaticFever' as const, label: 'Rheumatic fever negative (বাতজ্বর মুক্ত)' },
              { key: 'covidNegative' as const, label: 'COVID negative (কোভিড নেগেটিভ)' },
              { key: 'thalassemiaNegative' as const, label: 'Thalassemia negative (থ্যালাসেমিয়া মুক্ত)' },
              { key: 'hepatitisNegative' as const, label: 'Hepatitis negative (হেপাটাইটিস নেগেটিভ)' },
              { key: 'normalBP' as const, label: 'Not having low blood-pressure (স্বাভাবিক রক্তচাপ)' },
            ].map((item) => {
              const isChecked = healthSwitches[item.key];
              return (
                <div
                  key={item.key}
                  onClick={() => toggleHealth(item.key)}
                  className="p-2.5 rounded-xl bg-white border border-slate-300 flex items-center justify-between cursor-pointer shadow-xs hover:border-slate-400"
                >
                  <span className="text-xs font-semibold text-slate-900">{item.label}</span>
                  <div
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      isChecked ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform shadow ${
                        isChecked ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 2: Donor Responds to Request matching Page 7 Top */}
      <PhoneMockup title="Screen 2: Donor Responds">
        <div className="space-y-4 text-left">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400 block pb-1 border-b border-slate-800">
            ● DONOR RESPONDS TO REQUEST
          </span>

          {/* Patient details card */}
          <div className="p-4 rounded-2xl bg-[#1e293b] border border-slate-700 space-y-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-600 text-white font-black text-lg flex items-center justify-center">
                A+
              </div>
              <div>
                <h4 className="font-bold text-xs text-white">Emergency for Delivery Patient</h4>
                <span className="text-xs text-slate-300">Dhaka Medical College Hospital</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0f172a] border border-slate-800 text-xs font-mono flex items-center justify-between">
              <span className="text-slate-300">Masked Phone:</span>
              <span className="font-bold text-rose-400">01674333969</span>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow cursor-pointer">
                Confirm Request
              </button>
              <button className="px-3 py-2.5 bg-slate-800 text-slate-200 font-bold text-xs rounded-xl cursor-pointer">
                Cancel
              </button>
            </div>
          </div>

          {/* Thank you box */}
          <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-center space-y-1">
            <span className="text-2xl block">🎉</span>
            <h5 className="font-bold text-xs text-emerald-400">Thank You!</h5>
            <p className="text-xs text-slate-200">
              Your life-saving response has been sent to the patient's family.
            </p>
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  /* Render Page 8, 10, 14 (Incident Command Center) */
  const renderPage8 = () => (
    <div className="w-full max-w-4xl mx-auto py-2 text-left space-y-4">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-red-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg">
            🚨
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-200 block">
              INCIDENT COMMAND CENTER · PAGE 8 & 14
            </span>
            <h3 className="text-base font-black">
              Evacuation Alert / Blood Disaster Alert
            </h3>
            <span className="text-xs text-red-100">
              Building A & surrounding areas · ID: INC-2025-0412 · Main Campus
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1 bg-white text-red-600 font-black text-xs rounded-full">
            Active Incident
          </span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-center">
          <span className="text-xs text-slate-600 dark:text-slate-300 block font-bold">People at Risk</span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">1,248</span>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-center">
          <span className="text-xs text-slate-600 dark:text-slate-300 block font-bold">Units Dispatched</span>
          <span className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">84</span>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-center">
          <span className="text-xs text-slate-600 dark:text-slate-300 block font-bold">Teams Deployed</span>
          <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">12</span>
        </div>
        <div className="p-4 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 text-center">
          <span className="text-xs text-slate-600 dark:text-slate-300 block font-bold">Shelters Open</span>
          <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">3</span>
        </div>
      </div>

      {/* Priority Overview and Response Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Priority Overview (Donut Chart)
          </h4>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full border-8 border-rose-500 border-t-amber-500 border-r-blue-500 flex items-center justify-center font-bold text-xs text-slate-900 dark:text-white">
              100%
            </div>
            <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span>High Priority: 45% (Critical Bleeding)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span>Medium Priority: 35% (Surgery Prep)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Standard Priority: 20% (Plasma reserve)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Incident Response Tasks
          </h4>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Building A Evacuation</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Team Alpha · ETA 8 mins</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold text-[10px]">
                In Progress
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Dispatch 20 O- Units to DMCH</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Team Bravo · ETA 15 mins</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                En Route
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* Render Page 18 */
  const renderPage18 = () => (
    <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-8 py-2">
      {/* Phone 1: Post A Request Form matching Page 18 Left */}
      <PhoneMockup isLightPhone title="Screen 1: Post A Request">
        <div className="space-y-3.5 text-left">
          <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
            <span className="text-base font-bold text-slate-600 cursor-pointer">‹</span>
            <h3 className="text-sm font-bold text-slate-900">Post A Request</h3>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-700 block mb-1">Select Patient Name</label>
            <div className="p-2.5 rounded-xl bg-white border border-slate-300 flex items-center gap-2 text-xs text-slate-900 font-semibold shadow-xs">
              <span>👤</span>
              <span>H. Roberts (Patient)</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-700 block mb-1">Select Blood Group</label>
            <div className="grid grid-cols-4 gap-1.5">
              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGroup(g as any)}
                  className={`py-2 rounded-xl font-bold text-xs border cursor-pointer ${
                    selectedGroup === g
                      ? 'bg-rose-600 text-white border-rose-600 shadow'
                      : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-700 mb-1">
              <span>Select Blood Unit</span>
              <span className="text-rose-600 font-black">2 Unit</span>
            </div>
            <input name="mockupBloodUnit" type="range" min="1" max="5" defaultValue="2" className="w-full accent-rose-600 cursor-pointer" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-700 block mb-1">Mobile Number</label>
            <input
              name="mockupMobileNumber"
              type="text"
              defaultValue="+88017XXXXXXXX"
              className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-700 block mb-1">Select A Location</label>
            <select name="mockupLocation" className="w-full p-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900">
              <option>Dhaka Sadar / Shahbagh (DMCH)</option>
              <option>Chittagong Medical College</option>
              <option>Sylhet MAG Osmani Medical</option>
            </select>
          </div>

          <button
            type="button"
            className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer mt-2"
          >
            Send Request
          </button>
        </div>
      </PhoneMockup>

      {/* Phone 2: Inbox List matching Page 18 Center */}
      <PhoneMockup isLightPhone title="Screen 2: Inbox">
        <div className="space-y-3.5 text-left">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200">
            <span className="text-slate-600 font-bold cursor-pointer">‹</span>
            <h3 className="text-sm font-bold text-slate-900">Inbox</h3>
            <span className="p-1 rounded-full bg-rose-600 text-white text-[10px] cursor-pointer">✏️</span>
          </div>

          <div className="p-2 rounded-xl bg-slate-200 flex items-center gap-2 text-xs text-slate-700 border border-slate-300">
            <Search className="w-3.5 h-3.5" />
            <input name="mockupInboxSearch" type="text" placeholder="Search conversations..." className="bg-transparent focus:outline-none flex-1 text-slate-900 text-xs" />
          </div>

          <div className="space-y-2">
            {[
              { name: 'Benjamin Jack', text: 'Audio note: I am coming to DMCH ward 4', unread: 2 },
              { name: 'Michel Lucas', text: 'Confirmed 1 unit O+ ready', unread: 1 },
              { name: 'Liam Elijah', text: 'Hospital receptionist confirmed arrival', unread: 1 },
              { name: 'Daniel Henry', text: 'Thank you for your response', unread: 0 },
              { name: 'Archer Noah', text: 'Blood bank coordinator contacted', unread: 0 },
              { name: 'Oliver James', text: 'Emergency SOS acknowledged', unread: 0 },
            ].map((item, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-white border border-slate-300 flex items-center justify-between shadow-xs hover:border-slate-400 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-black flex items-center justify-center text-xs">
                    {item.name[0]}
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">{item.name}</h5>
                    <span className="text-[10px] text-slate-600 font-medium truncate block max-w-[130px]">{item.text}</span>
                  </div>
                </div>
                {item.unread > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-bold text-[9px] flex items-center justify-center">
                    {item.unread}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </PhoneMockup>

      {/* Phone 3: Active Chat with Audio Waveform matching Page 18 Right */}
      <PhoneMockup isLightPhone title="Screen 3: Benjamin Jack Chat">
        <div className="space-y-3 text-left h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-600 font-bold cursor-pointer">‹</span>
              <div className="text-center">
                <h4 className="font-bold text-xs text-slate-900">Benjamin Jack</h4>
                <span className="text-[10px] text-emerald-700 font-black block">● Online</span>
              </div>
              <span className="text-slate-600 font-bold cursor-pointer">...</span>
            </div>

            <div className="text-center my-2">
              <span className="text-[9px] text-slate-600 font-bold uppercase tracking-wider bg-slate-200 px-2 py-0.5 rounded-full">Today</span>
            </div>

            <div className="space-y-2.5">
              {/* Bubble 1 */}
              <div className="p-2.5 rounded-2xl bg-rose-600 text-white text-[11px] rounded-br-none max-w-[85%] ml-auto shadow-sm">
                I am on my way to DMCH Ward 4. Ready to donate.
                <span className="text-[9px] text-rose-100 block text-right mt-1 font-mono">9:31 ✓✓</span>
              </div>

              {/* Bubble 2 */}
              <div className="p-2.5 rounded-2xl bg-slate-200 text-slate-900 text-[11px] rounded-bl-none max-w-[85%] shadow-sm">
                Thank you so much! Please call the patient relative directly.
                <span className="text-[9px] text-slate-600 block text-right mt-1 font-mono">9:31</span>
              </div>

              {/* Pink Audio Waveform Message matching Page 18 */}
              <div className="p-2.5 rounded-2xl bg-rose-600 text-white flex items-center gap-2 max-w-[85%] ml-auto shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="w-7 h-7 rounded-full bg-white text-rose-600 flex items-center justify-center cursor-pointer shadow-sm shrink-0"
                >
                  {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-0.5 h-4">
                    {[4, 8, 14, 10, 18, 12, 16, 20, 14, 8, 16, 12, 6, 10, 14, 8, 4].map((h, i) => (
                      <div
                        key={i}
                        className={`w-0.5 rounded-full ${isPlayingAudio ? 'bg-white animate-pulse' : 'bg-rose-200'}`}
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-rose-100 font-mono block text-right">09:31 ✓✓</span>
                </div>
              </div>

              {/* Grey Audio Waveform Message matching Page 18 */}
              <div className="p-2.5 rounded-2xl bg-slate-200 text-slate-900 flex items-center gap-2 max-w-[85%] shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center cursor-pointer shadow-sm shrink-0"
                >
                  <Play className="w-3.5 h-3.5 ml-0.5" />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-0.5 h-4">
                    {[4, 8, 14, 10, 18, 12, 16, 20, 14, 8, 16, 12, 6, 10, 14, 8, 4].map((h, i) => (
                      <div
                        key={i}
                        className="w-0.5 rounded-full bg-slate-600"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono block text-right">09:31</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Chat Input */}
          <div className="p-2 rounded-2xl bg-white border border-slate-300 flex items-center gap-2 shadow-sm">
            <input
              name="mockupChatMessage"
              type="text"
              placeholder="Type A Message..."
              className="flex-1 text-xs text-slate-900 focus:outline-none"
            />
            <Mic className="w-4 h-4 text-rose-600 cursor-pointer" />
            <button className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center cursor-pointer">
              <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </PhoneMockup>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Showcase Navigation Bar */}
      <div className="bg-white dark:bg-[#161c28] border border-slate-300 dark:border-slate-800 rounded-2xl p-4 shadow-sm text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black uppercase tracking-wider">
                PDF Match Showcase
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {lang === 'bn' ? 'পিডিএফ স্ক্রিন অনুযায়ী মোবাইল ভিউ' : 'Exact PDF Screen Presentation Showcase'}
              </h2>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
              {lang === 'bn'
                ? 'আপনার দেওয়া PDF-এর প্রতিটি স্লাইডের হুবহু মোবাইল স্ক্রিন নিচে সুন্দরভাবে সাজানো রয়েছে।'
                : 'Directly view the authentic multi-phone side-by-side screens from your reference document.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                activePage === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                  : 'bg-slate-100 dark:bg-[#1f2736] text-slate-700 dark:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'সব স্লাইড একসাথে দেখুন' : 'View All Slides'}</span>
            </button>
          </div>
        </div>

        {/* Page Switcher Pills matching the PDF Pages */}
        <div className="pt-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: '📱 All Slides (Presentation Deck)' },
            { id: 'page1', label: '📄 Page 1: Dashboard & Events Trio' },
            { id: 'page2', label: '📄 Page 2: Blood Help & Match Trio' },
            { id: 'page3', label: '📄 Page 3: Request & Sent Trio' },
            { id: 'page5', label: '📄 Page 5: Light & Dark Mode Duo' },
            { id: 'page6', label: '📄 Page 6: My Badges & Medal Duo' },
            { id: 'page7', label: '📄 Page 7: Clinical Profile & Request' },
            { id: 'page8', label: '📄 Page 8 & 14: Incident Command' },
            { id: 'page18', label: '📄 Page 18: Post Request & Audio Chat' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id as any)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activePage === item.id
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-100 dark:bg-[#1f2736] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* ALL SLIDES VIEW MODE (Presentation Deck) */}
      {activePage === 'all' && (
        <div className="space-y-12">
          {/* Section 1 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 1 · Blood Request, Inventory Dashboard & Donor Events
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 1 (3 Screens)</span>
            </div>
            {renderPage1()}
          </div>

          {/* Section 2 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 2 · Blood Help Onboarding & Urgent Near You Feed
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 2 (3 Screens)</span>
            </div>
            {renderPage2()}
          </div>

          {/* Section 3 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 3 · Set Urgency, Request Sent Checkmark & Blood Type Selector
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 3 (3 Screens)</span>
            </div>
            {renderPage3()}
          </div>

          {/* Section 4 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 4 · Side-by-Side Dual Light & Dark Mode Comparison
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 5 (2 Screens)</span>
            </div>
            {renderPage5()}
          </div>

          {/* Section 5 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 5 · My Badges List & Golden Star Ribbon Medal Detail
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 6 & 12 (2 Screens)</span>
            </div>
            {renderPage6()}
          </div>

          {/* Section 6 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 6 · Clinical Health Screening (7 Switches) & Donor Responds Modal
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 7 (2 Screens)</span>
            </div>
            {renderPage7()}
          </div>

          {/* Section 7 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 7 · Emergency Incident Command Center (Evacuation Alert INC-2025-0412)
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 8, 10, 14</span>
            </div>
            {renderPage8()}
          </div>

          {/* Section 8 */}
          <div className="bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-800 rounded-3xl p-5 shadow-sm text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <span className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                PDF Slide 8 · Post A Request, Inbox & Benjamin Jack Audio Waveform Chat
              </span>
              <span className="text-xs text-slate-500 font-mono">Page 18 (3 Screens)</span>
            </div>
            {renderPage18()}
          </div>
        </div>
      )}

      {/* SINGLE SLIDE FOCUSED VIEW MODES */}
      {activePage === 'page1' && renderPage1()}
      {activePage === 'page2' && renderPage2()}
      {activePage === 'page3' && renderPage3()}
      {activePage === 'page5' && renderPage5()}
      {activePage === 'page6' && renderPage6()}
      {activePage === 'page7' && renderPage7()}
      {activePage === 'page8' && renderPage8()}
      {activePage === 'page18' && renderPage18()}
    </div>
  );
};
