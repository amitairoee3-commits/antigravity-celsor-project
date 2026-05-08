'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Lock, Zap, Shield, ArrowRight, Activity, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import Blackhole from '@/components/Blackhole';
import CoinSearchBar from '@/components/CoinSearchBar';

export default function LandingPage() {
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutText, setCheckoutText] = useState('Initializing Secure Session...');

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    
    // Simulate high-end institutional loading sequence
    setTimeout(() => setCheckoutText('ESTABLISHING SECURE TUNNEL...'), 800);
    setTimeout(() => setCheckoutText('INITIALIZING CRYPTOGRAPHIC NODES...'), 1600);
    setTimeout(() => setCheckoutText('INJECTING INSTITUTIONAL INTENT...'), 2400);

    try {
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 3500);
    } catch (e) {
      console.error(e);
      alert('Checkout failed. Make sure you are logged in.');
      setIsCheckingOut(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-orange-500/30 overflow-hidden relative">
      {/* Deep Space Atmosphere */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_40%,#0f0f0f_0%,#050505_100%)] z-0" />
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:64px_64px] z-0" />
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505] z-0 pointer-events-none" />


      {/* Institutional Session Initialization Overlay */}
      {isCheckingOut && (
        <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col items-center justify-center overflow-hidden">
          {/* Tactical Background Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
          <motion.div 
            initial={{ top: "-100%" }}
            animate={{ top: "100%" }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-[2px] bg-orange-500/20 shadow-[0_0_20px_#f97316] z-0"
          />

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 w-full max-w-md p-8 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-2xl"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-orange-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tighter uppercase">{checkoutText.split('...')[0]}</h3>
                <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Encryption Key: 0xCF...A92</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="relative h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3.5, ease: "easeInOut" }}
                  className="absolute inset-y-0 left-0 bg-orange-500 shadow-[0_0_15px_#f97316]"
                />
              </div>

              <div className="space-y-2">
                {[
                  "Establishing Secure Tunnel",
                  "Initializing Cryptographic Nodes",
                  "Injecting Institutional Intent"
                ].map((step, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.8 }}
                    className="flex items-center gap-3 text-[10px] font-mono tracking-tight"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_5px_#f97316]" />
                    <span className="text-gray-400 uppercase">{step}</span>
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.8 + 0.5 }}
                      className="ml-auto text-orange-500 font-bold"
                    >
                      VERIFIED
                    </motion.span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            className="mt-8 text-[9px] font-mono text-gray-500 tracking-[0.5em] uppercase"
          >
            Celsor Nexus Architecture Protocol v2.4.1
          </motion.div>
        </div>
      )}

      {/* Background Effects */}
      <div className="absolute inset-0 z-0 [mask-image:linear-gradient(to_bottom,black_60%,transparent_100%)]">
        <Blackhole />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
            <span className="text-xs font-black text-black">C</span>
          </div>
          <span className="font-bold text-lg tracking-tight">CELSOR</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-xs font-medium text-gray-400 hover:text-white transition-colors uppercase tracking-widest">Log in</Link>
          <Link href="/dashboard" className="text-xs font-bold text-black bg-white px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors uppercase tracking-tight">
            Open App
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 pt-24 pb-32">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.3, duration: 1 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[9px] font-black tracking-[0.3em] uppercase mb-6 shadow-[0_0_30px_rgba(249,115,22,0.1)]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_10px_#f97316]" />
                Institutional Intelligence Engine Online
              </motion.div>
              
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-8 leading-[0.95] text-white">
                <motion.span 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                  className="block text-orange-500 mb-2"
                >
                  CELSOR:
                </motion.span>
                <motion.span 
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.8 }}
                  className="block text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-gray-500"
                >
                  Engineering the Unfair Advantage.
                </motion.span>
              </h1>

              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 1.5 }}
                className="text-base md:text-lg text-gray-400 mb-10 max-w-xl leading-relaxed font-light"
              >
                Celsor builds high-frequency on-chain intelligence systems that isolate institutional intent. 
                <span className="text-white font-medium"> Predictive dominance for the top 1%.</span>
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 1.2, duration: 1 }}
                className="flex flex-wrap items-center gap-4"
              >
                <button onClick={handleCheckout} className="group relative px-8 py-4 bg-orange-500 hover:bg-orange-600 text-black font-black text-lg rounded-xl transition-all shadow-[0_0_40px_rgba(249,115,22,0.3)] hover:shadow-[0_0_60px_rgba(249,115,22,0.5)] hover:-translate-y-1 flex items-center gap-3 overflow-hidden">
                  <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12" />
                  INITIATE SESSION
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                </button>
                <a href="#features" className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold text-lg rounded-xl transition-all border border-white/10 hover:border-white/20 hover:-translate-y-1 backdrop-blur-md">
                  ACCESS FEATURES
                </a>
              </motion.div>

              {/* TradingView-style Coin Intelligence Search */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 1 }}
                className="mt-12"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[10px] text-gray-600 font-mono uppercase tracking-[0.3em]">Intelligence Engine — Search Any Asset</span>
                </div>
                <CoinSearchBar />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Features Grid */}
        <div id="features" className="max-w-screen-xl mx-auto px-6 mt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Brain, title: 'GPT-4o Profiling', desc: 'Every wallet is analyzed and assigned behavioral profiles, mapping risk tolerance and trading styles.' },
              { icon: Zap, title: 'Real-Time Web-Push', desc: 'Receive instant, encrypted push notifications to your devices the millisecond a 90+ conviction signal fires.' },
              { icon: Shield, title: 'RAG Context Memory', desc: 'Our engine remembers wallet history, correlating new movements with past behavioral anomalies.' },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: i * 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="p-6 rounded-2xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.05] hover:border-orange-500/30 hover:bg-white/[0.04] transition-all duration-500 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                   <div className="text-[10px] font-mono tracking-tighter">NODE_0{i+1}</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500 shadow-[0_0_15px_rgba(249,115,22,0)] group-hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                  <f.icon className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2 tracking-tight">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed font-light">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-screen-xl mx-auto px-6 mt-24"
        >
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter mb-4">Institutional Pricing.</h2>
            <p className="text-xl text-gray-400">One clear tier. Unlimited deep scans.</p>
          </div>
          
          <div className="max-w-lg mx-auto bg-gradient-to-b from-[#111] to-[#050505] border border-orange-500/30 rounded-3xl p-10 relative shadow-[0_0_50px_rgba(249,115,22,0.15)] hover:shadow-[0_0_80px_rgba(249,115,22,0.25)] transition-shadow duration-500">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-orange-500 text-black text-xs font-bold uppercase tracking-widest rounded-full">
              Full Access
            </div>
            
            <div className="text-center mb-8">
              <h3 className="text-2xl font-semibold text-white mb-2">Celsor Pro</h3>
              <div className="flex items-end justify-center gap-1">
                <span className="text-5xl font-black text-white">$199</span>
                <span className="text-gray-500 mb-1">/mo</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-10">
              {[
                'Unlimited AI Wallet Deep Scans',
                'Live WebSocket Intelligence Feed',
                'Web-Push & Email Alert Routing',
                'Private RAG Watchlists',
                'Access to multi-chain analytics (ETH, ARB, BASE, BSC, OP)'
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-gray-300">
                  <Activity className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            
            <button onClick={handleCheckout} className="group w-full py-4 bg-white hover:bg-gray-200 text-black font-bold rounded-xl transition-all duration-300 text-lg flex items-center justify-center gap-2 hover:scale-[1.02]">
              Start Subscription <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
