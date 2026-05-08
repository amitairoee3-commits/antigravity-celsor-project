'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Bell, Zap, Database, Cpu, Wallet, Lock, Globe, Terminal, Save, Trash2, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'security' | 'intelligence'>('general');

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'intelligence', label: 'Intelligence', icon: BrainIcon },
    { id: 'api', label: 'API & Nodes', icon: Terminal },
    { id: 'security', label: 'Security', icon: Lock },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-orange-500/10 rounded-lg border border-orange-500/20">
          <Shield className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Configuration</h1>
          <p className="text-sm text-gray-500">Manage your CELSOR instance, API nodes, and intelligence parameters.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-10">
        {/* Navigation */}
        <div className="space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-8">
          {activeTab === 'general' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Localization & Display
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Institutional Dark Mode</div>
                      <div className="text-xs text-gray-500">OLED black interface with high-contrast accents.</div>
                    </div>
                    <div className="w-10 h-5 bg-orange-500 rounded-full relative">
                       <div className="absolute right-1 top-1 w-3 h-3 bg-black rounded-full" />
                    </div>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-600 uppercase">Default Currency</label>
                    <select className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500/50 outline-none">
                      <option>USD ($)</option>
                      <option>ETH (Ξ)</option>
                      <option>SOL (◎)</option>
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2 text-red-400">
                   Danger Zone
                </h3>
                <div className="bg-red-500/[0.02] border border-red-500/10 rounded-2xl p-6">
                  <button className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" /> Clear Local Intelligence Cache
                  </button>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'api' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-4 h-4" /> Data Ingestion Nodes
                </h3>
                <div className="space-y-3">
                  {[
                    { name: 'OpenAI API', status: 'Connected', delay: '24ms', icon: Cpu },
                    { name: 'DexScreener WebSocket', status: 'Active', delay: '12ms', icon: RefreshCw },
                    { name: 'Supabase Database', status: 'Healthy', delay: '8ms', icon: Database },
                    { name: 'GoPlus Security Node', status: 'Pending', delay: '—', icon: Shield },
                  ].map(node => (
                    <div key={node.name} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-lg">
                          <node.icon className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{node.name}</div>
                          <div className="text-[10px] text-gray-600 font-mono tracking-tighter uppercase">{node.status}</div>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-gray-500">{node.delay}</div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'intelligence' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
               <section className="space-y-4">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Conviction Scoring Engine
                </h3>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-6">
                  <div className="space-y-4">
                     <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">Minimum Conviction Threshold</span>
                        <span className="text-xs font-mono text-orange-500">65%</span>
                     </div>
                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 w-[65%]" />
                     </div>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">Rule-Based Fallback</div>
                      <div className="text-xs text-gray-500">Enable deterministic scoring when LLM limits reached.</div>
                    </div>
                    <div className="w-10 h-5 bg-orange-500 rounded-full relative">
                       <div className="absolute right-1 top-1 w-3 h-3 bg-black rounded-full" />
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-white/5 flex justify-end">
        <button className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-black text-sm font-black uppercase tracking-widest rounded-xl hover:bg-orange-400 transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)] active:scale-95">
          <Save className="w-4 h-4" /> Save Configuration
        </button>
      </div>
    </div>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z" />
    </svg>
  );
}
