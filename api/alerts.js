import { getAlerts } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const limit = parseInt(req.query.limit) || 50;
  const recentAlerts = getAlerts(limit);
  
  return res.status(200).json({
    alerts: recentAlerts,
    total: recentAlerts.length
  });
}
