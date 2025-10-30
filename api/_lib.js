import { ethers } from 'ethers';
import axios from 'axios';

// ========================================
// CONFIGURATION
// ========================================

export const SUPPORTED_PROTOCOLS = {
  aave_v3: {
    name: 'Aave V3',
    chains: {
      base: {
        poolDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
        rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
      },
      ethereum: {
        poolDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
        rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
      },
      polygon: {
        poolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
        rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'
      }
    }
  },
  compound_v3: {
    name: 'Compound V3',
    chains: {
      base: {
        comet: '0x46e6b214b524310239732D51387075E0e70970bf',
        rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org'
      },
      ethereum: {
        comet: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
        rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'
      }
    }
  }
};

// ABIs
const AAVE_POOL_DATA_PROVIDER_ABI = [
  'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[])',
  'function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
];

const COMPOUND_COMET_ABI = [
  'function getSupplyRate(uint256 utilization) external view returns (uint64)',
  'function getUtilization() public view returns (uint256)',
  'function totalSupply() external view returns (uint256)'
];

// ========================================
// DATA FETCHING FUNCTIONS
// ========================================

export async function fetchAaveMetrics(chain, pools = []) {
  const config = SUPPORTED_PROTOCOLS.aave_v3.chains[chain];
  if (!config) return [];
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const poolDataProvider = new ethers.Contract(
    config.poolDataProvider,
    AAVE_POOL_DATA_PROVIDER_ABI,
    provider
  );
  
  try {
    const reserves = await poolDataProvider.getAllReservesTokens();
    const metrics = [];
    
    for (const reserve of reserves.slice(0, 10)) { // Limit for Vercel timeout
      if (pools.length > 0 && !pools.some(p => 
        p.toLowerCase().includes(reserve.symbol.toLowerCase()) || 
        p.toLowerCase() === reserve.tokenAddress.toLowerCase()
      )) {
        continue;
      }
      
      const reserveData = await poolDataProvider.getReserveData(reserve.tokenAddress);
      const RAY = ethers.parseUnits('1', 27);
      const SECONDS_PER_YEAR = 31536000n;
      const depositAPR = (reserveData.liquidityRate * SECONDS_PER_YEAR) / RAY;
      const depositAPY = Number(depositAPR) / 10000;
      const tvl = Number(ethers.formatUnits(reserveData.totalAToken, 18));
      
      metrics.push({
        protocol: 'aave_v3',
        chain,
        pool: reserve.symbol,
        address: reserve.tokenAddress,
        apy: depositAPY,
        tvl: tvl,
        timestamp: Date.now()
      });
    }
    
    return metrics;
  } catch (error) {
    console.error(`Error fetching Aave metrics for ${chain}:`, error.message);
    return [];
  }
}

export async function fetchCompoundMetrics(chain, pools = []) {
  const config = SUPPORTED_PROTOCOLS.compound_v3.chains[chain];
  if (!config) return [];
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const comet = new ethers.Contract(config.comet, COMPOUND_COMET_ABI, provider);
  
  try {
    const utilization = await comet.getUtilization();
    const supplyRate = await comet.getSupplyRate(utilization);
    const totalSupply = await comet.totalSupply();
    
    const SECONDS_PER_YEAR = 31536000n;
    const supplyAPR = (supplyRate * SECONDS_PER_YEAR * 100n) / ethers.parseUnits('1', 18);
    const apy = Number(supplyAPR) / 100;
    const tvl = Number(ethers.formatUnits(totalSupply, 6));
    
    return [{
      protocol: 'compound_v3',
      chain,
      pool: 'USDC',
      address: config.comet,
      apy,
      tvl,
      timestamp: Date.now()
    }];
  } catch (error) {
    console.error(`Error fetching Compound metrics for ${chain}:`, error.message);
    return [];
  }
}

export async function fetchDefiLlamaMetrics(protocols = []) {
  try {
    const response = await axios.get('https://yields.llama.fi/pools', {
      timeout: 8000
    });
    const allPools = response.data.data;
    
    const filteredPools = protocols.length > 0
      ? allPools.filter(pool => protocols.some(p => pool.project?.toLowerCase().includes(p.toLowerCase())))
      : allPools.slice(0, 30);
    
    return filteredPools.map(pool => ({
      protocol: pool.project,
      chain: pool.chain,
      pool: pool.symbol,
      address: pool.pool,
      apy: pool.apy || 0,
      tvl: pool.tvlUsd || 0,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error fetching DefiLlama metrics:', error.message);
    return [];
  }
}

export async function fetchPoolMetrics(protocolIds = [], pools = [], chains = ['base']) {
  const allMetrics = [];
  
  // DefiLlama for broad coverage
  if (protocolIds.length === 0 || protocolIds.some(p => !['aave_v3', 'compound_v3'].includes(p))) {
    const llamaMetrics = await fetchDefiLlamaMetrics(protocolIds);
    allMetrics.push(...llamaMetrics);
  }
  
  // On-chain sources for accuracy
  if (protocolIds.includes('aave_v3') || (protocolIds.length === 0 && chains.length <= 2)) {
    for (const chain of chains.slice(0, 2)) {
      const aaveMetrics = await fetchAaveMetrics(chain, pools);
      allMetrics.push(...aaveMetrics);
    }
  }
  
  if (protocolIds.includes('compound_v3') || (protocolIds.length === 0 && chains.length <= 2)) {
    for (const chain of chains.slice(0, 2)) {
      const compoundMetrics = await fetchCompoundMetrics(chain, pools);
      allMetrics.push(...compoundMetrics);
    }
  }
  
  return allMetrics;
}

// ========================================
// ALERTING & PROCESSING
// ========================================

const poolHistory = new Map();
const alerts = [];

export function processMetricsAndAlerts(currentMetrics, thresholdRules) {
  const deltas = [];
  const triggeredAlerts = [];
  
  for (const metric of currentMetrics) {
    const key = `${metric.protocol}_${metric.chain}_${metric.pool}`;
    const history = poolHistory.get(key) || [];
    
    history.push(metric);
    if (history.length > 100) history.shift();
    poolHistory.set(key, history);
    
    if (history.length >= 2) {
      const previous = history[history.length - 2];
      const apyChange = ((metric.apy - previous.apy) / Math.max(previous.apy, 0.01)) * 100;
      const tvlChange = ((metric.tvl - previous.tvl) / Math.max(previous.tvl, 1)) * 100;
      
      const delta = {
        pool: key,
        apy_change_percent: apyChange,
        tvl_change_percent: tvlChange,
        time_window: '1_block',
        previous_apy: previous.apy,
        current_apy: metric.apy,
        previous_tvl: previous.tvl,
        current_tvl: metric.tvl
      };
      
      deltas.push(delta);
      
      const rules = thresholdRules || {
        apy_change_threshold: 5,
        tvl_change_threshold: 20
      };
      
      if (Math.abs(apyChange) > rules.apy_change_threshold) {
        triggeredAlerts.push({
          type: apyChange > 0 ? 'apy_spike' : 'apy_drop',
          pool: key,
          change: apyChange,
          threshold: rules.apy_change_threshold,
          severity: Math.abs(apyChange) > rules.apy_change_threshold * 2 ? 'high' : 'medium',
          message: `APY ${apyChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(apyChange).toFixed(2)}% (from ${previous.apy.toFixed(2)}% to ${metric.apy.toFixed(2)}%)`,
          timestamp: Date.now()
        });
      }
      
      if (Math.abs(tvlChange) > rules.tvl_change_threshold) {
        triggeredAlerts.push({
          type: tvlChange > 0 ? 'tvl_spike' : 'tvl_drain',
          pool: key,
          change: tvlChange,
          threshold: rules.tvl_change_threshold,
          severity: Math.abs(tvlChange) > rules.tvl_change_threshold * 2 ? 'high' : 'medium',
          message: `TVL ${tvlChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(tvlChange).toFixed(2)}% (from $${previous.tvl.toFixed(2)} to $${metric.tvl.toFixed(2)})`,
          timestamp: Date.now()
        });
      }
    }
  }
  
  alerts.push(...triggeredAlerts);
  if (alerts.length > 1000) {
    alerts.splice(0, alerts.length - 1000);
  }
  
  return { deltas, alerts: triggeredAlerts };
}

export function getAlerts(limit = 50) {
  return alerts.slice(-limit);
}

export function getHistory(poolKey) {
  return poolHistory.get(poolKey) || [];
}

export function getStats() {
  return {
    pools_tracked: poolHistory.size,
    total_alerts: alerts.length
  };
}
