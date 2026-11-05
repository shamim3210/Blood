import React, { useState } from 'react';
import { BLOOD_BANK_INVENTORY } from '../../data/mockEnterpriseData';
import { BloodStockItem, BloodGroup, Language } from '../../types';
import { 
  Building2, 
  AlertTriangle, 
  TrendingUp, 
  Calendar, 
  Layers, 
  Plus, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  ShoppingCart,
  Receipt,
  Droplet,
  FileText,
  Search
} from 'lucide-react';

interface BloodBankPortalProps {
  lang: Language;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  itemsCount: number;
  totalBdt: string;
  status: 'Received' | 'Ordered' | 'Pending';
  orderDate: string;
  priority: 'High Priority' | 'Normal';
}

export const BloodBankPortal: React.FC<BloodBankPortalProps> = ({ lang }) => {
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'purchase_orders' | 'components'>('inventory');
  const [inventory, setInventory] = useState<BloodStockItem[]>(BLOOD_BANK_INVENTORY);
  const [selectedGroup, setSelectedGroup] = useState<BloodGroup | 'ALL'>('ALL');
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderUnits, setOrderUnits] = useState(10);
  const [orderGroup, setOrderGroup] = useState<BloodGroup>('O-');
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Purchase Orders matching Page 9
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([
    {
      id: 'po-1',
      orderNumber: 'PO-202603-00005',
      supplier: 'Sandhani Central Transfusion Center',
      itemsCount: 2,
      totalBdt: 'BDT 13,010.00',
      status: 'Received',
      orderDate: '3/11/2026',
      priority: 'High Priority',
    },
    {
      id: 'po-2',
      orderNumber: 'PO-202602-00004',
      supplier: 'Red Crescent National Blood Center',
      itemsCount: 1,
      totalBdt: 'BDT 990.00',
      status: 'Ordered',
      orderDate: '2/10/2026',
      priority: 'Normal',
    },
    {
      id: 'po-3',
      orderNumber: 'PO-202601-00003',
      supplier: 'Badhan Blood Transfusion Unit',
      itemsCount: 1,
      totalBdt: 'BDT 10.00',
      status: 'Ordered',
      orderDate: '1/31/2026',
      priority: 'High Priority',
    },
    {
      id: 'po-4',
      orderNumber: 'PO-202601-00002',
      supplier: 'Quantum Foundation Blood Lab',
      itemsCount: 1,
      totalBdt: 'BDT 10.02',
      status: 'Received',
      orderDate: '1/28/2026',
      priority: 'High Priority',
    },
    {
      id: 'po-5',
      orderNumber: 'PO-202601-00001',
      supplier: 'DMCH Transfusion Medicine Department',
      itemsCount: 1,
      totalBdt: 'BDT 100.00',
      status: 'Received',
      orderDate: '1/22/2026',
      priority: 'Normal',
    },
  ]);

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setInventory((prev) =>
      prev.map((item) =>
        item.bloodGroup === orderGroup
          ? { ...item, unitsInStock: item.unitsInStock + orderUnits }
          : item
      )
    );
    setOrderSuccess(true);
    setTimeout(() => {
      setOrderSuccess(false);
      setOrderModalOpen(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header & Sub-Tab Switcher */}
      <div className="glass-card-adaptive rounded-2xl p-5 sm:p-6 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/30">
                <Building2 className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Blood Bank Inventory & Stock Management (ব্লাড ব্যাংক রিজার্ভ)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              Real-time central blood stock, shortage warning thresholds, purchase orders, and unit expiry tracking
            </p>
          </div>

          <button
            onClick={() => setOrderModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Requisition / Restock</span>
          </button>
        </div>

        {/* 3 Sub-Tabs matching Page 15, Page 9, and Page 16 */}
        <div className="pt-4 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'inventory'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            📊 Inventory & Expiry Dashboard (Page 15)
          </button>
          <button
            onClick={() => setActiveSubTab('purchase_orders')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'purchase_orders'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            🧾 Purchase Orders & Supply (Page 9)
          </button>
          <button
            onClick={() => setActiveSubTab('components')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === 'components'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            🩸 Blood Components Cooldown (Page 16)
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: INVENTORY & EXPIRY DASHBOARD (Page 15) */}
      {activeSubTab === 'inventory' && (
        <div className="space-y-6 animate-in fade-in">
          {/* 6 Top KPI Metrics Cards matching Page 15 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl glass-card-adaptive">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Units in Stock
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">25.2K</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +14%
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">vs prev period</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-adaptive">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Diversity Coverage
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">87.5%</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +16.4%
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">all 8 blood groups</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-adaptive">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Avg. Shelf Life
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">35 d</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +25%
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">optimal storage</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-adaptive">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Collection Efficiency
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">92.5%</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +8.4%
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">voluntary drives</span>
            </div>

            <div className="p-3.5 rounded-2xl glass-card-adaptive">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Stock Turnover
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">65.2%</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" /> +11%
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">rapid utilization</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider block">
                Critical Shortage
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">12%</span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                  <ArrowDownRight className="w-3 h-3" /> -4%
                </span>
              </div>
              <span className="text-[10px] text-rose-500 block mt-0.5">O-, B-, AB- alerts</span>
            </div>
          </div>

          {/* Main Stock Comparison & Heatmap Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Blood Group Availability vs Required Reserve (Page 15) */}
            <div className="glass-card-adaptive rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    Blood Group Availability vs Required Reserve
                  </h3>
                  <p className="text-xs text-slate-500">
                    Units in stock vs safety buffer for emergency surgeries
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-rose-600" />
              </div>

              <div className="space-y-3 pt-1">
                {inventory.map((item) => {
                  const percent = Math.min(100, Math.round((item.unitsInStock / item.requiredUnits) * 100));
                  const isShortage = item.unitsInStock < item.requiredUnits;

                  return (
                    <div key={item.bloodGroup} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span className="w-6 font-mono">{item.bloodGroup}</span>
                          <span className="font-mono text-slate-400 text-[11px]">
                            {item.unitsInStock} / {item.requiredUnits} units
                          </span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isShortage
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.status} ({percent}%)
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isShortage ? 'bg-red-600' : 'bg-rose-600'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Blood Units Approaching Expiry Matrix (Page 15) */}
            <div className="glass-card-adaptive rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    Blood Units Approaching Expiry Matrix
                  </h3>
                  <p className="text-xs text-slate-500">
                    Red blood cell shelf-life preservation schedule
                  </p>
                </div>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 text-left font-bold">Group</th>
                      <th className="py-2 font-bold text-red-600">&lt;15 Days</th>
                      <th className="py-2 font-bold text-amber-600">15-30 Days</th>
                      <th className="py-2 font-bold text-emerald-600">30-45 Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {inventory.map((row) => (
                      <tr key={row.bloodGroup} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-2 text-left font-bold font-sans text-slate-900 dark:text-white">
                          {row.bloodGroup}
                        </td>
                        <td className="py-2">
                          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-bold">
                            {row.expiryUnder15Days}
                          </span>
                        </td>
                        <td className="py-2 text-amber-600 dark:text-amber-400">
                          {row.expiry15To30Days}
                        </td>
                        <td className="py-2 text-emerald-600 dark:text-emerald-400">
                          {row.expiry30To45Days}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                ⚠️ <strong>Auto-Dispatch Policy:</strong> Units under 15 days are prioritized for scheduled surgical procedures to ensure zero blood wastage.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PURCHASE ORDERS & INVOICING (Page 9) */}
      {activeSubTab === 'purchase_orders' && (
        <div className="space-y-5 animate-in fade-in">
          {/* 4 Summary Cards matching Page 9 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="glass-card-adaptive rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Orders</span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white block">5</span>
              </div>
            </div>

            <div className="glass-card-adaptive rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Pending Approval</span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white block">0</span>
              </div>
            </div>

            <div className="glass-card-adaptive rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Awaiting Delivery</span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white block">2</span>
              </div>
            </div>

            <div className="glass-card-adaptive rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                <span className="font-bold text-xs">BDT</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Pending Value</span>
                <span className="text-sm font-black font-mono text-emerald-600 block">BDT 1,000.00</span>
              </div>
            </div>
          </div>

          {/* Table matching Page 9 */}
          <div className="glass-card-adaptive rounded-3xl p-6 shadow-xl border border-slate-200/80 dark:border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Hospital Blood Purchase Orders (সরবরাহ ও ইনভয়েস)
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    name="orderSearch"
                    type="text"
                    placeholder="Search orders..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setOrderModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  + New Order
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-2">
                    <th className="py-2.5">ORDER #</th>
                    <th className="py-2.5">SUPPLIER</th>
                    <th className="py-2.5">ITEMS</th>
                    <th className="py-2.5">TOTAL</th>
                    <th className="py-2.5">STATUS</th>
                    <th className="py-2.5">ORDER DATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {po.orderNumber}
                        <span className="block text-[10px] text-slate-400 font-sans font-normal">
                          {po.priority}
                        </span>
                      </td>
                      <td className="py-3 text-slate-800 dark:text-slate-200">
                        {po.supplier}
                      </td>
                      <td className="py-3 font-mono">
                        {po.itemsCount} Items
                      </td>
                      <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">
                        {po.totalBdt}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            po.status === 'Received'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {po.status === 'Received' ? '✓ Received' : '⏱ Ordered'}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-500">
                        {po.orderDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: BLOOD COMPONENTS & COOLDOWN (Page 16) */}
      {activeSubTab === 'components' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="glass-card-adaptive rounded-3xl p-6 shadow-xl border border-slate-200/80 dark:border-slate-800/80 space-y-4">
            <div className="pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Transfusion Components Schedule
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Blood Component Separation & Donor Cooldown (রক্ত উপাদান পৃথকীকরণ)
              </h3>
            </div>

            {/* 4 Cards matching Page 16 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border-2 border-red-500/40 bg-red-500/5 text-center space-y-2">
                <span className="text-3xl font-black text-red-600 font-mono block">400 mL</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Whole Blood Donation (সম্পূর্ণ রক্ত)
                </span>
                <div className="py-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    Remaining Cooldown: <strong className="text-xl text-red-600 font-mono">13 Days</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Eligible from 2026/09/07
                </span>
              </div>

              <div className="p-5 rounded-2xl border-2 border-red-500/40 bg-red-500/5 text-center space-y-2">
                <span className="text-3xl font-black text-red-600 font-mono block">200 mL</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Pediatric Whole Blood (শিশু রোগীর রক্ত)
                </span>
                <div className="py-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    Remaining Cooldown: <strong className="text-xl text-red-600 font-mono">13 Days</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Eligible from 2026/09/07
                </span>
              </div>

              <div className="p-5 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 text-center space-y-2">
                <span className="text-3xl font-black text-amber-600 block">Plasma</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Fresh Frozen Plasma (FFP - রক্তরস)
                </span>
                <div className="py-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    Remaining Cooldown: <strong className="text-xl text-amber-600 font-mono">13 Days</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Eligible from 2026/09/07
                </span>
              </div>

              <div className="p-5 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 text-center space-y-2">
                <span className="text-3xl font-black text-amber-600 block">Platelets</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Platelet Apheresis (অণুচক্রিকা)
                </span>
                <div className="py-2">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    Remaining Cooldown: <strong className="text-xl text-amber-600 font-mono">13 Days</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block font-mono">
                  Eligible from 2026/09/07
                </span>
              </div>
            </div>

            <button
              onClick={() => setOrderModalOpen(true)}
              className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-xl shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
            >
              <span>Schedule Blood Donation Reservation →</span>
            </button>
          </div>
        </div>
      )}

      {/* Restock Requisition Modal */}
      {orderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl glass-card-adaptive p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800/80 transition-all space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-rose-600" />
                <span>Hospital Blood Requisition</span>
              </h3>
              <button
                onClick={() => setOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {orderSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Requisition Order Created!
                </h4>
                <p className="text-xs text-slate-500">
                  Stock units replenished and batch barcode generated.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Blood Group
                  </label>
                  <select
                    name="requisitionBloodGroup"
                    value={orderGroup}
                    onChange={(e) => setOrderGroup(e.target.value as BloodGroup)}
                    className="w-full h-11 px-3 text-sm font-bold rounded-xl bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {inventory.map((i) => (
                      <option key={i.bloodGroup} value={i.bloodGroup}>
                        {i.bloodGroup} (Current: {i.unitsInStock} bags)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Requisition Units (Bags)
                  </label>
                  <input
                    name="requisitionUnits"
                    type="number"
                    min="1"
                    max="50"
                    value={orderUnits}
                    onChange={(e) => setOrderUnits(Number(e.target.value))}
                    className="w-full h-11 px-3 text-sm font-mono rounded-xl bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Confirm Requisition Order
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
