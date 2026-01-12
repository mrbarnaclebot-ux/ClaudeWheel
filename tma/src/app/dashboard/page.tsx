'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
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
    };
    balance?: {
        dev_sol: number;
        ops_sol: number;
        token_balance: number;
    };
}

export default function DashboardPage() {
    const { getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const { user: telegramUser, hapticFeedback } = useTelegram();

    // useSolanaWallets already returns only Solana wallets
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

    return (
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-text-primary wood-text">ClaudeWheel</h1>
                    <p className="text-sm text-text-muted">
                        Hey, {telegramUser?.firstName || 'there'}!
                    </p>
                </div>
                <Link
                    href="/settings"
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
                                <p className="text-accent-primary font-mono text-xs truncate max-w-[200px]">
                                    {devWallet.address}
                                </p>
                            </div>
                        )}
                        {opsWallet && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-muted">Ops Wallet</span>
                                <p className="text-accent-primary font-mono text-xs truncate max-w-[200px]">
                                    {opsWallet.address}
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <Link
                    href="/launch"
                    onClick={handleLinkClick}
                    className="bg-accent-primary hover:bg-accent-secondary text-bg-void rounded-xl p-4 text-center transition-all btn-press hover:shadow-wood-glow"
                >
                    <div className="text-2xl mb-1">🚀</div>
                    <div className="font-medium text-sm">Launch</div>
                </Link>
                <Link
                    href="/mm"
                    onClick={handleLinkClick}
                    className="bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void rounded-xl p-4 text-center transition-all btn-press"
                >
                    <div className="text-2xl mb-1">📈</div>
                    <div className="font-medium text-sm">MM Mode</div>
                </Link>
                <Link
                    href="/register"
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

            {/* Tokens List */}
            <div className="space-y-3">
                <h2 className="text-lg font-medium text-text-primary">Your Tokens</h2>

                {isLoading ? (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center">
                        <div className="animate-spin w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full mx-auto" />
                    </div>
                ) : tokens?.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center"
                    >
                        <div className="text-3xl mb-3">🎡</div>
                        <p className="text-text-muted mb-4">No tokens yet</p>
                        <Link
                            href="/launch"
                            onClick={handleLinkClick}
                            className="text-accent-primary hover:text-accent-secondary transition-colors"
                        >
                            Launch your first token →
                        </Link>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                    >
                        {tokens?.map((token, index) => (
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
                href={`/token/${token.id}`}
                onClick={onLinkClick}
                className="block bg-bg-card border border-border-subtle rounded-xl p-4 hover:border-border-accent hover:bg-bg-card-hover transition-all"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {token.token_image ? (
                            <img
                                src={token.token_image}
                                alt={token.token_symbol}
                                className="w-10 h-10 rounded-full object-cover border-2 border-border-accent"
                            />
                        ) : (
                            <div className="w-10 h-10 bg-bg-secondary border-2 border-border-accent rounded-full flex items-center justify-center text-lg font-bold text-accent-primary">
                                {token.token_symbol[0]}
                            </div>
                        )}
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
