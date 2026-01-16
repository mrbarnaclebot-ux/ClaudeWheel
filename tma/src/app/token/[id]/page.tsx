'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface TokenDetails {
    id: string;
    token_mint_address: string;
    token_name: string;
    token_symbol: string;
    token_image?: string;
    token_decimals: number;
    token_source?: 'launched' | 'registered' | 'mm_only';
    is_active: boolean;
    is_graduated: boolean;
    created_at: string;
    dev_wallet: {
        wallet_address: string;
    };
    ops_wallet: {
        wallet_address: string;
    };
    config: {
        flywheel_active: boolean;
        auto_claim_enabled: boolean;
        algorithm_mode: string;
        min_buy_amount_sol: number;
        max_buy_amount_sol: number;
        slippage_bps: number;
        trading_route: string;

        // Turbo Lite configuration
        turbo_job_interval_seconds?: number;
        turbo_cycle_size_buys?: number;
        turbo_cycle_size_sells?: number;
        turbo_inter_token_delay_ms?: number;
        turbo_global_rate_limit?: number;
        turbo_confirmation_timeout?: number;
        turbo_batch_state_updates?: boolean;
    };
    state?: {
        cycle_phase: string;
        buy_count: number;
        sell_count: number;
        last_trade_at?: string;
        consecutive_failures: number;
    };
    balance?: {
        dev_sol: number;
        ops_sol: number;
        token_balance: number;
    };
    stats?: {
        total_trades: number;
        total_fees_claimed: number;
    };
}

interface Transaction {
    id: string;
    type: 'buy' | 'sell' | 'transfer' | 'claim';
    amount: number;
    amountUsd?: number;
    signature: string;
    status: string;
    inputMint?: string;
    outputMint?: string;
    inputAmount?: number;
    outputAmount?: number;
    pricePerToken?: number;
    created_at: string;
}

interface TransactionsResponse {
    transactions: Transaction[];
    total: number;
    limit: number;
    offset: number;
}

export default function TokenDetailPage() {
    const params = useParams();
    const tokenId = params.id as string;
    const queryClient = useQueryClient();
    const { getAccessToken } = usePrivy();
    const { hapticFeedback } = useTelegram();

    const [showSettings, setShowSettings] = useState(false);
    const [showDevBuyActions, setShowDevBuyActions] = useState(false);
    const [devBuyAction, setDevBuyAction] = useState<'burn' | 'sell' | 'transfer' | null>(null);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [withdrawAddress, setWithdrawAddress] = useState('');
    const [transactionPage, setTransactionPage] = useState(0);
    const TRANSACTIONS_PER_PAGE = 10;

    // Fetch token details
    const { data: token, isLoading, error } = useQuery({
        queryKey: ['token', tokenId],
        queryFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.get(`/api/privy/tokens/${tokenId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data as TokenDetails;
        },
        enabled: !!tokenId,
    });

    // Fetch transactions with pagination
    const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery({
        queryKey: ['token-transactions', tokenId, transactionPage],
        queryFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.get(`/api/privy/tokens/${tokenId}/transactions`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    limit: TRANSACTIONS_PER_PAGE,
                    offset: transactionPage * TRANSACTIONS_PER_PAGE,
                },
            });
            // Backend wraps response in { success, data }
            return (res.data.data || res.data) as TransactionsResponse;
        },
        enabled: !!tokenId,
    });

    // Toggle flywheel
    const toggleFlywheelMutation = useMutation({
        mutationFn: async (active: boolean) => {
            const accessToken = await getAccessToken();
            await api.put(`/api/privy/tokens/${tokenId}/config`, {
                flywheel_active: active,
            }, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['token', tokenId] });
            queryClient.invalidateQueries({ queryKey: ['tokens'] });
            hapticFeedback('medium');
        },
        onError: () => {
            hapticFeedback('heavy');
        },
    });

    // Fetch dev wallet token balance for dev buy actions
    const { data: devBuyBalance } = useQuery({
        queryKey: ['devbuy-balance', tokenId],
        queryFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.get(`/api/privy/launches/devbuy-balance/${tokenId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data.data as { devTokenBalance: number; opsSolBalance: number; tokenSymbol: string };
        },
        enabled: !!tokenId,
        refetchInterval: 30000,
    });

    // Dev buy action mutation
    const devBuyActionMutation = useMutation({
        mutationFn: async (action: 'burn' | 'sell' | 'transfer') => {
            const accessToken = await getAccessToken();
            const res = await api.post('/api/privy/launches/devbuy-action', {
                tokenId,
                action,
            }, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['token', tokenId] });
            queryClient.invalidateQueries({ queryKey: ['devbuy-balance', tokenId] });
            hapticFeedback('heavy');
            setDevBuyAction(null);
            setShowDevBuyActions(false);
        },
        onError: () => {
            hapticFeedback('heavy');
        },
    });

    // MM Withdraw mutation (mm_only tokens only)
    const withdrawMutation = useMutation({
        mutationFn: async (destinationAddress: string) => {
            const accessToken = await getAccessToken();
            const res = await api.post(`/api/privy/mm/${tokenId}/withdraw`, {
                destinationAddress,
            }, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['token', tokenId] });
            queryClient.invalidateQueries({ queryKey: ['tokens'] });
            hapticFeedback('heavy');
            setShowWithdraw(false);
        },
        onError: () => {
            hapticFeedback('heavy');
        },
    });

    const handleToggleFlywheel = () => {
        if (token) {
            toggleFlywheelMutation.mutate(!token.config.flywheel_active);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        hapticFeedback('light');
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'buy': return '↓';
            case 'sell': return '↑';
            case 'transfer': return '→';
            case 'claim': return '◆';
            default: return '•';
        }
    };

    const getTransactionColor = (type: string) => {
        switch (type) {
            case 'buy': return 'bg-success/20 text-success border-success/30';
            case 'sell': return 'bg-error/20 text-error border-error/30';
            case 'transfer': return 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30';
            case 'claim': return 'bg-accent-primary/20 text-accent-primary border-accent-primary/30';
            default: return 'bg-bg-card text-text-secondary';
        }
    };

    const getAlgorithmDisplay = (mode: string): string => {
        switch (mode) {
            case 'simple':
                return '🐢 Simple';
            case 'turbo_lite':
                return '🚀 Turbo Lite';
            case 'rebalance':
                return '⚖️ Rebalance';
            default:
                // Fallback: capitalize and replace underscores with spaces
                return mode.charAt(0).toUpperCase() + mode.slice(1).replace(/_/g, ' ');
        }
    };

    const getCycleSize = () => {
        if (token?.config.algorithm_mode === 'turbo_lite') {
            // For turbo mode, show actual configured cycle size (default 8)
            return token.config.turbo_cycle_size_buys || 8;
        }
        return 5; // Simple mode default
    };

    const totalPages = transactionsData ? Math.ceil(transactionsData.total / TRANSACTIONS_PER_PAGE) : 0;
    const transactions = transactionsData?.transactions || [];

    if (isLoading) {
        return (
            <div className="min-h-screen p-4 flex items-center justify-center bg-void">
                <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error || !token) {
        return (
            <div className="min-h-screen p-4 bg-void">
                <div className="bg-error/20 border border-error/50 rounded-xl p-4 text-error text-center">
                    <p>Failed to load token details</p>
                    <Link href="/dashboard" className="text-accent-primary mt-4 block">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-void p-4 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/dashboard"
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-accent transition-colors"
                >
                    ←
                </Link>
                <div className="flex-1 flex items-center gap-3">
                    {token.token_image ? (
                        <img
                            src={token.token_image}
                            alt={token.token_symbol}
                            className="w-12 h-12 rounded-full object-cover border-2 border-border-accent"
                        />
                    ) : (
                        <div className="w-12 h-12 bg-bg-card border-2 border-border-accent rounded-full flex items-center justify-center text-xl font-bold text-accent-primary">
                            {token.token_symbol[0]}
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-bold text-text-primary">{token.token_name}</h1>
                        <p className="text-sm text-text-muted">${token.token_symbol}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center hover:border-border-accent transition-colors"
                >
                    ⚙️
                </button>
            </div>

            {/* Status Banner */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-4 mb-6 border ${
                    token.config.flywheel_active
                        ? 'bg-success/10 border-success/30'
                        : 'bg-bg-card border-border-subtle'
                }`}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className={`font-medium flex items-center gap-2 ${token.config.flywheel_active ? 'text-success' : 'text-text-secondary'}`}>
                            <span className={`status-dot ${token.config.flywheel_active ? 'active' : ''}`} />
                            {token.config.flywheel_active ? 'Flywheel Active' : 'Flywheel Paused'}
                        </p>
                        <p className="text-sm text-text-muted mt-1">
                            {token.state?.cycle_phase === 'buy'
                                ? `Buy phase (${token.state.buy_count || 0}/${getCycleSize()})`
                                : `Sell phase (${token.state?.sell_count || 0}/${getCycleSize()})`
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleToggleFlywheel}
                        disabled={toggleFlywheelMutation.isPending}
                        className={`px-4 py-2 rounded-lg font-medium transition-all btn-press ${
                            token.config.flywheel_active
                                ? 'bg-error hover:bg-error/80 text-white'
                                : 'bg-accent-primary hover:bg-accent-secondary text-bg-void'
                        }`}
                    >
                        {toggleFlywheelMutation.isPending
                            ? '...'
                            : token.config.flywheel_active
                            ? 'Pause'
                            : 'Start'
                        }
                    </button>
                </div>
            </motion.div>

            {/* Balance Cards */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 gap-3 mb-6"
            >
                <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-accent-primary font-mono">
                        {devBuyBalance?.devTokenBalance?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-text-muted">Dev Supply</p>
                </div>
                <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-accent-primary font-mono">
                        {devBuyBalance?.opsSolBalance?.toFixed(3) || '0.000'}
                    </p>
                    <p className="text-xs text-text-muted">Ops SOL</p>
                </div>
            </motion.div>

            {/* Dev Buy Actions (only show if tokens in dev wallet) */}
            {devBuyBalance && devBuyBalance.devTokenBalance > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="font-medium text-warning">Dev Buy Tokens</p>
                            <p className="text-sm text-warning/70">
                                {devBuyBalance.devTokenBalance.toLocaleString()} {devBuyBalance.tokenSymbol} in dev wallet
                            </p>
                        </div>
                        <button
                            onClick={() => setShowDevBuyActions(!showDevBuyActions)}
                            className="text-warning text-sm hover:text-warning/80 transition-colors"
                        >
                            {showDevBuyActions ? 'Hide' : 'Manage'}
                        </button>
                    </div>

                    <AnimatePresence>
                        {showDevBuyActions && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3"
                            >
                                <p className="text-xs text-text-muted">
                                    What would you like to do with these tokens?
                                </p>

                                {devBuyAction ? (
                                    <div className="bg-bg-card border border-border-subtle rounded-lg p-3 space-y-3">
                                        <p className="text-sm text-center text-text-primary">
                                            {devBuyAction === 'burn' && '🔥 Burn all tokens permanently?'}
                                            {devBuyAction === 'sell' && '💰 Sell all tokens for SOL?'}
                                            {devBuyAction === 'transfer' && '📤 Transfer all tokens to ops wallet?'}
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setDevBuyAction(null)}
                                                disabled={devBuyActionMutation.isPending}
                                                className="bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg py-2 text-sm text-text-secondary transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => devBuyActionMutation.mutate(devBuyAction)}
                                                disabled={devBuyActionMutation.isPending}
                                                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                                                    devBuyAction === 'burn'
                                                        ? 'bg-error hover:bg-error/80 text-white'
                                                        : devBuyAction === 'sell'
                                                        ? 'bg-success hover:bg-success/80 text-white'
                                                        : 'bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void'
                                                }`}
                                            >
                                                {devBuyActionMutation.isPending ? '...' : 'Confirm'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            onClick={() => setDevBuyAction('burn')}
                                            className="bg-error/10 hover:bg-error/20 border border-error/30 rounded-lg p-3 text-center transition-colors btn-press"
                                        >
                                            <div className="text-lg mb-1">🔥</div>
                                            <div className="text-xs font-medium text-error">Burn</div>
                                        </button>
                                        <button
                                            onClick={() => setDevBuyAction('sell')}
                                            className="bg-success/10 hover:bg-success/20 border border-success/30 rounded-lg p-3 text-center transition-colors btn-press"
                                        >
                                            <div className="text-lg mb-1">💰</div>
                                            <div className="text-xs font-medium text-success">Sell</div>
                                        </button>
                                        <button
                                            onClick={() => setDevBuyAction('transfer')}
                                            className="bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 rounded-lg p-3 text-center transition-colors btn-press"
                                        >
                                            <div className="text-lg mb-1">📤</div>
                                            <div className="text-xs font-medium text-accent-cyan">Transfer</div>
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* MM-Only Withdraw Section */}
            {token.token_source === 'mm_only' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-accent-cyan/10 border border-accent-cyan/30 rounded-xl p-4 mb-6"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="font-medium text-accent-cyan">MM-Only Mode</p>
                            <p className="text-sm text-accent-cyan/70">
                                Withdraw to stop MM and get your SOL back
                            </p>
                        </div>
                        <button
                            onClick={() => setShowWithdraw(!showWithdraw)}
                            className="bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void px-4 py-2 rounded-lg text-sm font-medium transition-colors btn-press"
                        >
                            Withdraw
                        </button>
                    </div>

                    <AnimatePresence>
                        {showWithdraw && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3 mt-4 pt-4 border-t border-accent-cyan/30"
                            >
                                <p className="text-xs text-text-muted">
                                    This will stop the flywheel, sell all tokens, and transfer SOL to your address.
                                </p>

                                <div>
                                    <label className="block text-xs text-text-muted mb-1">Destination Address</label>
                                    <input
                                        type="text"
                                        value={withdrawAddress}
                                        onChange={(e) => setWithdrawAddress(e.target.value.trim())}
                                        placeholder="Enter Solana address..."
                                        className={`w-full bg-bg-secondary border rounded-lg p-3 text-text-primary font-mono text-sm placeholder-text-muted focus:outline-none focus:ring-2 ${
                                            withdrawAddress.length > 0 && (withdrawAddress.length < 32 || withdrawAddress.length > 44)
                                                ? 'focus:ring-error border-error/50'
                                                : 'focus:ring-accent-primary border-border-subtle'
                                        }`}
                                    />
                                    {withdrawAddress.length > 0 && (withdrawAddress.length < 32 || withdrawAddress.length > 44) && (
                                        <p className="text-xs text-error mt-1">Invalid address format (32-44 characters)</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => {
                                            setShowWithdraw(false);
                                            setWithdrawAddress('');
                                        }}
                                        disabled={withdrawMutation.isPending}
                                        className="bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg py-3 text-sm text-text-secondary transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => withdrawMutation.mutate(withdrawAddress)}
                                        disabled={withdrawMutation.isPending || withdrawAddress.length < 32 || withdrawAddress.length > 44}
                                        className="bg-accent-cyan hover:bg-accent-cyan/80 disabled:bg-bg-secondary disabled:text-text-muted rounded-lg py-3 text-sm font-medium text-bg-void transition-colors"
                                    >
                                        {withdrawMutation.isPending ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <span className="animate-spin w-4 h-4 border-2 border-bg-void border-t-transparent rounded-full" />
                                                Withdrawing...
                                            </span>
                                        ) : (
                                            'Confirm Withdraw'
                                        )}
                                    </button>
                                </div>

                                {withdrawMutation.isError && (
                                    <p className="text-xs text-error">
                                        {(withdrawMutation.error as any)?.response?.data?.error || 'Withdraw failed. Please try again.'}
                                    </p>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-6"
            >
                <a
                    href={`https://bags.fm/token/${token.token_mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-4 text-center transition-all hover:shadow-wood-glow"
                >
                    <div className="text-xl mb-1">🔗</div>
                    <div className="text-sm font-medium text-text-primary">View on Bags.fm</div>
                </a>
            </motion.div>

            {/* Wallet Addresses */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6 space-y-3"
            >
                <h3 className="font-medium text-text-secondary text-sm">Wallet Addresses</h3>
                <div
                    onClick={() => copyToClipboard(token.dev_wallet.wallet_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-bg-card-hover rounded p-2 -m-2 transition-colors"
                >
                    <span className="text-sm text-text-muted">Dev</span>
                    <span className="font-mono text-xs text-accent-primary truncate max-w-[200px]">
                        {token.dev_wallet.wallet_address}
                    </span>
                </div>
                <div
                    onClick={() => copyToClipboard(token.ops_wallet.wallet_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-bg-card-hover rounded p-2 -m-2 transition-colors"
                >
                    <span className="text-sm text-text-muted">Ops</span>
                    <span className="font-mono text-xs text-accent-primary truncate max-w-[200px]">
                        {token.ops_wallet.wallet_address}
                    </span>
                </div>
                <div
                    onClick={() => copyToClipboard(token.token_mint_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-bg-card-hover rounded p-2 -m-2 transition-colors"
                >
                    <span className="text-sm text-text-muted">Mint</span>
                    <span className="font-mono text-xs text-accent-primary truncate max-w-[200px]">
                        {token.token_mint_address}
                    </span>
                </div>
            </motion.div>

            {/* Settings Panel (expandable) */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6 space-y-4"
                    >
                        <h3 className="font-medium text-text-primary">Settings</h3>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-text-muted">Auto-claim</p>
                                <p className={token.config.auto_claim_enabled ? 'text-success' : 'text-text-muted'}>
                                    {token.config.auto_claim_enabled ? 'Enabled' : 'Disabled'}
                                </p>
                            </div>
                            <div>
                                <p className="text-text-muted">Algorithm</p>
                                <p className="text-text-primary">{getAlgorithmDisplay(token.config.algorithm_mode)}</p>
                            </div>
                        </div>

                        <Link
                            href={`/token/${tokenId}/settings`}
                            onClick={() => hapticFeedback('light')}
                            className="block w-full bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-xl py-3 text-center font-medium text-text-primary transition-colors"
                        >
                            Edit Settings
                        </Link>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transaction History */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-text-primary">Trade History</h3>
                    {transactionsData && transactionsData.total > 0 && (
                        <span className="text-xs text-text-muted bg-bg-card px-2 py-1 rounded">
                            {transactionsData.total} total
                        </span>
                    )}
                </div>

                {isLoadingTransactions ? (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center">
                        <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full mx-auto" />
                    </div>
                ) : !transactions || transactions.length === 0 ? (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-6 text-center text-text-muted">
                        <div className="text-2xl mb-2">📊</div>
                        <p>No trades yet</p>
                        <p className="text-xs mt-1">Trades will appear here once the flywheel starts</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {transactions.map((tx, index) => (
                                <motion.div
                                    key={tx.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className="bg-bg-card border border-border-subtle rounded-xl p-3 hover:border-border-accent transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border ${getTransactionColor(tx.type)}`}>
                                                {getTransactionIcon(tx.type)}
                                            </div>
                                            <div>
                                                <p className="font-medium capitalize text-text-primary text-sm">{tx.type}</p>
                                                <p className="text-xs text-text-muted">
                                                    {formatTimeAgo(tx.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono text-sm text-text-primary">
                                                {typeof tx.amount === 'number' ? tx.amount.toFixed(4) : tx.amount} SOL
                                            </p>
                                            {tx.signature && (
                                                <a
                                                    href={`https://solscan.io/tx/${tx.signature}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-xs text-accent-primary hover:text-accent-secondary transition-colors"
                                                >
                                                    View tx →
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
                                <button
                                    onClick={() => {
                                        setTransactionPage(p => Math.max(0, p - 1));
                                        hapticFeedback('light');
                                    }}
                                    disabled={transactionPage === 0}
                                    className="px-3 py-1.5 text-sm bg-bg-card border border-border-subtle rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:border-border-accent transition-colors text-text-secondary"
                                >
                                    ← Prev
                                </button>
                                <span className="text-xs text-text-muted">
                                    Page {transactionPage + 1} of {totalPages}
                                </span>
                                <button
                                    onClick={() => {
                                        setTransactionPage(p => Math.min(totalPages - 1, p + 1));
                                        hapticFeedback('light');
                                    }}
                                    disabled={transactionPage >= totalPages - 1}
                                    className="px-3 py-1.5 text-sm bg-bg-card border border-border-subtle rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:border-border-accent transition-colors text-text-secondary"
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </div>
    );
}
