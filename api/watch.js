import { z } from 'zod';
import { fetchPoolMetrics, processMetricsAndAlerts } from './_lib.js';

const WatcherInputSchema = z.object({
  protocol_ids: z.array(z.string()).optional().default([]),
  pools: z.array(z.string()).optional().default([]),
  chains: z.array(z.string()).optional().default(['base', 'ethereum']),
  threshold_rules: z.object({
    apy_change_threshold: z.number().optional().default(5),
    tvl_change_threshold: z.number().optional().default(20),
    apy_drop_threshold: z.number().optional().default(3),
    tvl_drain_threshold: z.number().optional().default(15)
  }).optional()
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const input = WatcherInputSchema.parse(req.body);
    
    const poolMetrics = await fetchPoolMetrics(
      input.protocol_ids,
      input.pools,
      input.chains
    );
    
    const { deltas, alerts: triggeredAlerts } = processMetricsAndAlerts(
      poolMetrics,
      input.threshold_rules
    );
    
    const totalPools = poolMetrics.length;
    const usageTokens = totalPools * 50 + deltas.length * 20 + triggeredAlerts.length * 30;
    
    return res.status(200).json({
      output: {
        pool_metrics: poolMetrics.map(m => ({
          protocol: m.protocol,
          chain: m.chain,
          pool: m.pool,
          address: m.address,
          apy: m.apy,
          tvl: m.tvl,
          timestamp: m.timestamp
        })),
        deltas,
        alerts: triggeredAlerts,
        summary: {
          total_pools_monitored: poolMetrics.length,
          alerts_triggered: triggeredAlerts.length,
          timestamp: Date.now()
        }
      },
      usage: {
        total_tokens: usageTokens
      }
    });
    
  } catch (error) {
    console.error('Error in /watch endpoint:', error);
    return res.status(400).json({
      error: error.message,
      output: null,
      usage: { total_tokens: 0 }
    });
  }
}
