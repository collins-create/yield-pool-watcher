import { getStats } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const stats = getStats();
  
  return res.status(200).json({
    status: 'healthy',
    timestamp: Date.now(),
    pools_tracked: stats.pools_tracked,
    total_alerts: stats.total_alerts,
    version: '1.0.0',
    deployment: 'vercel'
  });
}
