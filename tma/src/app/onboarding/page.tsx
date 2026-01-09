'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSolanaWallets, useDelegatedActions } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

type Step = 'welcome' | 'creating_wallets' | 'delegate_dev' | 'delegate_ops' | 'registering' | 'complete';

export default function OnboardingPage() {
    const router = useRouter();
    const { ready, authenticated, getAccessToken } = usePrivy();
    const { wallets, createWallet } = useSolanaWallets();
    const { delegateWallet } = useDelegatedActions();
    const { user: telegramUser, hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('welcome');
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // useSolanaWallets already returns only Solana wallets
    const solanaWallets = wallets;

    // If user already has 2 wallets, skip to delegation
    useEffect(() => {
        if (ready && authenticated && wallets.length >= 2 && step === 'welcome') {
            setStep('delegate_dev');
        }
    }, [ready, authenticated, wallets.length, step]);

    async function handleStart() {
        if (!ready || !authenticated) {
            setError('Please wait for authentication to complete.');
            return;
        }

        if (isCreating) return; // Prevent double-clicks
        setIsCreating(true);
        hapticFeedback('medium');
        setStep('creating_wallets');
        setError(null);

        try {
            console.log('[Onboarding] Starting wallet creation, current wallets:', wallets.length);

            // Create dev wallet (first)
            if (wallets.length === 0) {
                console.log('[Onboarding] Creating first wallet (dev)...');
                const devWallet = await createWallet();
                console.log('[Onboarding] Dev wallet created:', devWallet?.address);
            }

            // Small delay to let Privy state update
            await new Promise(resolve => setTimeout(resolve, 500));

            // Create ops wallet (second)
            // Check current wallets again after first creation
            if (wallets.length < 2) {
                console.log('[Onboarding] Creating second wallet (ops)...');
                const opsWallet = await createWallet({ createAdditional: true });
                console.log('[Onboarding] Ops wallet created:', opsWallet?.address);
            }

            setStep('delegate_dev');
        } catch (err: any) {
            console.error('[Onboarding] Wallet creation failed:', err);
            console.error('[Onboarding] Error details:', err?.message, err?.code, err?.cause);
            setError(`Failed to create wallets: ${err?.message || 'Unknown error'}. Please try again.`);
            setStep('welcome');
        } finally {
            setIsCreating(false);
        }
    }

    async function handleDelegateDev() {
        hapticFeedback('medium');
        setError(null);

        try {
            const devWallet = solanaWallets[0];
            if (!devWallet) {
                throw new Error('Dev wallet not found');
            }

            console.log('[Onboarding] Delegating dev wallet:', devWallet.address);
            await delegateWallet({
                address: devWallet.address,
                chainType: 'solana',
            });
            console.log('[Onboarding] Dev wallet delegated successfully');

            setStep('delegate_ops');
        } catch (err: any) {
            console.error('[Onboarding] Dev wallet delegation failed:', err);
            setError(`Dev wallet delegation failed: ${err?.message || 'Unknown error'}`);
        }
    }

    async function handleDelegateOps() {
        hapticFeedback('medium');
        setError(null);

        try {
            const opsWallet = solanaWallets[1];
            if (!opsWallet) {
                throw new Error('Ops wallet not found');
            }

            console.log('[Onboarding] Delegating ops wallet:', opsWallet.address);
            await delegateWallet({
                address: opsWallet.address,
                chainType: 'solana',
            });
            console.log('[Onboarding] Ops wallet delegated successfully');

            // Now register with backend
            setStep('registering');
            await completeRegistration();
        } catch (err: any) {
            console.error('[Onboarding] Ops wallet delegation failed:', err);
            setError(`Ops wallet delegation failed: ${err?.message || 'Unknown error'}`);
        }
    }

    async function completeRegistration() {
        try {
            console.log('[Onboarding] Getting access token...');
            const authToken = await getAccessToken();
            if (!authToken) {
                throw new Error('Failed to get auth token');
            }

            console.log('[Onboarding] Registering with backend...');
            const payload = {
                devWalletAddress: solanaWallets[0]?.address,
                opsWalletAddress: solanaWallets[1]?.address,
                telegramId: telegramUser?.id,
                telegramUsername: telegramUser?.username,
            };

            const response = await api.post('/api/users/complete-onboarding', payload, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            console.log('[Onboarding] Backend response:', response.data);

            hapticFeedback('heavy');
            setStep('complete');

            setTimeout(() => router.replace('/dashboard'), 1500);
        } catch (err: any) {
            console.error('[Onboarding] Registration failed:', err);
            const errorMsg = err?.response?.data?.error || err?.message || 'Unknown error';
            setError(`Registration failed: ${errorMsg}`);
            setStep('delegate_ops'); // Go back to retry
        }
    }

    return (
        <div className="min-h-screen flex flex-col p-6">
            <AnimatePresence mode="wait">
                {step === 'welcome' && (
                    <motion.div
                        key="welcome"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col"
                    >
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <div className="text-6xl mb-6">🎡</div>
                            <h1 className="text-2xl font-bold mb-3">
                                Welcome to ClaudeWheel
                            </h1>
                            <p className="text-gray-400 mb-2">
                                Hey{telegramUser?.firstName ? `, ${telegramUser.firstName}` : ''}!
                            </p>
                            <p className="text-gray-400 max-w-sm">
                                Launch tokens on Bags.fm and let our flywheel
                                automatically trade and collect fees for you.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gray-800/50 rounded-xl p-4">
                                <h3 className="font-medium mb-2">What you'll get:</h3>
                                <ul className="text-sm text-gray-400 space-y-2">
                                    <li>✓ Two secure Solana wallets</li>
                                    <li>✓ Automated market-making</li>
                                    <li>✓ Automatic fee collection</li>
                                    <li>✓ Real-time notifications</li>
                                </ul>
                            </div>

                            <button
                                onClick={handleStart}
                                className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium text-lg"
                            >
                                Get Started
                            </button>

                            {error && (
                                <p className="text-red-400 text-sm text-center">{error}</p>
                            )}
                        </div>
                    </motion.div>
                )}

                {step === 'creating_wallets' && (
                    <motion.div
                        key="creating"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col items-center justify-center text-center"
                    >
                        <div className="animate-spin w-12 h-12 border-3 border-green-500 border-t-transparent rounded-full mb-6" />
                        <h2 className="text-xl font-medium mb-2">Creating Your Wallets</h2>
                        <p className="text-gray-400">This only takes a moment...</p>
                    </motion.div>
                )}

                {step === 'delegate_dev' && (
                    <motion.div
                        key="delegate_dev"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col"
                    >
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="text-5xl mb-6">🔐</div>
                            <h2 className="text-xl font-bold mb-3">Authorize Dev Wallet</h2>
                            <p className="text-gray-400 text-center mb-6 max-w-sm">
                                Step 1 of 2: Enable trading for your Dev wallet.
                            </p>

                            <div className="bg-gray-800/50 rounded-xl p-4 w-full mb-6">
                                <span className="text-xs text-gray-500">Dev Wallet</span>
                                <p className="text-green-400 font-mono text-sm truncate">
                                    {solanaWallets[0]?.address}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleDelegateDev}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium text-lg"
                        >
                            Authorize Dev Wallet
                        </button>

                        {error && (
                            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
                        )}
                    </motion.div>
                )}

                {step === 'delegate_ops' && (
                    <motion.div
                        key="delegate_ops"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col"
                    >
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="text-5xl mb-6">🔐</div>
                            <h2 className="text-xl font-bold mb-3">Authorize Ops Wallet</h2>
                            <p className="text-gray-400 text-center mb-6 max-w-sm">
                                Step 2 of 2: Enable trading for your Ops wallet.
                            </p>

                            <div className="bg-gray-800/50 rounded-xl p-4 w-full mb-6">
                                <span className="text-xs text-gray-500">Ops Wallet</span>
                                <p className="text-green-400 font-mono text-sm truncate">
                                    {solanaWallets[1]?.address}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleDelegateOps}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium text-lg"
                        >
                            Authorize Ops Wallet
                        </button>

                        {error && (
                            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
                        )}
                    </motion.div>
                )}

                {step === 'registering' && (
                    <motion.div
                        key="registering"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col items-center justify-center text-center"
                    >
                        <div className="animate-spin w-12 h-12 border-3 border-green-500 border-t-transparent rounded-full mb-6" />
                        <h2 className="text-xl font-medium mb-2">Completing Setup</h2>
                        <p className="text-gray-400">Registering with backend...</p>
                    </motion.div>
                )}

                {step === 'complete' && (
                    <motion.div
                        key="complete"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex-1 flex flex-col items-center justify-center text-center"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.2 }}
                            className="text-6xl mb-6"
                        >
                            ✓
                        </motion.div>
                        <h2 className="text-2xl font-bold mb-2 text-green-400">You're All Set!</h2>
                        <p className="text-gray-400">Redirecting to dashboard...</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
