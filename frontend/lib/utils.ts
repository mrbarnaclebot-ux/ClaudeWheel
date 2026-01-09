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
  if (num >= 1_000_000_000) {
    const val = num / 1_000_000_000
    return val >= 100 ? val.toFixed(0) + 'B' : val >= 10 ? val.toFixed(1) + 'B' : val.toFixed(2) + 'B'
  }
  if (num >= 1_000_000) {
    const val = num / 1_000_000
    return val >= 100 ? val.toFixed(0) + 'M' : val >= 10 ? val.toFixed(1) + 'M' : val.toFixed(2) + 'M'
  }
  if (num >= 1_000) {
    const val = num / 1_000
    return val >= 100 ? val.toFixed(0) + 'K' : val >= 10 ? val.toFixed(1) + 'K' : val.toFixed(2) + 'K'
  }
  if (num >= 100) {
    return num.toFixed(0)
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
