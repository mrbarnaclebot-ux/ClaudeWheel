import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatSOL(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount)
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M'
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K'
  }
  return num.toFixed(2)
}

export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// Token Contract Address
// TODO: Update this after launching your token on PumpFun
export const PLACEHOLDER_CA = 'UPDATE_AFTER_TOKEN_LAUNCH'

// Mock data for development
export const mockWalletData = {
  devWallet: {
    address: 'DEV...Wallet',
    solBalance: 12.547382,
    usdValue: 2847.32,
    lastFee: 0.0234,
    lastFeeTime: new Date(Date.now() - 32000),
  },
  opsWallet: {
    address: 'OPS...Wallet',
    solBalance: 45.892341,
    usdValue: 10432.87,
    tokenBalance: 1250000,
  },
}

export const mockTransactions = [
  { id: '1', type: 'fee' as const, amount: 0.0234, token: 'SOL', timestamp: new Date(Date.now() - 5000), status: 'confirmed' },
  { id: '2', type: 'buy' as const, amount: 125000, token: 'CLAUDE', timestamp: new Date(Date.now() - 15000), status: 'confirmed' },
  { id: '3', type: 'transfer' as const, amount: 0.5, token: 'SOL', timestamp: new Date(Date.now() - 28000), status: 'confirmed' },
  { id: '4', type: 'sell' as const, amount: 50000, token: 'CLAUDE', timestamp: new Date(Date.now() - 45000), status: 'confirmed' },
  { id: '5', type: 'fee' as const, amount: 0.0189, token: 'SOL', timestamp: new Date(Date.now() - 58000), status: 'confirmed' },
  { id: '6', type: 'buy' as const, amount: 75000, token: 'CLAUDE', timestamp: new Date(Date.now() - 120000), status: 'confirmed' },
  { id: '7', type: 'transfer' as const, amount: 0.8, token: 'SOL', timestamp: new Date(Date.now() - 180000), status: 'confirmed' },
]

export const mockFeeStats = {
  totalCollected: 847.32,
  todayCollected: 12.45,
  hourCollected: 2.34,
  totalChange: 2.3,
  todayChange: 5.1,
  hourChange: 1.2,
}
