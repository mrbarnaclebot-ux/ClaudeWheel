'use client';

// Force dynamic rendering - this page uses Privy hooks which require runtime
export const dynamic = 'force-dynamic';

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

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold">ClaudeWheel</h1>
                    <p className="text-sm text-gray-400">
                        Hey, {telegramUser?.firstName || 'there'}!
                    </p>
                </div>
                <Link
                    href="/settings"
                    onClick={handleLinkClick}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                >
                    ⚙️
                </Link>
            </div>

            {/* Wallets Overview */}
            {(devWallet || opsWallet) && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-800/50 rounded-xl p-4 mb-6"
                >
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Your Wallets</h2>
                    <div className="space-y-2">
                        {devWallet && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Dev Wallet</span>
                                <p className="text-green-400 font-mono text-xs truncate max-w-[200px]">
                                    {devWallet.address}
                                </p>
                            </div>
                        )}
                        {opsWallet && (
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Ops Wallet</span>
                                <p className="text-green-400 font-mono text-xs truncate max-w-[200px]">
                                    {opsWallet.address}
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <Link
                    href="/launch"
                    onClick={handleLinkClick}
                    className="bg-green-600 hover:bg-green-500 rounded-xl p-4 text-center transition-colors"
                >
                    <div className="text-2xl mb-1">🚀</div>
                    <div className="font-medium">Launch Token</div>
                </Link>
                <Link
                    href="/register"
                    onClick={handleLinkClick}
                    className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 text-center transition-colors"
                >
                    <div className="text-2xl mb-1">📝</div>
                    <div className="font-medium">Register Token</div>
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
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-green-400">{tokens.length}</p>
                        <p className="text-xs text-gray-400">Tokens</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-green-400">
                            {tokens.filter(t => t.config?.flywheel_active).length}
                        </p>
                        <p className="text-xs text-gray-400">Active</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-green-400">
                            {tokens.filter(t => !t.config?.flywheel_active).length}
                        </p>
                        <p className="text-xs text-gray-400">Paused</p>
                    </div>
                </motion.div>
            )}

            {/* Tokens List */}
            <div className="space-y-3">
                <h2 className="text-lg font-medium">Your Tokens</h2>

                {isLoading ? (
                    <div className="bg-gray-800/50 rounded-xl p-8 text-center">
                        <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
                    </div>
                ) : tokens?.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-gray-800/50 rounded-xl p-8 text-center"
                    >
                        <p className="text-gray-400 mb-4">No tokens yet</p>
                        <Link
                            href="/launch"
                            onClick={handleLinkClick}
                            className="text-green-400 hover:text-green-300"
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
    onLinkClick
}: {
    token: Token;
    index: number;
    onLinkClick: () => void;
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
                className="block bg-gray-800/50 rounded-xl p-4 hover:bg-gray-800/70 transition-colors"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {token.token_image ? (
                            <img
                                src={token.token_image}
                                alt={token.token_symbol}
                                className="w-10 h-10 rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-lg font-bold">
                                {token.token_symbol[0]}
                            </div>
                        )}
                        <div>
                            <div className="font-medium">{token.token_symbol}</div>
                            <div className="text-sm text-gray-400">
                                {token.config?.flywheel_active ? (
                                    <span className="text-green-400">● Active</span>
                                ) : (
                                    <span className="text-gray-500">○ Paused</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-400">Balance</div>
                        <div className="font-mono text-sm">
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
