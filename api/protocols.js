import { SUPPORTED_PROTOCOLS } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({
    supported_protocols: Object.keys(SUPPORTED_PROTOCOLS).map(key => ({
      id: key,
      name: SUPPORTED_PROTOCOLS[key].name,
      chains: Object.keys(SUPPORTED_PROTOCOLS[key].chains)
    }))
  });
}
