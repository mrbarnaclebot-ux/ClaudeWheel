'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { useState } from 'react';

interface TokenDetails {
    id: string;
    token_mint_address: string;
    token_name: string;
    token_symbol: string;
    token_image?: string;
    token_decimals: number;
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
    type: 'buy' | 'sell' | 'transfer';
    amount: number;
    signature: string;
    status: string;
    created_at: string;
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

    // Fetch recent transactions
    const { data: transactions } = useQuery({
        queryKey: ['token-transactions', tokenId],
        queryFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.get(`/api/privy/tokens/${tokenId}/transactions`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data.transactions as Transaction[];
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
            return res.data.data as { tokenBalance: number; tokenSymbol: string };
        },
        enabled: !!tokenId,
        refetchInterval: 30000, // Refresh every 30s
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

    // Manual claim
    const claimMutation = useMutation({
        mutationFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.post(`/api/privy/tokens/${tokenId}/claim`, {}, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['token', tokenId] });
            hapticFeedback('medium');
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

    const handleClaim = () => {
        claimMutation.mutate();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        hapticFeedback('light');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen p-4 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error || !token) {
        return (
            <div className="min-h-screen p-4">
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-center">
                    <p>Failed to load token details</p>
                    <Link href="/dashboard" className="text-green-400 mt-4 block">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/dashboard"
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                >
                    ←
                </Link>
                <div className="flex-1 flex items-center gap-3">
                    {token.token_image ? (
                        <img
                            src={token.token_image}
                            alt={token.token_symbol}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                    ) : (
                        <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-xl font-bold">
                            {token.token_symbol[0]}
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-bold">{token.token_name}</h1>
                        <p className="text-sm text-gray-400">${token.token_symbol}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                >
                    ⚙️
                </button>
            </div>

            {/* Status Banner */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-4 mb-6 ${
                    token.config.flywheel_active
                        ? 'bg-green-500/20 border border-green-500/50'
                        : 'bg-gray-800/50'
                }`}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium">
                            {token.config.flywheel_active ? '● Flywheel Active' : '○ Flywheel Paused'}
                        </p>
                        <p className="text-sm text-gray-400">
                            {token.state?.cycle_phase === 'buy'
                                ? `Buy phase (${token.state.buy_count || 0}/5)`
                                : `Sell phase (${token.state?.sell_count || 0}/5)`
                            }
                        </p>
                    </div>
                    <button
                        onClick={handleToggleFlywheel}
                        disabled={toggleFlywheelMutation.isPending}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            token.config.flywheel_active
                                ? 'bg-red-600 hover:bg-red-500'
                                : 'bg-green-600 hover:bg-green-500'
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
                className="grid grid-cols-3 gap-3 mb-6"
            >
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-green-400">
                        {token.balance?.dev_sol?.toFixed(3) || '0.000'}
                    </p>
                    <p className="text-xs text-gray-400">Dev SOL</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-green-400">
                        {token.balance?.ops_sol?.toFixed(3) || '0.000'}
                    </p>
                    <p className="text-xs text-gray-400">Ops SOL</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-green-400">
                        {token.balance?.token_balance?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-gray-400">Tokens</p>
                </div>
            </motion.div>

            {/* Dev Buy Actions (only show if tokens in dev wallet) */}
            {devBuyBalance && devBuyBalance.tokenBalance > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 mb-6"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="font-medium text-yellow-400">Dev Buy Tokens</p>
                            <p className="text-sm text-yellow-400/70">
                                {devBuyBalance.tokenBalance.toLocaleString()} {devBuyBalance.tokenSymbol} in dev wallet
                            </p>
                        </div>
                        <button
                            onClick={() => setShowDevBuyActions(!showDevBuyActions)}
                            className="text-yellow-400 text-sm"
                        >
                            {showDevBuyActions ? 'Hide' : 'Manage'}
                        </button>
                    </div>

                    {showDevBuyActions && (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-400">
                                What would you like to do with these tokens?
                            </p>

                            {/* Confirmation dialog */}
                            {devBuyAction ? (
                                <div className="bg-gray-800/50 rounded-lg p-3 space-y-3">
                                    <p className="text-sm text-center">
                                        {devBuyAction === 'burn' && '🔥 Burn all tokens permanently?'}
                                        {devBuyAction === 'sell' && '💰 Sell all tokens for SOL?'}
                                        {devBuyAction === 'transfer' && '📤 Transfer all tokens to ops wallet?'}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setDevBuyAction(null)}
                                            disabled={devBuyActionMutation.isPending}
                                            className="bg-gray-700 hover:bg-gray-600 rounded-lg py-2 text-sm transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => devBuyActionMutation.mutate(devBuyAction)}
                                            disabled={devBuyActionMutation.isPending}
                                            className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                                                devBuyAction === 'burn'
                                                    ? 'bg-red-600 hover:bg-red-500'
                                                    : devBuyAction === 'sell'
                                                    ? 'bg-green-600 hover:bg-green-500'
                                                    : 'bg-blue-600 hover:bg-blue-500'
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
                                        className="bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded-lg p-3 text-center transition-colors"
                                    >
                                        <div className="text-lg mb-1">🔥</div>
                                        <div className="text-xs font-medium text-red-400">Burn</div>
                                    </button>
                                    <button
                                        onClick={() => setDevBuyAction('sell')}
                                        className="bg-green-600/20 hover:bg-green-600/30 border border-green-600/50 rounded-lg p-3 text-center transition-colors"
                                    >
                                        <div className="text-lg mb-1">💰</div>
                                        <div className="text-xs font-medium text-green-400">Sell</div>
                                    </button>
                                    <button
                                        onClick={() => setDevBuyAction('transfer')}
                                        className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg p-3 text-center transition-colors"
                                    >
                                        <div className="text-lg mb-1">📤</div>
                                        <div className="text-xs font-medium text-blue-400">Transfer</div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-2 gap-3 mb-6"
            >
                <button
                    onClick={handleClaim}
                    disabled={claimMutation.isPending}
                    className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors disabled:opacity-50"
                >
                    <div className="text-xl mb-1">💸</div>
                    <div className="text-sm font-medium">
                        {claimMutation.isPending ? 'Claiming...' : 'Claim Now'}
                    </div>
                </button>
                <a
                    href={`https://bags.fm/token/${token.token_mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors"
                >
                    <div className="text-xl mb-1">🔗</div>
                    <div className="text-sm font-medium">View on Bags.fm</div>
                </a>
            </motion.div>

            {/* Wallet Addresses */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6 space-y-3"
            >
                <h3 className="font-medium text-gray-400">Wallet Addresses</h3>
                <div
                    onClick={() => copyToClipboard(token.dev_wallet.wallet_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-700/50 rounded p-2 -m-2"
                >
                    <span className="text-sm text-gray-400">Dev</span>
                    <span className="font-mono text-xs text-green-400 truncate max-w-[200px]">
                        {token.dev_wallet.wallet_address}
                    </span>
                </div>
                <div
                    onClick={() => copyToClipboard(token.ops_wallet.wallet_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-700/50 rounded p-2 -m-2"
                >
                    <span className="text-sm text-gray-400">Ops</span>
                    <span className="font-mono text-xs text-green-400 truncate max-w-[200px]">
                        {token.ops_wallet.wallet_address}
                    </span>
                </div>
                <div
                    onClick={() => copyToClipboard(token.token_mint_address)}
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-700/50 rounded p-2 -m-2"
                >
                    <span className="text-sm text-gray-400">Mint</span>
                    <span className="font-mono text-xs text-green-400 truncate max-w-[200px]">
                        {token.token_mint_address}
                    </span>
                </div>
            </motion.div>

            {/* Settings Panel (expandable) */}
            {showSettings && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gray-800/50 rounded-xl p-4 mb-6 space-y-4"
                >
                    <h3 className="font-medium">Settings</h3>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-400">Auto-claim</p>
                            <p className={token.config.auto_claim_enabled ? 'text-green-400' : 'text-gray-500'}>
                                {token.config.auto_claim_enabled ? 'Enabled' : 'Disabled'}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-400">Algorithm</p>
                            <p className="capitalize">{token.config.algorithm_mode}</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Min Buy</p>
                            <p>{token.config.min_buy_amount_sol} SOL</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Max Buy</p>
                            <p>{token.config.max_buy_amount_sol} SOL</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Slippage</p>
                            <p>{(token.config.slippage_bps / 100).toFixed(1)}%</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Route</p>
                            <p className="capitalize">{token.config.trading_route}</p>
                        </div>
                    </div>

                    <Link
                        href={`/token/${tokenId}/settings`}
                        onClick={() => hapticFeedback('light')}
                        className="block w-full bg-gray-700 hover:bg-gray-600 rounded-xl py-3 text-center font-medium transition-colors"
                    >
                        Edit Settings
                    </Link>
                </motion.div>
            )}

            {/* Recent Transactions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <h3 className="font-medium mb-3">Recent Activity</h3>
                {!transactions || transactions.length === 0 ? (
                    <div className="bg-gray-800/50 rounded-xl p-6 text-center text-gray-400">
                        No transactions yet
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.slice(0, 5).map((tx) => (
                            <div
                                key={tx.id}
                                className="bg-gray-800/50 rounded-xl p-3 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                        tx.type === 'buy' ? 'bg-green-500/20 text-green-400' :
                                        tx.type === 'sell' ? 'bg-red-500/20 text-red-400' :
                                        'bg-blue-500/20 text-blue-400'
                                    }`}>
                                        {tx.type === 'buy' ? '↓' : tx.type === 'sell' ? '↑' : '→'}
                                    </div>
                                    <div>
                                        <p className="font-medium capitalize">{tx.type}</p>
                                        <p className="text-xs text-gray-400">
                                            {new Date(tx.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono">{tx.amount.toFixed(4)}</p>
                                    <a
                                        href={`https://solscan.io/tx/${tx.signature}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-green-400"
                                    >
                                        View →
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
