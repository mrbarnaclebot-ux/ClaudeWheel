// ═══════════════════════════════════════════════════════════════════════════
// MARKET CONDITION DETECTOR SERVICE
// Analyzes price data to detect market conditions: pump, dump, ranging, normal, extreme_volatility
// Used by dynamic mode to make intelligent buy/sell decisions
// ═══════════════════════════════════════════════════════════════════════════

import { PriceAnalyzer } from './price-analyzer';
import { loggers } from '../utils/logger';
import { MarketCondition, MarketConditionResult } from '../types/mm-strategies';

// Detection thresholds (configurable defaults)
interface DetectionThresholds {
  pumpPriceChangePercent: number;     // Price up > X% = pump (default: 10)
  dumpPriceChangePercent: number;     // Price down > X% = dump (default: -10)
  rangingPriceChangePercent: number;  // Price change < X% = ranging (default: 3)
  rangingVolatilityPercent: number;   // Volatility < X% = ranging (default: 3)
  extremeVolatilityPercent: number;   // Volatility > X% = extreme (default: 15)
  rsiOverbought: number;              // RSI > X = overbought/pump (default: 70)
  rsiOversold: number;                // RSI < X = oversold/dump (default: 30)
}

const DEFAULT_THRESHOLDS: DetectionThresholds = {
  pumpPriceChangePercent: 10,
  dumpPriceChangePercent: -10,
  rangingPriceChangePercent: 3,
  rangingVolatilityPercent: 3,
  extremeVolatilityPercent: 15,
  rsiOverbought: 70,
  rsiOversold: 30,
};

export class MarketConditionDetector {
  private analyzer: PriceAnalyzer;
  private thresholds: DetectionThresholds;
  private lastCondition: MarketCondition = 'normal';
  private tokenMint: string;

  constructor(tokenMint: string, thresholds: Partial<DetectionThresholds> = {}) {
    this.tokenMint = tokenMint;
    this.analyzer = new PriceAnalyzer(tokenMint);
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Detect current market condition based on price data and technical indicators
   */
  async detect(): Promise<MarketConditionResult> {
    const priceData = await this.analyzer.fetchCurrentPrice();
    const trendAnalysis = this.analyzer.analyzeTrend();
    const volatilityMetrics = this.analyzer.calculateVolatility();

    const reasons: string[] = [];
    let condition: MarketCondition = 'normal';
    let confidence = 50;

    // Extract metrics (with defaults if not available)
    const priceChange24h = priceData?.priceChange24h ?? 0;
    const volatility = volatilityMetrics?.volatility ?? 0;
    const rsi = trendAnalysis?.rsi ?? 50;

    // Step 1: Check for extreme volatility first (highest priority)
    if (volatility > this.thresholds.extremeVolatilityPercent) {
      condition = 'extreme_volatility';
      confidence = Math.min(100, 60 + (volatility - this.thresholds.extremeVolatilityPercent) * 2);
      reasons.push(`Extreme volatility: ${volatility.toFixed(1)}% > ${this.thresholds.extremeVolatilityPercent}%`);
    }
    // Step 2: Check for pump conditions
    else if (
      priceChange24h > this.thresholds.pumpPriceChangePercent ||
      rsi > this.thresholds.rsiOverbought
    ) {
      condition = 'pump';
      confidence = this.calculatePumpConfidence(priceChange24h, rsi);

      if (priceChange24h > this.thresholds.pumpPriceChangePercent) {
        reasons.push(`Price up ${priceChange24h.toFixed(1)}% in 24h`);
      }
      if (rsi > this.thresholds.rsiOverbought) {
        reasons.push(`RSI overbought: ${rsi.toFixed(0)} > ${this.thresholds.rsiOverbought}`);
      }
    }
    // Step 3: Check for dump conditions
    else if (
      priceChange24h < this.thresholds.dumpPriceChangePercent ||
      rsi < this.thresholds.rsiOversold
    ) {
      condition = 'dump';
      confidence = this.calculateDumpConfidence(priceChange24h, rsi);

      if (priceChange24h < this.thresholds.dumpPriceChangePercent) {
        reasons.push(`Price down ${priceChange24h.toFixed(1)}% in 24h`);
      }
      if (rsi < this.thresholds.rsiOversold) {
        reasons.push(`RSI oversold: ${rsi.toFixed(0)} < ${this.thresholds.rsiOversold}`);
      }
    }
    // Step 4: Check for ranging market
    else if (
      Math.abs(priceChange24h) < this.thresholds.rangingPriceChangePercent &&
      volatility < this.thresholds.rangingVolatilityPercent
    ) {
      condition = 'ranging';
      confidence = 70;
      reasons.push(`Price stable: ${priceChange24h.toFixed(1)}%`);
      reasons.push(`Low volatility: ${volatility.toFixed(1)}%`);
    }
    // Step 5: Default to normal
    else {
      condition = 'normal';
      confidence = 60;
      reasons.push('No significant market condition detected');
    }

    // Store last condition for transition detection
    this.lastCondition = condition;

    const result: MarketConditionResult = {
      condition,
      confidence,
      priceChange24h,
      volatility,
      rsi,
      volumeChange: 0, // Would need historical volume data
      detectedAt: new Date(),
      reasons,
    };

    loggers.flywheel.debug({
      tokenMint: this.tokenMint,
      condition,
      confidence,
      priceChange24h,
      volatility,
      rsi,
      reasons,
    }, 'Market condition detected');

    return result;
  }

  /**
   * Calculate confidence for pump detection
   */
  private calculatePumpConfidence(priceChange: number, rsi: number): number {
    let confidence = 50;

    // Price change contribution (0-30)
    if (priceChange > this.thresholds.pumpPriceChangePercent) {
      const excess = priceChange - this.thresholds.pumpPriceChangePercent;
      confidence += Math.min(30, excess * 2);
    }

    // RSI contribution (0-30)
    if (rsi > this.thresholds.rsiOverbought) {
      const excess = rsi - this.thresholds.rsiOverbought;
      confidence += Math.min(30, excess);
    }

    return Math.min(100, confidence);
  }

  /**
   * Calculate confidence for dump detection
   */
  private calculateDumpConfidence(priceChange: number, rsi: number): number {
    let confidence = 50;

    // Price change contribution (0-30)
    if (priceChange < this.thresholds.dumpPriceChangePercent) {
      const excess = Math.abs(priceChange) - Math.abs(this.thresholds.dumpPriceChangePercent);
      confidence += Math.min(30, excess * 2);
    }

    // RSI contribution (0-30)
    if (rsi < this.thresholds.rsiOversold) {
      const deficit = this.thresholds.rsiOversold - rsi;
      confidence += Math.min(30, deficit);
    }

    return Math.min(100, confidence);
  }

  /**
   * Get the last detected condition without re-fetching
   */
  getLastCondition(): MarketCondition {
    return this.lastCondition;
  }

  /**
   * Check if condition has changed from a previous value
   */
  hasConditionChanged(previousCondition: MarketCondition): boolean {
    return this.lastCondition !== previousCondition;
  }

  /**
   * Update detection thresholds
   */
  setThresholds(thresholds: Partial<DetectionThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): DetectionThresholds {
    return { ...this.thresholds };
  }
}

// Factory function to create detector instances
export function createMarketConditionDetector(
  tokenMint: string,
  thresholds?: Partial<DetectionThresholds>
): MarketConditionDetector {
  return new MarketConditionDetector(tokenMint, thresholds);
}
