// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC MODE SERVICE
// Implements condition-based buy/sell decisions for the 'dynamic' algorithm mode
// Key behavior: SELL during pumps, BUY during dumps/normal/ranging
// ═══════════════════════════════════════════════════════════════════════════

import { loggers } from '../utils/logger';
import { MarketConditionDetector } from './market-condition.service';
import {
  MarketCondition,
  MarketConditionResult,
  FeeAllocation,
  ExtendedTokenConfig,
  ReserveDeployment,
} from '../types/mm-strategies';

/**
 * Fee allocation rules by market condition
 *
 * | Condition          | Trade Type | Buyback % | Reserve % | Execution |
 * |--------------------|------------|-----------|-----------|-----------|
 * | pump               | SELL       | 90%       | 10%       | instant   |
 * | dump               | BUY        | 80%       | 20%       | twap      |
 * | ranging            | BUY        | 90%       | 10%       | vwap      |
 * | normal             | BUY        | 90%       | 10%       | instant   |
 * | extreme_volatility | -          | 0%        | 20%       | skip      |
 */

export class DynamicModeService {
  private detector: MarketConditionDetector;
  private tokenMint: string;

  constructor(tokenMint: string) {
    this.tokenMint = tokenMint;
    this.detector = new MarketConditionDetector(tokenMint);
  }

  /**
   * Get fee allocation decision based on current market conditions
   * Includes trade type (buy/sell), execution style, and reserve percentages
   */
  async getAllocation(config: ExtendedTokenConfig): Promise<FeeAllocation> {
    // If dynamic fees disabled, return simple allocation (default to buy)
    if (!config.dynamic_fee_enabled) {
      return {
        tradeType: 'buy',
        buybackPercent: 100 - config.reserve_percent_normal,
        reservePercent: config.reserve_percent_normal,
        shouldPause: false,
        executionStyle: 'instant',
        conditionUsed: 'normal',
      };
    }

    // Detect current market condition
    const conditionResult = await this.detector.detect();

    // Get allocation based on detected condition
    return this.getAllocationForCondition(config, conditionResult);
  }

  /**
   * Get allocation for a specific market condition
   * Core logic for buy/sell decisions
   */
  getAllocationForCondition(
    config: ExtendedTokenConfig,
    condition: MarketConditionResult
  ): FeeAllocation {
    const { condition: marketCondition, volatility } = condition;

    // Check for extreme volatility pause
    if (
      config.pause_on_extreme_volatility &&
      volatility > config.volatility_pause_threshold
    ) {
      return {
        tradeType: 'buy', // Default, won't execute due to shouldPause
        buybackPercent: 0,
        reservePercent: config.reserve_percent_adverse,
        shouldPause: true,
        pauseReason: `Extreme volatility (${volatility.toFixed(1)}% > ${config.volatility_pause_threshold}%)`,
        executionStyle: 'instant',
        conditionUsed: 'extreme_volatility',
      };
    }

    switch (marketCondition) {
      case 'pump':
        // During pump: SELL to take profits and provide liquidity
        // This is hardcoded behavior - not configurable
        return {
          tradeType: 'sell', // ← KEY: Sell during pumps
          buybackPercent: 90,
          reservePercent: 10,
          shouldPause: false,
          executionStyle: 'instant', // Quick execution to catch momentum
          conditionUsed: 'pump',
        };

      case 'dump':
        // During dump: BUY to support price, use TWAP to average in
        // Hold higher reserve in case it gets worse
        const buybackDump = config.buyback_boost_on_dump ? 80 : 70;
        return {
          tradeType: 'buy', // ← KEY: Buy during dumps
          buybackPercent: buybackDump,
          reservePercent: config.reserve_percent_adverse,
          shouldPause: false,
          executionStyle: 'twap', // Spread buys to average in
          conditionUsed: 'dump',
        };

      case 'ranging':
        // During ranging: BUY to accumulate, VWAP execution
        return {
          tradeType: 'buy', // ← KEY: Buy during ranging
          buybackPercent: 100 - config.reserve_percent_normal,
          reservePercent: config.reserve_percent_normal,
          shouldPause: false,
          executionStyle: 'vwap', // Match volume in range
          conditionUsed: 'ranging',
        };

      case 'extreme_volatility':
        // Extreme volatility: pause trading, build reserve
        return {
          tradeType: 'buy', // Default, won't execute due to shouldPause
          buybackPercent: 0,
          reservePercent: config.reserve_percent_adverse,
          shouldPause: true,
          pauseReason: 'Extreme volatility detected',
          executionStyle: 'instant',
          conditionUsed: 'extreme_volatility',
        };

      case 'normal':
      default:
        // Normal conditions: BUY to accumulate
        return {
          tradeType: 'buy', // ← KEY: Buy during normal
          buybackPercent: 100 - config.reserve_percent_normal,
          reservePercent: config.reserve_percent_normal,
          shouldPause: false,
          executionStyle: 'instant',
          conditionUsed: 'normal',
        };
    }
  }

  /**
   * Calculate actual SOL amounts from allocation percentages
   * Used when determining how much to actually trade
   */
  calculateAmounts(
    accumulatedFees: number,
    allocation: FeeAllocation
  ): { buybackAmount: number; reserveAmount: number } {
    const buybackAmount = accumulatedFees * (allocation.buybackPercent / 100);
    const reserveAmount = accumulatedFees * (allocation.reservePercent / 100);

    return { buybackAmount, reserveAmount };
  }

  /**
   * Determine if reserve should be deployed
   * Reserve is deployed when transitioning from adverse to favorable conditions
   */
  shouldDeployReserve(
    currentCondition: MarketCondition,
    previousCondition: MarketCondition,
    reserveBalance: number,
    minDeployThreshold: number = 0.01
  ): ReserveDeployment {
    // Don't deploy if reserve is too small
    if (reserveBalance < minDeployThreshold) {
      return { deploy: false, amount: 0, reason: 'Reserve below minimum threshold' };
    }

    // Deploy 50% of reserve when transitioning from adverse to favorable
    const adverseConditions: MarketCondition[] = ['dump', 'extreme_volatility'];
    const favorableConditions: MarketCondition[] = ['normal', 'pump', 'ranging'];

    const wasAdverse = adverseConditions.includes(previousCondition);
    const nowFavorable = favorableConditions.includes(currentCondition);

    if (wasAdverse && nowFavorable) {
      const deployAmount = reserveBalance * 0.5; // Deploy 50% of reserve

      loggers.flywheel.info({
        tokenMint: this.tokenMint,
        previousCondition,
        currentCondition,
        reserveBalance,
        deployAmount,
      }, 'Deploying reserve on condition improvement');

      return {
        deploy: true,
        amount: deployAmount,
        reason: `Condition improved: ${previousCondition} → ${currentCondition}`,
      };
    }

    return { deploy: false, amount: 0, reason: 'No favorable condition transition' };
  }

  /**
   * Get the underlying market condition detector
   */
  getDetector(): MarketConditionDetector {
    return this.detector;
  }

  /**
   * Calculate sell amount for pump conditions
   * Returns amount in tokens (not SOL) based on percentage of balance
   */
  calculateSellAmount(
    tokenBalance: number,
    config: ExtendedTokenConfig
  ): number {
    const minPercent = config.min_sell_percent || 10;
    const maxPercent = config.max_sell_percent || 30;

    // Random percentage within range
    const sellPercent = minPercent + Math.random() * (maxPercent - minPercent);
    const sellAmount = tokenBalance * (sellPercent / 100);

    loggers.flywheel.debug({
      tokenMint: this.tokenMint,
      tokenBalance,
      sellPercent,
      sellAmount,
    }, 'Calculated sell amount for pump');

    return sellAmount;
  }
}

// Factory function to create service instances
export function createDynamicModeService(tokenMint: string): DynamicModeService {
  return new DynamicModeService(tokenMint);
}
