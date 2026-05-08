'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  Activity, Zap, Brain, Globe, Settings, 
  ChevronRight, LayoutDashboard, Database, 
  ShieldCheck, BarChart3
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Intelligence', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Wallet Tracker', href: '/dashboard/wallets', icon: Globe },
  { label: 'Memecoin Hunt', href: '/dashboard/memecoins', icon: Zap },
  { label: 'Deep Scanner', href: '/dashboard/scanner', icon: Brain },
  { label: 'Signal History', href: '/dashboard/history', icon: BarChart3 },
];

const SECONDARY_ITEMS = [
  { label: 'Security Node', icon: ShieldCheck, status: 'Online' },
  { label: 'RAG Database', icon: Database, status: 'Active' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 h-screen bg-[#0a0a0a] border-r border-white/5 flex flex-col relative z-50">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
          <span className="text-sm font-black text-black">C</span>
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-white">CELSOR</h1>
          <p className="text-[10px] text-orange-500/70 font-mono font-bold tracking-widest leading-none">NEXUS v1.0</p>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 space-y-1 mt-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-bold px-3 mb-4">Core Intelligence</div>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl group transition-all duration-300 ${
                isActive ? 'bg-orange-500/10 text-orange-400' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-4 h-4 transition-colors ${isActive ? 'text-orange-500' : 'group-hover:text-white'}`} />
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
              </div>
              {isActive && (
                <motion.div layoutId="active-pill" className="w-1 h-4 bg-orange-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      <div className="p-4 mt-auto border-t border-white/5 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-bold px-3 mb-2">System Diagnostics</div>
        {SECONDARY_ITEMS.map((item, i) => {
          const Content = (
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${item.href ? 'hover:bg-white/5 hover:text-gray-200' : 'text-gray-500'}`}>
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4" />
                <span className="text-xs">{item.label}</span>
              </div>
              {item.status && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-green-500 font-bold uppercase">
                  <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                  {item.status}
                </span>
              )}
            </div>
          );

          return item.href ? (
            <Link key={i} href={item.href}>
              {Content}
            </Link>
          ) : (
            <div key={i}>{Content}</div>
          );
        })}
      </div>

      {/* User Session */}
      <div className="p-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-800 to-gray-600 border border-white/10" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-300">ADMIN_01</span>
            <span className="text-[10px] text-gray-600 font-mono">PRO_TIER</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-700" />
      </div>
    </div>
  );
}
