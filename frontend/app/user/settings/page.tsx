'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivyWrapper, useWalletsWrapper, useSignersWrapper } from '@/app/hooks/usePrivyWrapper';
import { useTelegram } from '@/app/components/WebProvider';
import { api } from '@/app/lib/api';
import { toast } from '@/app/lib/toast';
import { LoadingButton, WalletAddress, CopyButton } from '@/app/components/user';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface UserProfile {
    id: string;
    privy_did: string;
    telegram_id?: number;
    telegram_username?: string;
    created_at: string;
}

interface PrivyWalletInfo {
    address: string;
    delegated: boolean;
    imported: boolean;
}

export default function UserSettingsPage() {
    const { getAccessToken, logout, user: privyUser, ready: privyReady, authenticated } = usePrivyWrapper();
    const { wallets } = useWalletsWrapper();
    const { addSigners } = useSignersWrapper();
    const { hapticFeedback } = useTelegram();
    const [isDelegating, setIsDelegating] = useState(false);
    const [delegationResult, setDelegationResult] = useState<string | null>(null);

    const devWallet = wallets[0];
    const opsWallet = wallets[1];

    // Get all Solana wallets from Privy user object (includes imported wallets)
    const allPrivyWallets: PrivyWalletInfo[] = (privyUser?.linkedAccounts || [])
        .filter((account: any) => account.type === 'wallet' && account.chainType === 'solana')
        .map((account: any) => ({
            address: account.address,
            delegated: account.delegated || false,
            imported: account.imported || false,
        }));

    // Find wallets that need delegation
    const undelegatedWallets = allPrivyWallets.filter(w => !w.delegated);

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
        enabled: authenticated,
    });

    // Add signers to undelegated wallets (new Privy API)
    const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

    const handleDelegateAll = async () => {
        if (!SIGNER_ID) {
            toast.error('Signer ID not configured', {
                description: 'Please contact support.',
            });
            return;
        }

        if (undelegatedWallets.length === 0) {
            toast.info('No undelegated wallets found');
            return;
        }

        setIsDelegating(true);
        setDelegationResult(null);
        hapticFeedback('medium');

        try {
            for (const wallet of undelegatedWallets) {
                // Add timeout to detect if it hangs
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Add signer timed out after 30s')), 30000)
                );

                // New Privy API: addSigners instead of delegateWallet
                const addSignerPromise = addSigners({
                    address: wallet.address,
                    signers: [{ signerId: SIGNER_ID, policyIds: [] }],
                });

                await Promise.race([addSignerPromise, timeoutPromise]);
            }
            setDelegationResult('success');
            toast.success('Delegation successful!', {
                description: 'Your wallets are now delegated for auto-claiming.',
            });
            hapticFeedback('heavy');
        } catch (error: any) {
            console.error('[Settings] Add signer failed:', error);
            setDelegationResult('error');
            toast.error('Delegation failed', {
                description: error?.message || 'Please try again.',
            });
            hapticFeedback('heavy');
        } finally {
            setIsDelegating(false);
        }
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

    // Get user display info from Privy
    const displayName = privyUser?.email?.address?.split('@')[0] ||
                        privyUser?.google?.name ||
                        privyUser?.telegram?.username ||
                        'User';
    const displayEmail = privyUser?.email?.address;
    const displayInitial = displayName?.[0]?.toUpperCase() || 'U';

    return (
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/user/dashboard"
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-accent transition-colors"
                >
                    <span className="text-lg">&#8592;</span>
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
                        {displayInitial}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">
                            {displayName}
                        </h2>
                        {displayEmail && (
                            <p className="text-sm text-text-muted">{displayEmail}</p>
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
                        {profile.telegram_username && (
                            <div className="flex justify-between">
                                <span className="text-text-muted">Telegram</span>
                                <span className="text-text-primary">@{profile.telegram_username}</span>
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
                        <div className="bg-bg-secondary rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-text-primary">Dev Wallet</span>
                                <CopyButton
                                    value={devWallet.address}
                                    variant="icon-only"
                                    size="sm"
                                    showToast
                                    toastMessage="Dev wallet address copied"
                                />
                            </div>
                            <p className="font-mono text-sm text-accent-primary break-all">{devWallet.address}</p>
                        </div>
                    )}
                    {opsWallet && (
                        <div className="bg-bg-secondary rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-text-primary">Ops Wallet</span>
                                <CopyButton
                                    value={opsWallet.address}
                                    variant="icon-only"
                                    size="sm"
                                    showToast
                                    toastMessage="Ops wallet address copied"
                                />
                            </div>
                            <p className="font-mono text-sm text-accent-primary break-all">{opsWallet.address}</p>
                        </div>
                    )}
                    {!devWallet && !opsWallet && (
                        <p className="text-sm text-text-muted text-center py-4">
                            No wallets found. Please complete onboarding.
                        </p>
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
                    <h3 className="font-medium text-warning mb-2">Wallet Delegation Required</h3>
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
                    <LoadingButton
                        onClick={handleDelegateAll}
                        isLoading={isDelegating}
                        loadingText="Delegating..."
                        fullWidth
                        className="bg-warning hover:bg-warning/90 text-bg-void"
                    >
                        Enable Delegation
                    </LoadingButton>
                    {delegationResult === 'success' && (
                        <p className="text-sm text-success mt-2 text-center">Delegation successful!</p>
                    )}
                    {delegationResult === 'error' && (
                        <p className="text-sm text-error mt-2 text-center">Delegation failed. Please try again.</p>
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
                <Link
                    href="/user/dashboard"
                    className="block bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-4 transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-text-primary">Dashboard</span>
                        <span className="text-text-muted">&#8594;</span>
                    </div>
                </Link>
            </motion.div>

            {/* Logout Button */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <LoadingButton
                    onClick={handleLogout}
                    fullWidth
                    variant="danger"
                    className="bg-error/20 hover:bg-error/30 border border-error/50 text-error py-4"
                >
                    Disconnect
                </LoadingButton>
            </motion.div>

            {/* Version */}
            <p className="text-center text-xs text-text-muted mt-6">
                ClaudeWheel Web v1.0.0
            </p>
        </div>
    );
}
