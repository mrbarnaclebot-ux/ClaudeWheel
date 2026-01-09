'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSolanaWallets, useDelegatedActions } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

type Step = 'welcome' | 'creating_wallets' | 'delegation' | 'complete';

export default function OnboardingPage() {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const { wallets, createWallet } = useSolanaWallets();
    const { delegateWallet } = useDelegatedActions();
    const { user: telegramUser, hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('welcome');
    const [error, setError] = useState<string | null>(null);

    // useSolanaWallets already returns only Solana wallets
    const solanaWallets = wallets;

    async function handleStart() {
        hapticFeedback('medium');
        setStep('creating_wallets');
        setError(null);

        try {
            // Create dev wallet (first)
            if (wallets.length === 0) {
                await createWallet();
            }

            // Create ops wallet (second)
            // Note: createAdditional is passed to create additional wallets
            if (wallets.length < 2) {
                await createWallet({ createAdditional: true });
            }

            setStep('delegation');
        } catch (err) {
            setError('Failed to create wallets. Please try again.');
            setStep('welcome');
        }
    }

    async function handleDelegate() {
        hapticFeedback('medium');
        setError(null);

        try {
            // Delegate both wallets
            for (const wallet of solanaWallets) {
                await delegateWallet({
                    address: wallet.address,
                    chainType: 'solana',
                });
            }

            // Register with backend
            const authToken = await getAccessToken();
            await api.post('/api/users/complete-onboarding', {
                devWalletAddress: solanaWallets[0]?.address,
                opsWalletAddress: solanaWallets[1]?.address,
                telegramId: telegramUser?.id,
                telegramUsername: telegramUser?.username,
            }, {
                headers: { Authorization: `Bearer ${authToken}` },
            });

            hapticFeedback('heavy');
            setStep('complete');

            // Navigate to dashboard after brief delay
            setTimeout(() => router.replace('/dashboard'), 1500);
        } catch (err) {
            setError('Failed to complete setup. Please try again.');
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

                {step === 'delegation' && (
                    <motion.div
                        key="delegation"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex-1 flex flex-col"
                    >
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="text-5xl mb-6">🔐</div>
                            <h2 className="text-xl font-bold mb-3">Enable Automated Trading</h2>
                            <p className="text-gray-400 text-center mb-6 max-w-sm">
                                Allow ClaudeWheel to execute trades on your behalf.
                                Your keys stay secure with Privy.
                            </p>

                            <div className="bg-gray-800/50 rounded-xl p-4 w-full mb-6">
                                <p className="text-sm text-gray-400 mb-3">Your Wallets:</p>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-xs text-gray-500">Dev Wallet</span>
                                        <p className="text-green-400 font-mono text-sm truncate">
                                            {solanaWallets[0]?.address}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500">Ops Wallet</span>
                                        <p className="text-green-400 font-mono text-sm truncate">
                                            {solanaWallets[1]?.address}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleDelegate}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium text-lg"
                        >
                            Authorize Trading
                        </button>

                        {error && (
                            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
                        )}
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
