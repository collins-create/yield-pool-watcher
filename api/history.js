import { getHistory } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { poolKey } = req.query;
  
  if (!poolKey) {
    return res.status(400).json({ error: 'poolKey parameter required' });
  }
  
  const history = getHistory(poolKey);
  
  return res.status(200).json({
    pool: poolKey,
    history,
    count: history.length
  });
}
