'use client';

import Sidebar from '@/components/Sidebar';
import PageTransition from '@/components/PageTransition';
import { motion } from 'framer-motion';
import { Shield, Bell, Search, Activity } from 'lucide-react';
import Link from 'next/link';

import CoinSearchBar from '@/components/CoinSearchBar';
import LiveEngineLog from '@/components/LiveEngineLog';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#050505] text-gray-200 overflow-hidden font-sans selection:bg-orange-500/30">
      {/* Dynamic Scan Line Effect */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden opacity-20">
        <motion.div 
          initial={{ y: '-100%' }}
          animate={{ y: '200%' }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="w-full h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent blur-[1px]"
        />
      </div>

      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Global Institutional Header */}
        <header className="h-14 border-b border-white/5 bg-[#050505]/50 backdrop-blur-md flex items-center justify-between px-8 z-40 shrink-0">
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2">
               <Activity className="w-4 h-4 text-orange-500" />
               <span className="text-xs font-mono font-bold tracking-widest text-orange-500/80 uppercase">Active Intelligence Feed</span>
             </div>
             <div className="h-4 w-px bg-white/10" />
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Live Market Node: 0x82...FA2</span>
             </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-96">
              <CoinSearchBar />
            </div>
            <div className="h-8 w-px bg-white/5 mx-2" />
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Bell className="w-4 h-4 text-gray-500" />
              <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-orange-500 rounded-full border-2 border-[#050505]" />
            </button>
            <Link href="/dashboard/settings" className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-500">
              <Shield className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-white/10 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PageTransition>
              {children}
            </PageTransition>
          </div>
          <LiveEngineLog />
        </main>
      </div>
    </div>
  );
}
