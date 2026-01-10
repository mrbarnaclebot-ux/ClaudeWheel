'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface UserProfile {
    id: string;
    privy_did: string;
    telegram_id: number;
    telegram_username?: string;
    created_at: string;
}

export default function SettingsPage() {
    const { getAccessToken, logout } = usePrivy();
    const { wallets } = useWallets();
    const { user: telegramUser, hapticFeedback } = useTelegram();

    const devWallet = wallets[0];
    const opsWallet = wallets[1];

    // Fetch user profile
    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const token = await getAccessToken();
            const res = await api.get('/api/privy/profile', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data as UserProfile;
        },
    });

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        hapticFeedback('light');
    };

    const handleLogout = async () => {
        hapticFeedback('medium');
        await logout();
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/dashboard"
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                >
                    ←
                </Link>
                <div>
                    <h1 className="text-xl font-bold">Settings</h1>
                    <p className="text-sm text-gray-400">Manage your account</p>
                </div>
            </div>

            {/* Profile Section */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-3xl">
                        {telegramUser?.firstName?.[0] || '👤'}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">
                            {telegramUser?.firstName} {telegramUser?.lastName}
                        </h2>
                        {telegramUser?.username && (
                            <p className="text-sm text-gray-400">@{telegramUser.username}</p>
                        )}
                    </div>
                </div>

                {!isLoading && profile && (
                    <div className="border-t border-gray-700 pt-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Member since</span>
                            <span>{formatDate(profile.created_at)}</span>
                        </div>
                        {profile.telegram_id && (
                            <div className="flex justify-between">
                                <span className="text-gray-400">Telegram ID</span>
                                <span className="font-mono">{profile.telegram_id}</span>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>

            {/* Wallets Section */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-4">Your Wallets</h3>
                <div className="space-y-4">
                    {devWallet && (
                        <div
                            onClick={() => copyToClipboard(devWallet.address)}
                            className="cursor-pointer hover:bg-gray-700/50 rounded-lg p-3 -m-1 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">Dev Wallet</span>
                                <span className="text-xs text-gray-400">Tap to copy</span>
                            </div>
                            <p className="font-mono text-sm text-green-400 break-all">{devWallet.address}</p>
                        </div>
                    )}
                    {opsWallet && (
                        <div
                            onClick={() => copyToClipboard(opsWallet.address)}
                            className="cursor-pointer hover:bg-gray-700/50 rounded-lg p-3 -m-1 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">Ops Wallet</span>
                                <span className="text-xs text-gray-400">Tap to copy</span>
                            </div>
                            <p className="font-mono text-sm text-green-400 break-all">{opsWallet.address}</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Platform Info */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-4">Platform Info</h3>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Fee Split</span>
                        <span>90% to you, 10% platform</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Auto-claim Threshold</span>
                        <span>0.15 SOL</span>
                    </div>
                </div>
            </motion.div>

            {/* Links */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3 mb-6"
            >
                <a
                    href="https://claudewheel.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-gray-800/50 hover:bg-gray-700/50 rounded-xl p-4 transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span>Web Dashboard</span>
                        <span className="text-gray-400">→</span>
                    </div>
                </a>
            </motion.div>

            {/* Logout Button */}
            <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onClick={handleLogout}
                className="w-full bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400 rounded-xl py-4 font-medium transition-colors"
            >
                Disconnect
            </motion.button>

            {/* Version */}
            <p className="text-center text-xs text-gray-600 mt-6">
                ClaudeWheel TMA v1.0.0
            </p>
        </div>
    );
}
