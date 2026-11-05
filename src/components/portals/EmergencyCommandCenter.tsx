import React, { useState } from 'react';
import { COMMAND_CENTER_INCIDENTS } from '../../data/mockEnterpriseData';
import { IncidentItem, Language } from '../../types';
import { 
  Flame, 
  AlertTriangle, 
  Users, 
  Radio, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  PhoneCall, 
  Send, 
  Layers,
  Activity,
  ShieldAlert,
  Building,
  Bell,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Check,
  ExternalLink,
  Map,
  Compass,
  Eye
} from 'lucide-react';

interface EmergencyCommandCenterProps {
  lang: Language;
}

export const EmergencyCommandCenter: React.FC<EmergencyCommandCenterProps> = ({ lang }) => {
  const [incidents, setIncidents] = useState<IncidentItem[]>(COMMAND_CENTER_INCIDENTS);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem>(COMMAND_CENTER_INCIDENTS[0]);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [commandViewMode, setCommandViewMode] = useState<'STANDARD' | 'DARK_MAPBOX'>('STANDARD');

  // Response tasks state matching Page 8 & 14
  const [tasks, setTasks] = useState([
    {
      id: 'task-1',
      title: 'Emergency Blood Transfer & Evacuation Alert',
      assignee: 'Sarah Johnson',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&q=80',
      due: '09:45 AM',
      status: 'In progress',
      color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'task-2',
      title: 'Medical Support & Red Cell Cross-Match',
      assignee: 'Dr. Michael Chen',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80',
      due: '10:00 AM',
      status: 'Pending',
      color: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    },
    {
      id: 'task-3',
      title: 'Transfusion Facilities & Cold Chain Check',
      assignee: 'Priya Sharma',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80',
      due: '10:15 AM',
      status: 'In progress',
      color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'task-4',
      title: 'Donor Staff & Volunteer Dispatch Accounted',
      assignee: 'Hafizur Rahman',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80',
      due: '10:30 AM',
      status: 'Pending',
      color: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    },
    {
      id: 'task-5',
      title: 'Emergency Blood Bank Reserve Release',
      assignee: 'Dr. Sharmin Akter',
      avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=80&q=80',
      due: '10:45 AM',
      status: 'Pending',
      color: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
    },
    {
      id: 'task-6',
      title: 'National Priority SMS Broadcast Sent',
      assignee: 'System Engine',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80',
      due: '11:00 AM',
      status: 'Completed',
      color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
  ]);

  const handleDispatch = (incId: string) => {
    setDispatchStatus(`Dispatched Emergency Unit to ${selectedIncident.hospital}`);
    setIncidents((prev) =>
      prev.map((inc) => (inc.id === incId ? { ...inc, status: 'In Progress' } : inc))
    );
    setTimeout(() => setDispatchStatus(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Red Command Bar matching Page 8 & 14 */}
      <div className="w-full rounded-2xl bg-gradient-to-r from-red-700 via-rose-700 to-red-800 text-white p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-black/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight">
                Emergency Command (জরুরি দুর্যোগ ও রক্ত সমন্বয় কেন্দ্র)
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Active Incident</span>
              </span>
            </div>
            <p className="text-xs text-rose-100 mt-0.5">
              National Blood Disaster Response · Hospital Emergency Dispatch Grid
            </p>
          </div>
        </div>

        {/* View Mode Switcher: Page 8 Standard vs Page 10 Dark Mapbox */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={() => setCommandViewMode(commandViewMode === 'STANDARD' ? 'DARK_MAPBOX' : 'STANDARD')}
            className="px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/20 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{commandViewMode === 'STANDARD' ? 'High-Tech Dark Map (Page 10)' : 'Command Overview (Page 8)'}</span>
          </button>
        </div>
      </div>

      {dispatchStatus && (
        <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{dispatchStatus}</span>
        </div>
      )}

      {/* VIEW MODE 1: PAGE 8 & 14 RED ALERT COMMAND DASHBOARD */}
      {commandViewMode === 'STANDARD' ? (
        <div className="space-y-6">
          {/* Top Incident Banner Card matching Page 8 Center */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Bell className="w-5 h-5 text-white animate-bounce" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-200 block">
                    EVACUATION & MASS CASUALTY BLOOD DISASTER ALERT
                  </span>
                  <h2 className="text-lg sm:text-xl font-black">
                    Building A & Surrounding Areas · Dhaka Medical College & Hospital Zone
                  </h2>
                  <span className="text-xs text-rose-100 font-mono">Issued: Today, 09:32 AM</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => handleDispatch(selectedIncident.id)}
                  className="px-4 py-2 rounded-xl bg-white text-red-600 hover:bg-rose-50 font-black text-xs shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  Dispatch Squad Now
                </button>
              </div>
            </div>

            {/* 4 KPI tiles matching Page 8 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-white">
              <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
                <span className="text-[10px] text-rose-200 uppercase font-semibold block">Incident ID</span>
                <span className="text-base sm:text-lg font-mono font-black">INC-2025-0412</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">Location: Main Campus</span>
              </div>
              <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
                <span className="text-[10px] text-rose-200 uppercase font-semibold block">People at Risk</span>
                <span className="text-base sm:text-lg font-mono font-black">1,248</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">Start: Today 09:15 AM</span>
              </div>
              <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
                <span className="text-[10px] text-rose-200 uppercase font-semibold block">Teams Deployed</span>
                <span className="text-base sm:text-lg font-mono font-black text-amber-300">24 Teams</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">3 Shelters Open</span>
              </div>
              <div className="p-3 rounded-2xl bg-black/20 border border-white/10">
                <span className="text-[10px] text-rose-200 uppercase font-semibold block">Last Update</span>
                <span className="text-base sm:text-lg font-mono font-black text-emerald-300">2 min ago</span>
                <span className="text-[10px] text-rose-200 block mt-0.5">Live Sync Active</span>
              </div>
            </div>
          </div>

          {/* Center 2-Column Grid: Priority Donut + Response Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Priority Donut (Page 8) */}
            <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Priority Overview (জরুরিতা পরিসংখ্যান)
                </h3>
                <span className="text-xs font-mono font-bold text-slate-500">47 Total Tasks</span>
              </div>

              {/* Donut Chart Visualization matching Page 8 */}
              <div className="flex items-center justify-center py-3">
                <div className="relative w-40 h-40 rounded-full flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    {/* Ring segments for Critical (32%), High (26%), Medium (21%), Resolved (21%) */}
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#dc2626" strokeWidth="5" strokeDasharray="32, 100" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f59e0b" strokeWidth="5" strokeDasharray="26, 100" strokeDashoffset="-32" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#3b82f6" strokeWidth="5" strokeDasharray="21, 100" strokeDashoffset="-58" />
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="5" strokeDasharray="21, 100" strokeDashoffset="-79" />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">47</span>
                    <span className="text-[10px] text-slate-400 block -mt-1 uppercase font-semibold">Total tasks</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs pt-1">
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    <span>Critical</span>
                  </span>
                  <span className="font-mono font-bold">15 (32%)</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>High</span>
                  </span>
                  <span className="font-mono font-bold">12 (26%)</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span>Medium</span>
                  </span>
                  <span className="font-mono font-bold">10 (21%)</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Resolved</span>
                  </span>
                  <span className="font-mono font-bold">10 (21%)</span>
                </div>
              </div>
            </div>

            {/* Right 2 Columns: Response Tasks Table matching Page 8 */}
            <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Response Tasks (কার্যক্রম তালিকা)
                </h3>
                <span className="text-xs font-mono font-bold text-rose-600">
                  12 open tasks
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                      <th className="py-2.5">Task</th>
                      <th className="py-2.5">Assignee</th>
                      <th className="py-2.5">Due</th>
                      <th className="py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                        <td className="py-3 pr-2 text-slate-900 dark:text-white font-bold">
                          {task.title}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={task.avatar}
                              alt={task.assignee}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                            <span className="text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {task.assignee}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2 font-mono text-slate-500 whitespace-nowrap">
                          {task.due}
                        </td>
                        <td className="py-3 pl-2">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${task.color}`}>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom 4 KPI Cards matching Page 8 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block">
                  Alerts Sent
                </span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">3</span>
                <span className="text-[10px] text-slate-500 block">Last 24h</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block">
                  People Accounted
                </span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">1,102</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">88% of total</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block">
                  Active Incidents
                </span>
                <span className="text-2xl font-black font-mono text-red-600">2</span>
                <span className="text-[10px] text-slate-500 block">Across locations</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block">
                  Resources Deployed
                </span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">18</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">On standby</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: HIGH-TECH DARK MAPBOX DISPATCH DESK (Page 10) */
        <div className="rounded-3xl bg-[#070b14] border border-cyan-900/40 p-5 shadow-2xl text-white space-y-4 font-mono">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-900/40 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-cyan-400 font-black text-sm">ECC · DISPATCH GRID ALL MODES</span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
                27 INCIDENTS SHOWN
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>Active Calls: <strong className="text-cyan-300">24</strong></span>
              <span>Critical: <strong className="text-red-400">1</strong></span>
              <span>Operator Load: <strong className="text-emerald-400">4%</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Incident Queue */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedIncident.id === inc.id
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-cyan-400">{inc.id}</span>
                    <span className="text-[10px] text-red-400 font-bold">{inc.urgency}</span>
                  </div>
                  <div className="font-sans font-bold text-white mt-1 text-xs truncate">
                    {inc.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {inc.hospital} · {inc.units} units ({inc.bloodGroup})
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Dark Map Canvas (Page 10 center) */}
            <div className="lg:col-span-2 h-[500px] rounded-2xl bg-[#03060c] border border-cyan-900/50 relative overflow-hidden p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Map Layer: Bangladesh Emergency Medical Hotspots</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px]">
                  Realtime Telemetry Active
                </span>
              </div>

              {/* Graphical radar markers */}
              <div className="relative w-full h-80 my-auto flex items-center justify-center">
                {/* Simulated grid lines */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

                {/* Markers */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 flex flex-col items-center animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-red-600/30 border-2 border-red-500 flex items-center justify-center text-white text-[9px] font-bold">
                    O-
                  </div>
                  <span className="text-[9px] bg-black/80 px-1.5 py-0.5 rounded text-red-300 mt-1">
                    DMCH (2 Units)
                  </span>
                </div>

                <div className="absolute bottom-1/3 right-1/4 flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full bg-cyan-600/30 border-2 border-cyan-400 flex items-center justify-center text-cyan-200 text-[8px] font-bold">
                    B-
                  </div>
                  <span className="text-[9px] bg-black/80 px-1.5 py-0.5 rounded text-cyan-300 mt-1">
                    CMCH (3 Units)
                  </span>
                </div>

                <div className="absolute top-1/3 left-1/3 flex flex-col items-center">
                  <div className="w-5 h-5 rounded-full bg-amber-600/30 border-2 border-amber-400 flex items-center justify-center text-amber-200 text-[8px] font-bold">
                    A+
                  </div>
                  <span className="text-[9px] bg-black/80 px-1.5 py-0.5 rounded text-amber-300 mt-1">
                    Rajshahi Medical
                  </span>
                </div>
              </div>

              {/* Bottom control bar */}
              <div className="flex justify-between items-center pt-2 border-t border-cyan-900/30 text-xs">
                <span className="text-slate-400">Selected: {selectedIncident.hospital}</span>
                <button
                  onClick={() => handleDispatch(selectedIncident.id)}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs cursor-pointer shadow"
                >
                  Confirm Rapid Dispatch →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
