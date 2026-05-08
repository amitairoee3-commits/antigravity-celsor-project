import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';

export interface Signal {
  id: string;
  asset: string;
  type: 'LONG' | 'SHORT';
  confidence: number;
  thesis: string;
  invalidation: string;
  status: string;
  created_at: string;
}

const fetchSignals = async (): Promise<Signal[]> => {
  if (typeof window !== 'undefined' && localStorage.getItem('celsor_demo_bypass') === 'true') {
    return [];
  }

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) throw new Error("No active session");

  // Fetch from our Next.js API route
  const response = await fetch('/api/signals?limit=50', {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch signals');
  }

  const data = await response.json();
  const rawSignals = data.signals || [];
  
  return rawSignals.map((s: any) => ({
    id: s.id,
    asset: s.tokenSymbol || 'UNKNOWN',
    type: s.direction || 'LONG',
    confidence: s.convictionScore || 0,
    thesis: s.catalystSummary || s.title || '',
    invalidation: s.invalidationCriteria || '',
    status: s.riskRating === 'LOW' ? 'Active' : 'Monitoring',
    created_at: new Date(s.generatedAt || Date.now()).toISOString(),
  }));
};

export const useSignals = () => {
  return useQuery({
    queryKey: ['signals'],
    queryFn: fetchSignals,
    refetchInterval: 30000, // Refresh every 30s
  });
};
