'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivy, useSigners } from '@privy-io/react-auth';
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

interface PrivyWalletInfo {
    address: string;
    delegated: boolean;
    imported: boolean;
}

export default function SettingsPage() {
    const { getAccessToken, logout, user: privyUser, ready: privyReady, authenticated } = usePrivy();
    const { wallets } = useWallets();
    const { addSigners } = useSigners();
    const { user: telegramUser, hapticFeedback } = useTelegram();
    const [isDelegating, setIsDelegating] = useState(false);
    const [delegationResult, setDelegationResult] = useState<string | null>(null);

    const devWallet = wallets[0];
    const opsWallet = wallets[1];

    // Debug Privy state
    console.log('[Settings] Privy state:', { privyReady, authenticated, hasUser: !!privyUser });

    // Get all Solana wallets from Privy user object (includes imported wallets)
    const allPrivyWallets: PrivyWalletInfo[] = (privyUser?.linkedAccounts || [])
        .filter((account: any) => account.type === 'wallet' && account.chainType === 'solana')
        .map((account: any) => ({
            address: account.address,
            delegated: account.delegated || false,
            imported: account.imported || false,
        }));

    console.log('[Settings] All Privy wallets:', allPrivyWallets);

    // Find wallets that need delegation
    const undelegatedWallets = allPrivyWallets.filter(w => !w.delegated);
    console.log('[Settings] Undelegated wallets:', undelegatedWallets);

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

    // Add signers to undelegated wallets (new Privy API)
    // Signer ID is the authorization key ID from Privy dashboard
    const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

    const handleDelegateAll = async () => {
        console.log('[Settings] handleDelegateAll called');
        console.log('[Settings] undelegatedWallets:', undelegatedWallets);
        console.log('[Settings] SIGNER_ID:', SIGNER_ID);

        if (!SIGNER_ID) {
            console.error('[Settings] NEXT_PUBLIC_PRIVY_SIGNER_ID not configured');
            alert('Signer ID not configured. Please contact support.');
            return;
        }

        if (undelegatedWallets.length === 0) {
            console.log('[Settings] No undelegated wallets found');
            alert('No undelegated wallets found');
            return;
        }

        // Debug: show what we're about to delegate
        const walletsToDelegate = undelegatedWallets.map(w => w.address.slice(0, 8) + '...').join(', ');
        console.log('[Settings] About to add signers to:', walletsToDelegate);

        setIsDelegating(true);
        setDelegationResult(null);
        hapticFeedback('medium');

        try {
            for (const wallet of undelegatedWallets) {
                console.log('[Settings] Adding signer to wallet:', wallet.address, 'imported:', wallet.imported);
                console.log('[Settings] Calling addSigners with signerId:', SIGNER_ID);

                // Add timeout to detect if it hangs
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Add signer timed out after 30s')), 30000)
                );

                // New Privy API: addSigners instead of delegateWallet
                const addSignerPromise = addSigners({
                    address: wallet.address,
                    signers: [{ signerId: SIGNER_ID, policyIds: [] }],
                });

                const result = await Promise.race([addSignerPromise, timeoutPromise]);

                console.log('[Settings] addSigners returned:', result);
            }
            console.log('[Settings] All signers added successfully');
            setDelegationResult('success');
            hapticFeedback('heavy');
        } catch (error: any) {
            console.error('[Settings] Add signer failed:', error);
            console.error('[Settings] Error message:', error?.message);
            console.error('[Settings] Error stack:', error?.stack);
            setDelegationResult('error');
            hapticFeedback('heavy');
        } finally {
            console.log('[Settings] Add signer complete, setting isDelegating to false');
            setIsDelegating(false);
        }
    };

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
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/dashboard"
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-accent transition-colors"
                >
                    ←
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-text-primary">Settings</h1>
                    <p className="text-sm text-text-muted">Manage your account</p>
                </div>
            </div>

            {/* Profile Section */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
            >
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-accent-primary/20 border-2 border-border-accent rounded-full flex items-center justify-center text-3xl text-accent-primary">
                        {telegramUser?.firstName?.[0] || '👤'}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">
                            {telegramUser?.firstName} {telegramUser?.lastName}
                        </h2>
                        {telegramUser?.username && (
                            <p className="text-sm text-text-muted">@{telegramUser.username}</p>
                        )}
                    </div>
                </div>

                {!isLoading && profile && (
                    <div className="border-t border-border-subtle pt-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-text-muted">Member since</span>
                            <span className="text-text-primary">{formatDate(profile.created_at)}</span>
                        </div>
                        {profile.telegram_id && (
                            <div className="flex justify-between">
                                <span className="text-text-muted">Telegram ID</span>
                                <span className="font-mono text-text-primary">{profile.telegram_id}</span>
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
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-text-secondary mb-4">Your Wallets</h3>
                <div className="space-y-4">
                    {devWallet && (
                        <div
                            onClick={() => copyToClipboard(devWallet.address)}
                            className="cursor-pointer hover:bg-bg-card-hover rounded-lg p-3 -m-1 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-text-primary">Dev Wallet</span>
                                <span className="text-xs text-text-muted">Tap to copy</span>
                            </div>
                            <p className="font-mono text-sm text-accent-primary break-all">{devWallet.address}</p>
                        </div>
                    )}
                    {opsWallet && (
                        <div
                            onClick={() => copyToClipboard(opsWallet.address)}
                            className="cursor-pointer hover:bg-bg-card-hover rounded-lg p-3 -m-1 transition-colors"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-text-primary">Ops Wallet</span>
                                <span className="text-xs text-text-muted">Tap to copy</span>
                            </div>
                            <p className="font-mono text-sm text-accent-primary break-all">{opsWallet.address}</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Wallet Delegation Repair */}
            {undelegatedWallets.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6"
                >
                    <h3 className="font-medium text-warning mb-2">⚠️ Wallet Delegation Required</h3>
                    <p className="text-sm text-warning/80 mb-3">
                        The following wallet(s) need delegation for auto-claiming to work:
                    </p>
                    <div className="space-y-2 mb-4">
                        {undelegatedWallets.map((w) => (
                            <div key={w.address} className="bg-bg-void/50 rounded-lg p-2 text-xs font-mono text-warning/90">
                                {w.address.slice(0, 8)}...{w.address.slice(-8)}
                                {w.imported && <span className="ml-2 text-warning/60">(imported)</span>}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={handleDelegateAll}
                        disabled={isDelegating}
                        className="w-full bg-warning hover:bg-warning/90 disabled:bg-warning/50 text-bg-void rounded-xl py-3 font-medium transition-colors"
                    >
                        {isDelegating ? 'Delegating...' : 'Enable Delegation'}
                    </button>
                    {delegationResult === 'success' && (
                        <p className="text-sm text-success mt-2 text-center">✓ Delegation successful!</p>
                    )}
                    {delegationResult === 'error' && (
                        <p className="text-sm text-error mt-2 text-center">✗ Delegation failed. Please try again.</p>
                    )}
                </motion.div>
            )}

            {/* Platform Info */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-text-secondary mb-4">Platform Info</h3>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-muted">Fee Split</span>
                        <span className="text-text-primary">90% to you, 10% platform</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-text-muted">Auto-claim Threshold</span>
                        <span className="text-text-primary">0.15 SOL</span>
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
                    className="block bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-4 transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-text-primary">Web Dashboard</span>
                        <span className="text-text-muted">→</span>
                    </div>
                </a>
            </motion.div>

            {/* Logout Button */}
            <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onClick={handleLogout}
                className="w-full bg-error/20 hover:bg-error/30 border border-error/50 text-error rounded-xl py-4 font-medium transition-colors btn-press"
            >
                Disconnect
            </motion.button>

            {/* Version */}
            <p className="text-center text-xs text-text-muted mt-6">
                ClaudeWheel TMA v1.0.0
            </p>
        </div>
    );
}
