import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  message: string;
}

const AGENTS = ['SECURITY_AGENT', 'SOCIAL_AGENT', 'ON_CHAIN_AGENT', 'MEDIATOR', 'SYSTEM'];

const MOCK_MESSAGES: Record<string, string[]> = {
  SECURITY_AGENT: [
    '0x421... verified. No honeypot. LP 98% locked.',
    'Contract logic analyzed. Mint function disabled.',
    'Warning: Creator holds 15% of supply. Adjusting risk rating.',
    'GoPlus scan complete. No critical vulnerabilities found.'
  ],
  SOCIAL_AGENT: [
    'Volume spike +400% detected on X mentions.',
    'Sentiment analysis indicates early accumulation narrative.',
    'No matching Reddit threads found. Searching Telegram...',
    'Key opinion leader just followed token creator.'
  ],
  ON_CHAIN_AGENT: [
    'Whale 0x8a2... bought $120k worth on Uniswap V3.',
    'Wallet cluster 7 is moving funds to fresh addresses.',
    'Detected significant outflow from Binance hot wallet.',
    'Smart money accumulation confirmed in block 1849201.'
  ],
  MEDIATOR: [
    'Synthesizing Institutional Thesis... Result: LONG.',
    'Conflicting signals detected. Lowering conviction score to 45.',
    'Cross-referencing historical data. Alpha pattern identified.',
    'Thesis validated. Initiating signal broadcast.'
  ],
  SYSTEM: [
    'Connecting to DexScreener WebSocket...',
    'Redis cache hit for wallet profile 0x9f1... ',
    'BullMQ worker idle. Waiting for next block.',
    'Updating global macro sentiment to NEUTRAL.'
  ]
};

export default function LiveEngineLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate initial logs
    const initialLogs: LogEntry[] = Array.from({ length: 5 }).map((_, i) => createRandomLog(5 - i));
    setLogs(initialLogs);

    // Simulate incoming logs
    const interval = setInterval(() => {
      setLogs((prev) => {
        const newLog = createRandomLog(0);
        return [newLog, ...prev].slice(0, 50); // Keep last 50
      });
    }, Math.random() * 3000 + 2000); // Random interval between 2-5 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // keep it at the top since we unshift
    }
  }, [logs]);

  function createRandomLog(secondsAgo: number): LogEntry {
    const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const messages = MOCK_MESSAGES[agent];
    const message = messages[Math.floor(Math.random() * messages.length)];
    const d = new Date();
    d.setSeconds(d.getSeconds() - secondsAgo);

    return {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: `[${d.toISOString().substring(11, 19)}]`,
      agent,
      message,
    };
  }

  function getAgentColor(agent: string) {
    switch(agent) {
      case 'SECURITY_AGENT': return 'text-red-400';
      case 'SOCIAL_AGENT': return 'text-blue-400';
      case 'ON_CHAIN_AGENT': return 'text-purple-400';
      case 'MEDIATOR': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  }

  return (
    <div className="w-full bg-[#050505] border-t border-white/10 p-3 h-40 flex flex-col font-mono text-xs overflow-hidden">
      <div className="flex items-center gap-2 mb-2 text-gray-500 uppercase tracking-widest text-[10px]">
        <Terminal className="w-3 h-3" />
        <span>Live Engine Think-Log</span>
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse ml-2" />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-1 pr-2">
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 whitespace-nowrap overflow-hidden text-ellipsis"
            >
              <span className="text-gray-600 shrink-0">{log.timestamp}</span>
              <span className={`font-bold shrink-0 ${getAgentColor(log.agent)}`}>{log.agent}:</span>
              <span className="text-gray-300 truncate">{log.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
