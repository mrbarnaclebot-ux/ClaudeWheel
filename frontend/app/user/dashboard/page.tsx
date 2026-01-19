'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivyWrapper, useWalletsWrapper } from '@/app/hooks/usePrivyWrapper';
import { useTelegram } from '@/app/components/WebProvider';
import { WalletAddress, TokenAvatar, SkeletonCard, EmptyState, TotalFeesCard, SourceBadge } from '@/app/components/user';
import { useState, useMemo } from 'react';
import { api } from '@/app/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Token {
    id: string;
    token_mint: string;
    token_name: string;
    token_symbol: string;
    token_image?: string;
    token_source?: 'launched' | 'registered' | 'mm_only';
    config?: {
        flywheel_active: boolean;
        algorithm_mode?: string;
    };
    balance?: {
        dev_sol: number;
        ops_sol: number;
        token_balance: number;
    };
}

type SourceFilter = 'all' | 'launched' | 'registered' | 'mm_only';

export default function DashboardPage() {
    const { getAccessToken, user } = usePrivyWrapper();
    const { wallets } = useWalletsWrapper();
    const { hapticFeedback } = useTelegram();
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

    // Get Solana wallets
    const devWallet = wallets[0];
    const opsWallet = wallets[1];

    const { data: tokens, isLoading } = useQuery({
        queryKey: ['tokens'],
        queryFn: async () => {
            const token = await getAccessToken();
            const res = await api.get('/api/privy/tokens', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data.tokens as Token[];
        },
    });

    const handleLinkClick = () => {
        hapticFeedback('light');
    };

    // Filter tokens by source
    const filteredTokens = useMemo(() => {
        if (!tokens) return [];
        if (sourceFilter === 'all') return tokens;
        return tokens.filter(t => t.token_source === sourceFilter);
    }, [tokens, sourceFilter]);

    // Token counts by source
    const tokenCounts = useMemo(() => {
        if (!tokens) return { launched: 0, registered: 0, mm_only: 0 };
        return {
            launched: tokens.filter(t => t.token_source === 'launched').length,
            registered: tokens.filter(t => t.token_source === 'registered').length,
            mm_only: tokens.filter(t => t.token_source === 'mm_only').length,
        };
    }, [tokens]);

    const getSourceBadge = (source?: string) => {
        switch (source) {
            case 'launched':
                return { label: 'Launched', class: 'badge-success' };
            case 'registered':
                return { label: 'Registered', class: 'badge-accent' };
            case 'mm_only':
                return { label: 'MM Only', class: 'badge-warning' };
            default:
                return null;
        }
    };

    // Get user display name from Privy user
    const displayName = user?.email?.address?.split('@')[0] || user?.google?.name || 'there';

    return (
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-text-primary wood-text">ClaudeWheel</h1>
                    <p className="text-sm text-text-muted">
                        Hey, {displayName}!
                    </p>
                </div>
                <Link
                    href="/user/settings"
                    onClick={handleLinkClick}
                    className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center hover:border-border-accent transition-colors"
                >
                    ⚙️
                </Link>
            </div>

            {/* Wallets Overview */}
            {(devWallet || opsWallet) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
                >
                    <h2 className="text-sm font-medium text-text-muted mb-3">Your Wallets</h2>
                    <div className="space-y-2">
                        {devWallet && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-muted">Dev Wallet</span>
                                <WalletAddress address={devWallet.address} />
                            </div>
                        )}
                        {opsWallet && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-muted">Ops Wallet</span>
                                <WalletAddress address={opsWallet.address} />
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <Link
                    href="/user/launch"
                    onClick={handleLinkClick}
                    className="bg-accent-primary hover:bg-accent-secondary text-bg-void rounded-xl p-4 text-center transition-all btn-press hover:shadow-wood-glow"
                >
                    <div className="text-2xl mb-1">🚀</div>
                    <div className="font-medium text-sm">Launch</div>
                </Link>
                <Link
                    href="/user/mm"
                    onClick={handleLinkClick}
                    className="bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void rounded-xl p-4 text-center transition-all btn-press"
                >
                    <div className="text-2xl mb-1">📈</div>
                    <div className="font-medium text-sm">MM Mode</div>
                </Link>
                <Link
                    href="/user/register"
                    onClick={handleLinkClick}
                    className="bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-4 text-center transition-all btn-press"
                >
                    <div className="text-2xl mb-1">📝</div>
                    <div className="font-medium text-sm">Register</div>
                </Link>
            </div>

            {/* Stats Summary */}
            {tokens && tokens.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-3 gap-3 mb-6"
                >
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-accent-primary font-mono">{tokens.length}</p>
                        <p className="text-xs text-text-muted">Tokens</p>
                    </div>
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-success font-mono">
                            {tokens.filter(t => t.config?.flywheel_active).length}
                        </p>
                        <p className="text-xs text-text-muted">Active</p>
                    </div>
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-text-secondary font-mono">
                            {tokens.filter(t => !t.config?.flywheel_active).length}
                        </p>
                        <p className="text-xs text-text-muted">Paused</p>
                    </div>
                </motion.div>
            )}

            {/* Total Fees Card */}
            {tokens && tokens.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="mb-6"
                >
                    <TotalFeesCard
                        totalClaimable={tokens.reduce((sum, t) => sum + (t.balance?.dev_sol || 0), 0)}
                        tokenCount={tokens.length}
                    />
                </motion.div>
            )}

            {/* Tokens List */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-text-primary">Your Tokens</h2>
                    {tokens && tokens.length > 0 && (
                        <span className="text-xs text-text-muted">
                            {filteredTokens.length} of {tokens.length}
                        </span>
                    )}
                </div>

                {/* Source Filter Tabs */}
                {tokens && tokens.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                    >
                        <button
                            onClick={() => { setSourceFilter('all'); hapticFeedback('light'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                                sourceFilter === 'all'
                                    ? 'bg-accent-primary text-bg-void'
                                    : 'bg-bg-card border border-border-subtle text-text-muted hover:border-border-accent'
                            }`}
                        >
                            All ({tokens.length})
                        </button>
                        <button
                            onClick={() => { setSourceFilter('launched'); hapticFeedback('light'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                                sourceFilter === 'launched'
                                    ? 'bg-success text-bg-void'
                                    : 'bg-bg-card border border-border-subtle text-text-muted hover:border-border-accent'
                            }`}
                        >
                            Launched ({tokenCounts.launched})
                        </button>
                        <button
                            onClick={() => { setSourceFilter('registered'); hapticFeedback('light'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                                sourceFilter === 'registered'
                                    ? 'bg-accent-cyan text-bg-void'
                                    : 'bg-bg-card border border-border-subtle text-text-muted hover:border-border-accent'
                            }`}
                        >
                            Registered ({tokenCounts.registered})
                        </button>
                        <button
                            onClick={() => { setSourceFilter('mm_only'); hapticFeedback('light'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                                sourceFilter === 'mm_only'
                                    ? 'bg-warning text-bg-void'
                                    : 'bg-bg-card border border-border-subtle text-text-muted hover:border-border-accent'
                            }`}
                        >
                            MM Only ({tokenCounts.mm_only})
                        </button>
                    </motion.div>
                )}

                {isLoading ? (
                    <SkeletonCard count={3} />
                ) : tokens?.length === 0 ? (
                    <EmptyState
                        icon="🎡"
                        title="No tokens yet"
                        description="Launch your first token in under 2 minutes. We'll handle the trading for you."
                        primaryAction={{
                            label: 'Launch Your First Token',
                            href: '/user/launch',
                            icon: '🚀',
                        }}
                        secondaryAction={{
                            label: 'Or register existing token',
                            href: '/user/register',
                        }}
                        socialProof="Join creators already trading"
                    />
                ) : filteredTokens.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-bg-card border border-border-subtle rounded-xl p-6 text-center"
                    >
                        <p className="text-text-muted text-sm">
                            No {sourceFilter === 'launched' ? 'launched' : sourceFilter === 'registered' ? 'registered' : 'MM only'} tokens found
                        </p>
                        <button
                            onClick={() => setSourceFilter('all')}
                            className="mt-2 text-accent-primary text-sm hover:underline"
                        >
                            View all tokens
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                    >
                        {filteredTokens.map((token, index) => (
                            <TokenCard
                                key={token.id}
                                token={token}
                                index={index}
                                onLinkClick={handleLinkClick}
                                sourceBadge={getSourceBadge(token.token_source)}
                            />
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    );
}

function TokenCard({
    token,
    index,
    onLinkClick,
    sourceBadge
}: {
    token: Token;
    index: number;
    onLinkClick: () => void;
    sourceBadge: { label: string; class: string } | null;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
        >
            <Link
                href={`/user/token/${token.id}`}
                onClick={onLinkClick}
                className="block bg-bg-card border border-border-subtle rounded-xl p-4 hover:border-border-accent hover:bg-bg-card-hover transition-all"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TokenAvatar
                            symbol={token.token_symbol}
                            imageUrl={token.token_image}
                            size="md"
                        />
                        <div>
                            <div className="font-medium text-text-primary flex items-center gap-2">
                                {token.token_symbol}
                                {sourceBadge && (
                                    <span className={`badge text-[10px] py-0 px-1.5 ${sourceBadge.class}`}>
                                        {sourceBadge.label}
                                    </span>
                                )}
                            </div>
                            <div className="text-sm flex items-center gap-1.5">
                                {token.config?.flywheel_active ? (
                                    <>
                                        <span className="status-dot active" />
                                        <span className="text-success">Active</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="w-2 h-2 rounded-full bg-text-muted" />
                                        <span className="text-text-muted">Paused</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-text-muted">Balance</div>
                        <div className="font-mono text-sm text-text-primary">
                            {token.balance?.dev_sol !== undefined
                                ? `${token.balance.dev_sol.toFixed(3)} SOL`
                                : '—'
                            }
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
