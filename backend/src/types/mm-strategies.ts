// ═══════════════════════════════════════════════════════════════════════════
// MARKET MAKING STRATEGY TYPES
// Type definitions for the 4 algorithm modes: simple, rebalance, twap_vwap, dynamic
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Algorithm modes available for market making
 * - simple: 5 buy → 5 sell cycle (unchanged)
 * - rebalance: Maintain target SOL/token allocation (unchanged)
 * - twap_vwap: 5 buy → 5 sell with TWAP/VWAP execution (NEW)
 * - dynamic: Condition-based buy/sell decisions (NEW, replaces 'smart')
 */
export type AlgorithmMode = 'simple' | 'rebalance' | 'twap_vwap' | 'dynamic';

/**
 * Execution styles for trades
 */
export type ExecutionStyle = 'instant' | 'twap' | 'vwap';

/**
 * Market conditions detected by the price analyzer
 */
export type MarketCondition = 'pump' | 'dump' | 'ranging' | 'normal' | 'extreme_volatility';

/**
 * Result of market condition detection
 */
export interface MarketConditionResult {
  condition: MarketCondition;
  confidence: number;         // 0-100
  priceChange24h: number;     // Percentage
  volatility: number;         // Percentage
  rsi: number;                // 0-100
  volumeChange: number;       // Percentage vs average
  detectedAt: Date;
  reasons: string[];          // Human-readable explanation
}

/**
 * Fee allocation decision (includes trade type for dynamic mode)
 */
export interface FeeAllocation {
  tradeType: 'buy' | 'sell';   // What action to take based on condition
  buybackPercent: number;      // 0-100 (% of fees to use for trading)
  reservePercent: number;      // 0-100 (% of fees to reserve)
  shouldPause: boolean;        // Skip this cycle entirely
  pauseReason?: string;
  executionStyle: ExecutionStyle;
  conditionUsed: MarketCondition;
}

/**
 * TWAP execution queue item
 */
export interface TwapQueueItem {
  id: string;
  tokenId: string;
  tradeType: 'buy' | 'sell';
  totalAmount: number;        // Total trade amount
  sliceSize: number;          // Amount per slice
  slicesRemaining: number;    // How many slices left
  slicesTotal: number;        // Total slices
  nextExecuteAt: Date;        // When to execute next slice
  intervalMinutes: number;    // Time between slices
  createdAt: Date;
}

/**
 * VWAP context for volume-weighted execution
 */
export interface VwapContext {
  marketVolume24h: number;    // USD volume
  targetParticipation: number; // Config value (e.g., 10%)
  targetTradeSize: number;    // USD value based on participation
  actualTradeSize: number;    // Capped by balance/config
  participationRate: number;  // Config value used
}

/**
 * Extended token config with new TWAP/VWAP and Dynamic mode fields
 */
export interface ExtendedTokenConfig {
  // Existing fields
  flywheel_active: boolean;
  min_buy_amount_sol: number;
  max_buy_amount_sol: number;
  slippage_bps: number;
  algorithm_mode: AlgorithmMode;
  target_sol_allocation: number;
  target_token_allocation: number;
  rebalance_threshold: number;
  trading_route: 'bags' | 'jupiter' | 'auto';

  // TWAP/VWAP fields (used by twap_vwap and dynamic modes)
  twap_enabled: boolean;
  twap_slices: number;
  twap_window_minutes: number;
  twap_threshold_usd: number;
  vwap_enabled: boolean;
  vwap_participation_rate: number;
  vwap_min_volume_usd: number;

  // Dynamic mode fields (only used when algorithm_mode = 'dynamic')
  dynamic_fee_enabled: boolean;
  reserve_percent_normal: number;
  reserve_percent_adverse: number;
  min_sell_percent: number;
  max_sell_percent: number;
  buyback_boost_on_dump: boolean;
  pause_on_extreme_volatility: boolean;
  volatility_pause_threshold: number;
}

/**
 * Extended flywheel state with new fields for dynamic mode
 */
export interface ExtendedFlywheelState {
  // Existing fields
  user_token_id: string;
  cycle_phase: 'buy' | 'sell';
  buy_count: number;
  sell_count: number;
  sell_phase_token_snapshot: number;
  sell_amount_per_tx: number;
  last_trade_at: string | null;
  consecutive_failures: number;
  last_failure_reason: string | null;
  last_failure_at: string | null;
  paused_until: string | null;
  total_failures: number;
  last_checked_at: string | null;
  last_check_result: string | null;

  // New fields for dynamic mode
  market_condition: MarketCondition;
  previous_market_condition: MarketCondition;
  last_condition_change_at: string | null;
  reserve_balance_sol: number;
  twap_queue: TwapQueueItem[];
}

/**
 * Reserve deployment decision
 */
export interface ReserveDeployment {
  deploy: boolean;
  amount: number;
  reason: string;
}

/**
 * Execution decision from TWAP/VWAP service
 */
export interface ExecutionDecision {
  shouldExecuteNow: boolean;
  executionType: ExecutionStyle;
  tradeAmount: number;
  reason: string;
}

/**
 * Default config values for new fields
 */
export const DEFAULT_EXTENDED_CONFIG: Partial<ExtendedTokenConfig> = {
  // TWAP/VWAP defaults
  twap_enabled: true,
  twap_slices: 5,
  twap_window_minutes: 30,
  twap_threshold_usd: 50,
  vwap_enabled: true,
  vwap_participation_rate: 10,
  vwap_min_volume_usd: 1000,

  // Dynamic mode defaults
  dynamic_fee_enabled: true,
  reserve_percent_normal: 10,
  reserve_percent_adverse: 20,
  min_sell_percent: 10,
  max_sell_percent: 30,
  buyback_boost_on_dump: true,
  pause_on_extreme_volatility: true,
  volatility_pause_threshold: 15,
};

/**
 * Default flywheel state values for new fields
 */
export const DEFAULT_EXTENDED_STATE: Partial<ExtendedFlywheelState> = {
  market_condition: 'normal',
  previous_market_condition: 'normal',
  last_condition_change_at: null,
  reserve_balance_sol: 0,
  twap_queue: [],
};
