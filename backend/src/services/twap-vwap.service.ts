// ═══════════════════════════════════════════════════════════════════════════
// TWAP/VWAP MODE SERVICE
// Implements the twap_vwap algorithm mode
// Decides between TWAP and VWAP execution based on config and market conditions
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import { PriceAnalyzer } from './price-analyzer';
import { loggers } from '../utils/logger';
import {
  ExecutionStyle,
  TwapQueueItem,
  VwapContext,
  ExtendedTokenConfig,
  ExecutionDecision,
} from '../types/mm-strategies';

export class TwapVwapService {
  private analyzer: PriceAnalyzer;
  private tokenMint: string;

  constructor(tokenMint: string) {
    this.tokenMint = tokenMint;
    this.analyzer = new PriceAnalyzer(tokenMint);
  }

  /**
   * Decide how to execute a trade based on config and market conditions
   * Returns execution decision with style (instant/twap/vwap) and amount
   */
  async getExecutionDecision(
    config: ExtendedTokenConfig,
    intendedAmount: number,
    tradeType: 'buy' | 'sell',
    availableBalance: number
  ): Promise<ExecutionDecision> {
    const priceData = await this.analyzer.fetchCurrentPrice();

    // No price data - fall back to instant but cap at safe amount
    if (!priceData) {
      // Cap fallback trades to 10% of intended amount to prevent large trades on API failure
      const safeAmount = Math.min(intendedAmount * 0.1, availableBalance);
      loggers.flywheel.warn({ intendedAmount, safeAmount }, 'No price data, using capped fallback amount');
      return {
        shouldExecuteNow: true,
        executionType: 'instant',
        tradeAmount: safeAmount,
        reason: 'No price data available, using capped fallback (10% of intended)',
      };
    }

    // Check if VWAP should be used (volume-based sizing)
    if (config.vwap_enabled && priceData.volume24h >= config.vwap_min_volume_usd) {
      const vwapContext = this.calculateVwapContext(config, priceData.volume24h, intendedAmount);

      if (vwapContext.targetTradeSize > 0) {
        // Convert USD target to SOL (approximate)
        const solPrice = priceData.price > 0 ? 1 / priceData.price : 0;
        // IMPORTANT: Cap at intendedAmount to respect max_buy/sell settings
        const vwapAmountSol = Math.min(
          vwapContext.actualTradeSize * solPrice,
          availableBalance,
          intendedAmount // Never exceed the intended trade amount from config
        );

        return {
          shouldExecuteNow: true,
          executionType: 'vwap',
          tradeAmount: vwapAmountSol > 0 ? vwapAmountSol : Math.min(intendedAmount, availableBalance),
          reason: `VWAP: ${config.vwap_participation_rate}% of ${priceData.volume24h.toFixed(0)} USD volume (capped at ${intendedAmount.toFixed(4)} SOL)`,
        };
      }
    }

    // Check if TWAP should be used (time-sliced execution for larger trades)
    // Calculate trade value in USD
    const solPriceUsd = priceData.price || 0;
    const tradeValueUsd = intendedAmount * solPriceUsd;
    const twapThreshold = config.twap_threshold_usd || 50;

    if (config.twap_enabled && tradeValueUsd > twapThreshold) {
      const sliceSize = intendedAmount / config.twap_slices;

      return {
        shouldExecuteNow: true,
        executionType: 'twap',
        tradeAmount: Math.min(sliceSize, availableBalance),
        reason: `TWAP: Slice 1/${config.twap_slices} of ${intendedAmount.toFixed(4)} SOL (trade value $${tradeValueUsd.toFixed(2)} > threshold $${twapThreshold})`,
      };
    }

    // Default: instant execution for small trades
    return {
      shouldExecuteNow: true,
      executionType: 'instant',
      tradeAmount: Math.min(intendedAmount, availableBalance),
      reason: `Trade value $${tradeValueUsd.toFixed(2)} below TWAP threshold $${twapThreshold}, instant execution`,
    };
  }

  /**
   * Calculate VWAP-based trade size
   * Target: X% of recent market volume
   */
  calculateVwapContext(
    config: ExtendedTokenConfig,
    marketVolume24h: number,
    intendedAmount: number
  ): VwapContext {
    // Calculate per-minute volume (assuming 24h volume)
    const volumePerMinute = marketVolume24h / (24 * 60);

    // Target trade size based on participation rate
    const targetTradeSize = volumePerMinute * (config.vwap_participation_rate / 100);

    // Cap at intended amount (don't trade more than intended)
    const actualTradeSize = Math.min(targetTradeSize, intendedAmount);

    return {
      marketVolume24h,
      targetParticipation: config.vwap_participation_rate,
      targetTradeSize,
      actualTradeSize,
      participationRate: config.vwap_participation_rate,
    };
  }

  /**
   * Create a TWAP queue for time-sliced execution
   * Each queue item represents a single trade split into slices
   */
  createTwapQueue(
    tokenId: string,
    tradeType: 'buy' | 'sell',
    totalAmount: number,
    slices: number,
    windowMinutes: number
  ): TwapQueueItem {
    const sliceSize = totalAmount / slices;
    const intervalMinutes = windowMinutes / slices;
    const now = new Date();

    const queueItem: TwapQueueItem = {
      id: randomUUID(),
      tokenId,
      tradeType,
      totalAmount,
      sliceSize,
      slicesRemaining: slices,
      slicesTotal: slices,
      nextExecuteAt: now, // First slice executes immediately
      intervalMinutes,
      createdAt: now,
    };

    loggers.flywheel.info({
      tokenId,
      tradeType,
      totalAmount,
      slices,
      windowMinutes,
      sliceSize,
      intervalMinutes,
    }, 'Created TWAP queue');

    return queueItem;
  }

  /**
   * Get ready items from TWAP queue (items whose nextExecuteAt has passed)
   */
  getReadyTwapItems(queue: TwapQueueItem[]): TwapQueueItem[] {
    const now = new Date();
    return queue.filter((item) => {
      const executeAt = new Date(item.nextExecuteAt);
      return item.slicesRemaining > 0 && executeAt <= now;
    });
  }

  /**
   * Update TWAP queue after executing a slice
   * Returns updated queue (removes completed items, updates remaining)
   */
  updateTwapQueue(queue: TwapQueueItem[], executedItemId: string): TwapQueueItem[] {
    return queue
      .map((item) => {
        if (item.id !== executedItemId) return item;

        const newSlicesRemaining = item.slicesRemaining - 1;

        if (newSlicesRemaining <= 0) {
          // Mark as complete (will be filtered out)
          return { ...item, slicesRemaining: 0 };
        }

        // Calculate next execution time
        const nextExecuteAt = new Date();
        nextExecuteAt.setMinutes(nextExecuteAt.getMinutes() + item.intervalMinutes);

        return {
          ...item,
          slicesRemaining: newSlicesRemaining,
          nextExecuteAt,
        };
      })
      .filter((item) => item.slicesRemaining > 0); // Remove completed items
  }

  /**
   * Check if a token has pending TWAP items
   */
  hasPendingTwap(queue: TwapQueueItem[], tokenId: string): boolean {
    return queue.some((item) => item.tokenId === tokenId && item.slicesRemaining > 0);
  }

  /**
   * Get total pending amount for a token in TWAP queue
   */
  getPendingTwapAmount(queue: TwapQueueItem[], tokenId: string): number {
    return queue
      .filter((item) => item.tokenId === tokenId && item.slicesRemaining > 0)
      .reduce((sum, item) => sum + item.sliceSize * item.slicesRemaining, 0);
  }

  /**
   * Cancel all TWAP items for a token
   */
  cancelTwapForToken(queue: TwapQueueItem[], tokenId: string): TwapQueueItem[] {
    return queue.filter((item) => item.tokenId !== tokenId);
  }
}

// Factory function to create service instances
export function createTwapVwapService(tokenMint: string): TwapVwapService {
  return new TwapVwapService(tokenMint);
}
