'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

type LaunchStep = 'details' | 'socials' | 'review' | 'depositing' | 'launched';

interface TokenData {
    name: string;
    symbol: string;
    description: string;
    imageUrl?: string;
    twitter?: string;
    telegram?: string;
    website?: string;
}

interface PendingLaunch {
    id: string;
    status: string;
    deposit_address: string;
    required_amount: number;
}

export default function LaunchPage() {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const { wallets } = useSolanaWallets();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<LaunchStep>('details');
    const [data, setData] = useState<TokenData>({
        name: '',
        symbol: '',
        description: '',
    });
    const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // useSolanaWallets already returns only Solana wallets
    const devWallet = wallets[0];

    const canContinueDetails = data.name.trim() && data.symbol.trim() && data.description.trim();

    function handleBack() {
        hapticFeedback('light');
        if (step === 'socials') {
            setStep('details');
        } else if (step === 'review') {
            setStep('socials');
        } else if (step === 'depositing') {
            // Cannot go back from depositing
            return;
        } else {
            router.back();
        }
    }

    function handleContinueToSocials() {
        hapticFeedback('medium');
        setStep('socials');
    }

    function handleContinueToReview() {
        hapticFeedback('medium');
        setStep('review');
    }

    async function handleCreatePendingLaunch() {
        hapticFeedback('medium');
        setIsSubmitting(true);
        setError(null);

        try {
            const token = await getAccessToken();
            const response = await api.post('/api/privy/launches', data, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setPendingLaunch(response.data);
            hapticFeedback('heavy');
            setStep('depositing');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to create launch');
            hapticFeedback('heavy');
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleGoToDashboard() {
        hapticFeedback('medium');
        router.push('/dashboard');
    }

    const stepTitle = {
        details: 'Token Details',
        socials: 'Social Links',
        review: 'Review',
        depositing: 'Deposit to Launch',
        launched: 'Success!',
    };

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="text-2xl hover:text-gray-300 transition-colors"
                    disabled={step === 'depositing' || step === 'launched'}
                >
                    ←
                </button>
                <h1 className="text-xl font-bold">{stepTitle[step]}</h1>
            </div>

            {/* Progress Indicator */}
            {step !== 'launched' && (
                <div className="flex gap-2 mb-6">
                    {['details', 'socials', 'review', 'depositing'].map((s, i) => (
                        <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                                ['details', 'socials', 'review', 'depositing'].indexOf(step) >= i
                                    ? 'bg-green-500'
                                    : 'bg-gray-700'
                            }`}
                        />
                    ))}
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* Step 1: Token Details */}
                {step === 'details' && (
                    <motion.div
                        key="details"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                    >
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Token Name</label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={e => setData({ ...data, name: e.target.value })}
                                placeholder="My Awesome Token"
                                className="w-full bg-gray-800 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Symbol</label>
                            <input
                                type="text"
                                value={data.symbol}
                                onChange={e => setData({ ...data, symbol: e.target.value.toUpperCase() })}
                                placeholder="AWESOME"
                                maxLength={8}
                                className="w-full bg-gray-800 rounded-xl p-4 text-white uppercase placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Description</label>
                            <textarea
                                value={data.description}
                                onChange={e => setData({ ...data, description: e.target.value })}
                                placeholder="Tell the world about your token..."
                                rows={3}
                                className="w-full bg-gray-800 rounded-xl p-4 text-white resize-none placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <button
                            onClick={handleContinueToSocials}
                            disabled={!canContinueDetails}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            Continue
                        </button>
                    </motion.div>
                )}

                {/* Step 2: Social Links */}
                {step === 'socials' && (
                    <motion.div
                        key="socials"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                    >
                        <p className="text-sm text-gray-400 mb-4">
                            Optional: Add social links to help build your community
                        </p>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Twitter / X</label>
                            <input
                                type="text"
                                value={data.twitter || ''}
                                onChange={e => setData({ ...data, twitter: e.target.value })}
                                placeholder="https://x.com/yourtoken"
                                className="w-full bg-gray-800 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Telegram</label>
                            <input
                                type="text"
                                value={data.telegram || ''}
                                onChange={e => setData({ ...data, telegram: e.target.value })}
                                placeholder="https://t.me/yourtoken"
                                className="w-full bg-gray-800 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Website</label>
                            <input
                                type="text"
                                value={data.website || ''}
                                onChange={e => setData({ ...data, website: e.target.value })}
                                placeholder="https://yourtoken.com"
                                className="w-full bg-gray-800 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleContinueToReview}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-4 rounded-xl font-medium transition-colors"
                            >
                                Skip
                            </button>
                            <button
                                onClick={handleContinueToReview}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium transition-colors"
                            >
                                Continue
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step 3: Review */}
                {step === 'review' && (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                    >
                        <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Token Name</p>
                                <p className="font-medium">{data.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Symbol</p>
                                <p className="font-medium">{data.symbol}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Description</p>
                                <p className="text-sm text-gray-300">{data.description}</p>
                            </div>
                            {(data.twitter || data.telegram || data.website) && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Social Links</p>
                                    <div className="space-y-1">
                                        {data.twitter && (
                                            <p className="text-sm text-green-400 truncate">{data.twitter}</p>
                                        )}
                                        {data.telegram && (
                                            <p className="text-sm text-green-400 truncate">{data.telegram}</p>
                                        )}
                                        {data.website && (
                                            <p className="text-sm text-green-400 truncate">{data.website}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4">
                            <p className="text-sm text-yellow-400">
                                After creating the launch, you'll need to deposit at least{' '}
                                <span className="font-bold">0.5 SOL</span> to your dev wallet to proceed.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleCreatePendingLaunch}
                            disabled={isSubmitting}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                    Creating...
                                </span>
                            ) : (
                                'Create Launch'
                            )}
                        </button>
                    </motion.div>
                )}

                {/* Step 4: Depositing */}
                {step === 'depositing' && pendingLaunch && (
                    <motion.div
                        key="depositing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center"
                    >
                        <div className="text-5xl mb-4">💰</div>
                        <h2 className="text-xl font-bold mb-2">Deposit to Launch</h2>
                        <p className="text-gray-400 mb-6">
                            Send at least <span className="text-green-400 font-bold">0.5 SOL</span> to your dev wallet
                        </p>

                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <p className="text-sm text-gray-400 mb-2">Dev Wallet Address</p>
                            <p className="font-mono text-green-400 text-sm break-all">
                                {devWallet?.address || pendingLaunch.deposit_address}
                            </p>
                        </div>

                        <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2 text-gray-400">
                                <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                                <span className="text-sm">Waiting for deposit...</span>
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 mb-6">
                            Your token will launch automatically when the deposit is detected.
                            You'll receive a notification when it's live!
                        </p>

                        <button
                            onClick={handleGoToDashboard}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </motion.div>
                )}

                {/* Step 5: Launched (Success) */}
                {step === 'launched' && (
                    <motion.div
                        key="launched"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center flex flex-col items-center justify-center min-h-[60vh]"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.2 }}
                            className="text-6xl mb-6"
                        >
                            🎉
                        </motion.div>
                        <h2 className="text-2xl font-bold mb-2 text-green-400">Token Launched!</h2>
                        <p className="text-gray-400 mb-8">
                            Your token is now live on Bags.fm
                        </p>

                        <button
                            onClick={handleGoToDashboard}
                            className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            View in Dashboard
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
