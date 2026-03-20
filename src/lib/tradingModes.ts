export type TradingMode = 'SAFE' | 'BALANCED' | 'AGGRESSIVE' | 'DEGEN'

export interface ModeConfig {
  mode: TradingMode
  label: string
  badge: string
  description: string
  color: string
  warning?: string
  settings: {
    riskPctLargeCap: number
    riskPctMidCap: number
    riskPctLowCap: number
    leverageLargeCap: number
    leverageMidCap: number
    leverageLowCap: number
    maxLeverageLarge: number
    maxLeverageMid: number
    maxLeverageLow: number
    maxOpenPositions: number
    maxDailyLossPct: number
    maxWeeklyLossPct: number
    maxDrawdownPct: number
    minConfidence: number
    minProfitTargetPct: number
  }
}

export const TRADING_MODES: Record<string, ModeConfig> = {
  SAFE: {
    mode: 'SAFE',
    label: 'Safe',
    badge: '🛡️ SAFE',
    description: 'Validasi sistem, modal terlindungi maksimal. Cocok untuk awal trading dan capital kecil ($30-$100).',
    color: '#00D4AA',
    settings: {
      riskPctLargeCap: 3,
      riskPctMidCap: 3,
      riskPctLowCap: 3,
      leverageLargeCap: 5,
      leverageMidCap: 8,
      leverageLowCap: 10,
      maxLeverageLarge: 5,
      maxLeverageMid: 8,
      maxLeverageLow: 10,
      maxOpenPositions: 3,
      maxDailyLossPct: 10,
      maxWeeklyLossPct: 25,
      maxDrawdownPct: 40,
      minConfidence: 65,
      minProfitTargetPct: 6
    }
  },

  BALANCED: {
    mode: 'BALANCED',
    label: 'Balanced',
    badge: '⚖️ BALANCED',
    description: 'Risk-reward seimbang. Cocok setelah 1 bulan sistem terbukti profitable ($100-$500).',
    color: '#3d7fff',
    settings: {
      riskPctLargeCap: 5,
      riskPctMidCap: 5,
      riskPctLowCap: 7,
      leverageLargeCap: 10,
      leverageMidCap: 15,
      leverageLowCap: 20,
      maxLeverageLarge: 10,
      maxLeverageMid: 15,
      maxLeverageLow: 20,
      maxOpenPositions: 4,
      maxDailyLossPct: 20,
      maxWeeklyLossPct: 35,
      maxDrawdownPct: 55,
      minConfidence: 62,
      minProfitTargetPct: 10
    }
  },

  AGGRESSIVE: {
    mode: 'AGGRESSIVE',
    label: 'Aggressive',
    badge: '⚡ AGGRESSIVE',
    description: 'Leverage tinggi, profit lebih cepat. Gunakan setelah 2 bulan track record positif ($500+).',
    color: '#FFA502',
    settings: {
      riskPctLargeCap: 7,
      riskPctMidCap: 7,
      riskPctLowCap: 10,
      leverageLargeCap: 25,
      leverageMidCap: 30,
      leverageLowCap: 30,
      maxLeverageLarge: 25,
      maxLeverageMid: 30,
      maxLeverageLow: 30,
      maxOpenPositions: 5,
      maxDailyLossPct: 30,
      maxWeeklyLossPct: 50,
      maxDrawdownPct: 65,
      minConfidence: 60,
      minProfitTargetPct: 15
    }
  },

  DEGEN: {
    mode: 'DEGEN',
    label: 'Degen',
    badge: '💀 DEGEN',
    description: 'Maximum leverage. Profit atau liquidasi. Hanya gunakan jika siap kehilangan semua modal.',
    color: '#FF4757',
    warning: '⚠️ Mode ini dapat menghapus seluruh modal dalam hitungan jam. Gunakan dengan penuh kesadaran.',
    settings: {
      riskPctLargeCap: 10,
      riskPctMidCap: 10,
      riskPctLowCap: 10,
      leverageLargeCap: 50,
      leverageMidCap: 30,
      leverageLowCap: 30,
      maxLeverageLarge: 70,
      maxLeverageMid: 30,
      maxLeverageLow: 30,
      maxOpenPositions: 5,
      maxDailyLossPct: 50,
      maxWeeklyLossPct: 70,
      maxDrawdownPct: 80,
      minConfidence: 55,
      minProfitTargetPct: 20
    }
  }
}

export function getModeConfig(mode: string): ModeConfig {
  return TRADING_MODES[mode] ?? TRADING_MODES['SAFE']
}
