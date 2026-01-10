'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

type MmStep = 'input' | 'review' | 'depositing' | 'active';

interface MmData {
    tokenMint: string;
    mmAlgorithm: 'simple' | 'rebalance';
}

interface TokenInfo {
    tokenSymbol: string;
    tokenName?: string;
    tokenImage?: string;
}

interface PendingMm {
    id: string;
    tokenMint: string;
    tokenSymbol: string;
    tokenName?: string;
    tokenImage?: string;
    depositAddress: string;
    minDepositSol: number;
    mmAlgorithm: string;
    status: string;
    currentBalanceSol?: number;
    expiresAt: string;
}

export default function MmPage() {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<MmStep>('input');
    const [data, setData] = useState<MmData>({
        tokenMint: '',
        mmAlgorithm: 'simple',
    });
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [pendingMm, setPendingMm] = useState<PendingMm | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [depositBalance, setDepositBalance] = useState<number>(0);

    // Check for existing pending MM on mount
    useEffect(() => {
        async function checkExistingPending() {
            try {
                const token = await getAccessToken();
                const response = await api.get('/api/privy/mm/pending', {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.data.data) {
                    setPendingMm(response.data.data);
                    setDepositBalance(response.data.data.currentBalanceSol || 0);
                    setStep('depositing');
                }
            } catch (err) {
                console.error('Failed to check pending MM:', err);
            }
        }
        checkExistingPending();
    }, [getAccessToken]);

    // Poll for pending MM status
    const pollPendingStatus = useCallback(async () => {
        if (!pendingMm?.id) return;

        try {
            const token = await getAccessToken();
            const response = await api.get('/api/privy/mm/pending', {
                headers: { Authorization: `Bearer ${token}` },
            });

            const pending = response.data.data;
            if (!pending) {
                // Pending no longer exists - was activated or cancelled
                hapticFeedback('heavy');
                setStep('active');
                return;
            }

            setDepositBalance(pending.currentBalanceSol || 0);

            // Check if activated (status changed or no longer pending)
            if (pending.status !== 'awaiting_deposit') {
                hapticFeedback('heavy');
                setStep('active');
            }
        } catch (err) {
            console.error('Failed to poll pending status:', err);
        }
    }, [pendingMm?.id, getAccessToken, hapticFeedback]);

    // Start polling when in depositing step
    useEffect(() => {
        if (step !== 'depositing' || !pendingMm?.id) return;

        pollPendingStatus();
        const interval = setInterval(pollPendingStatus, 3000);
        return () => clearInterval(interval);
    }, [step, pendingMm?.id, pollPendingStatus]);

    // Clear error when token mint changes (validation happens on submit)
    useEffect(() => {
        if (data.tokenMint.length > 0) {
            setError(null);
        }
        setTokenInfo(null);
        setIsValidating(false);
    }, [data.tokenMint]);

    function handleBack() {
        hapticFeedback('light');
        if (step === 'review') {
            setStep('input');
        } else if (step === 'depositing') {
            // Cannot go back from depositing
            return;
        } else {
            router.back();
        }
    }

    function handleContinueToReview() {
        hapticFeedback('medium');
        setStep('review');
    }

    async function handleStartMm() {
        hapticFeedback('medium');
        setIsSubmitting(true);
        setError(null);

        try {
            const token = await getAccessToken();
            const response = await api.post('/api/privy/mm/start', {
                tokenMint: data.tokenMint,
                mmAlgorithm: data.mmAlgorithm,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.data.success || !response.data.data) {
                throw new Error(response.data.error || 'Failed to start MM');
            }

            const mmData = response.data.data;
            setPendingMm({
                id: mmData.id,
                tokenMint: mmData.tokenMint,
                tokenSymbol: mmData.tokenSymbol,
                tokenName: mmData.tokenName,
                tokenImage: mmData.tokenImage,
                depositAddress: mmData.depositAddress,
                minDepositSol: mmData.minDepositSol,
                mmAlgorithm: mmData.mmAlgorithm,
                status: 'awaiting_deposit',
                expiresAt: mmData.expiresAt,
            });
            setTokenInfo({
                tokenSymbol: mmData.tokenSymbol,
                tokenName: mmData.tokenName,
                tokenImage: mmData.tokenImage,
            });
            hapticFeedback('heavy');
            setStep('depositing');
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to start MM');
            hapticFeedback('heavy');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleCancelPending() {
        if (!pendingMm?.id) return;

        hapticFeedback('medium');
        try {
            const token = await getAccessToken();
            await api.delete(`/api/privy/mm/pending/${pendingMm.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPendingMm(null);
            setStep('input');
            setData({ tokenMint: '', mmAlgorithm: 'simple' });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to cancel');
        }
    }

    function handleGoToDashboard() {
        hapticFeedback('medium');
        router.push('/dashboard');
    }

    const canContinue = data.tokenMint.length >= 32 && data.tokenMint.length <= 64;

    const stepTitle = {
        input: 'Market Make Any Token',
        review: 'Review',
        depositing: 'Deposit to Activate',
        active: 'MM Activated!',
    };

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="text-2xl hover:text-gray-300 transition-colors"
                    disabled={step === 'depositing' || step === 'active'}
                >
                    ←
                </button>
                <h1 className="text-xl font-bold">{stepTitle[step]}</h1>
            </div>

            {/* Progress Indicator */}
            {step !== 'active' && (
                <div className="flex gap-2 mb-6">
                    {['input', 'review', 'depositing'].map((s, i) => (
                        <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                                ['input', 'review', 'depositing'].indexOf(step) >= i
                                    ? 'bg-green-500'
                                    : 'bg-gray-700'
                            }`}
                        />
                    ))}
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* Step 1: Input Token Mint */}
                {step === 'input' && (
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-4"
                    >
                        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 mb-4">
                            <p className="text-sm text-blue-300">
                                Market make any Bags.fm token without being the creator.
                                You'll earn trading profits while the flywheel runs.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Token Mint Address</label>
                            <input
                                type="text"
                                value={data.tokenMint}
                                onChange={e => setData({ ...data, tokenMint: e.target.value.trim() })}
                                placeholder="Enter Bags token mint address..."
                                className="w-full bg-gray-800 rounded-xl p-4 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            {isValidating && (
                                <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                                    <span className="animate-spin w-3 h-3 border border-green-500 border-t-transparent rounded-full" />
                                    Validating...
                                </p>
                            )}
                        </div>

                        {/* MM Strategy Selection */}
                        <div className="bg-gray-800/50 rounded-xl p-4">
                            <label className="block text-sm text-gray-400 mb-3">Market Making Strategy</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'simple', label: 'Simple', desc: '5 buys, 5 sells cycle' },
                                    { value: 'rebalance', label: 'Rebalance', desc: 'Maintain portfolio %' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setData({ ...data, mmAlgorithm: opt.value as MmData['mmAlgorithm'] })}
                                        className={`p-3 rounded-lg text-center transition-colors ${
                                            data.mmAlgorithm === opt.value
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        <div className="text-sm font-medium">{opt.label}</div>
                                        <div className="text-xs opacity-70">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-800/50 rounded-xl p-4 text-sm space-y-2">
                            <p className="text-gray-400">
                                <span className="text-gray-500">Minimum Deposit:</span>{' '}
                                <span className="text-green-400 font-medium">0.10 SOL</span>
                            </p>
                            <p className="text-gray-500 text-xs">
                                Deposit SOL to your ops wallet to start market making
                            </p>
                        </div>

                        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4">
                            <p className="text-xs text-yellow-400">
                                Note: As an MM-only user, you receive trading profits but cannot claim creator fees (since you're not the token creator).
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleContinueToReview}
                            disabled={!canContinue}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            Continue
                        </button>
                    </motion.div>
                )}

                {/* Step 2: Review */}
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
                                <p className="text-xs text-gray-500 mb-1">Token Mint</p>
                                <p className="font-mono text-sm text-green-400 break-all">{data.tokenMint}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">MM Strategy</p>
                                <p className="font-medium capitalize">{data.mmAlgorithm}</p>
                            </div>
                        </div>

                        <div className="bg-gray-800/50 rounded-xl p-4 text-sm space-y-2">
                            <p className="text-gray-400">
                                <span className="text-gray-500">Minimum Deposit:</span>{' '}
                                <span className="text-green-400 font-medium">0.10 SOL</span>
                            </p>
                            <p className="text-gray-500 text-xs">
                                Your ops wallet will be used for market making
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleStartMm}
                            disabled={isSubmitting}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white py-4 rounded-xl font-medium transition-colors"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                    Starting...
                                </span>
                            ) : (
                                'Start MM'
                            )}
                        </button>
                    </motion.div>
                )}

                {/* Step 3: Depositing */}
                {step === 'depositing' && pendingMm && (
                    <motion.div
                        key="depositing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center"
                    >
                        {pendingMm.tokenImage && (
                            <div className="flex justify-center mb-4">
                                <img
                                    src={pendingMm.tokenImage}
                                    alt={pendingMm.tokenSymbol}
                                    className="w-16 h-16 rounded-xl object-cover"
                                />
                            </div>
                        )}

                        <div className="text-3xl mb-2">💰</div>
                        <h2 className="text-xl font-bold mb-2">Deposit to Activate MM</h2>
                        <p className="text-gray-400 mb-2">
                            {pendingMm.tokenName || pendingMm.tokenSymbol} ({pendingMm.tokenSymbol})
                        </p>
                        <p className="text-gray-500 text-sm mb-4">
                            Send at least <span className="text-green-400 font-bold">{pendingMm.minDepositSol.toFixed(2)} SOL</span> to your ops wallet
                        </p>

                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <p className="text-sm text-gray-400 mb-2">Ops Wallet Address</p>
                            <p className="font-mono text-green-400 text-sm break-all">
                                {pendingMm.depositAddress}
                            </p>
                        </div>

                        {/* Balance indicator */}
                        <div className={`rounded-xl p-4 mb-4 ${depositBalance >= pendingMm.minDepositSol ? 'bg-green-900/30 border border-green-700/50' : 'bg-gray-800/50'}`}>
                            <p className={`text-sm ${depositBalance >= pendingMm.minDepositSol ? 'text-green-400' : 'text-gray-400'}`}>
                                Current Balance: <span className="font-bold">{depositBalance.toFixed(4)} SOL</span>
                            </p>
                            {depositBalance >= pendingMm.minDepositSol && (
                                <p className="text-xs text-green-400/70 mt-1">
                                    Activating MM...
                                </p>
                            )}
                        </div>

                        {/* Status indicator */}
                        <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2">
                                <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                                <span className="text-sm text-gray-400">Waiting for deposit...</span>
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 mb-6">
                            MM will activate automatically when the deposit is detected.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCancelPending}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-4 rounded-xl font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleGoToDashboard}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-4 rounded-xl font-medium transition-colors"
                            >
                                Dashboard
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step 4: Active (Success) */}
                {step === 'active' && (
                    <motion.div
                        key="active"
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
                        <h2 className="text-2xl font-bold mb-2 text-green-400">MM Activated!</h2>
                        <p className="text-gray-400 mb-4">
                            Market making is now running for {tokenInfo?.tokenSymbol || 'your token'}
                        </p>

                        <div className="bg-gray-800/50 rounded-xl p-4 mb-8 w-full">
                            <p className="text-xs text-gray-500">
                                The flywheel is now executing trades. View your token in the dashboard to monitor progress and withdraw anytime.
                            </p>
                        </div>

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
