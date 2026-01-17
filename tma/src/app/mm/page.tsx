'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivyWrapper } from '@/hooks/usePrivyWrapper';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { LoadingButton } from '@/components/LoadingButton';
import { CopyButton } from '@/components/CopyButton';
import { AlgorithmBadge } from '@/components/StatusBadge';
import { motion, AnimatePresence } from 'framer-motion';

type MmStep = 'input' | 'review' | 'depositing' | 'active';

interface MmData {
    tokenMint: string;
    mmAlgorithm: 'simple' | 'turbo_lite' | 'rebalance';
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
    const { getAccessToken } = usePrivyWrapper();
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
                toast.success('MM Activated!', {
                    description: 'Market making is now running',
                });
                setStep('active');
                return;
            }

            setDepositBalance(pending.currentBalanceSol || 0);

            // Check if activated (status changed or no longer pending)
            if (pending.status !== 'awaiting_deposit') {
                hapticFeedback('heavy');
                toast.success('MM Activated!', {
                    description: 'Market making is now running',
                });
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
            toast.success('MM created!', {
                description: `Deposit ${mmData.minDepositSol} SOL to activate`,
            });
            setStep('depositing');
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message || 'Failed to start MM';
            setError(errorMsg);
            toast.error('Failed to start MM', { description: errorMsg });
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
            toast.info('MM cancelled', { description: 'Pending activation has been cancelled' });
            setPendingMm(null);
            setStep('input');
            setData({ tokenMint: '', mmAlgorithm: 'simple' });
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || 'Failed to cancel';
            setError(errorMsg);
            toast.error('Failed to cancel', { description: errorMsg });
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
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="text-2xl text-text-secondary hover:text-text-primary transition-colors"
                    disabled={step === 'depositing' || step === 'active'}
                >
                    ←
                </button>
                <h1 className="text-xl font-bold text-text-primary">{stepTitle[step]}</h1>
            </div>

            {/* Progress Indicator */}
            {step !== 'active' && (
                <div className="flex gap-2 mb-6">
                    {['input', 'review', 'depositing'].map((s, i) => (
                        <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                                ['input', 'review', 'depositing'].indexOf(step) >= i
                                    ? 'bg-accent-cyan'
                                    : 'bg-bg-card'
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
                        <div className="bg-accent-cyan/10 border border-accent-cyan/30 rounded-xl p-4 mb-4">
                            <p className="text-sm text-accent-cyan">
                                Market make any Bags.fm token without being the creator.
                                You'll earn trading profits while the flywheel runs.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Token Mint Address</label>
                            <input
                                type="text"
                                value={data.tokenMint}
                                onChange={e => setData({ ...data, tokenMint: e.target.value.trim() })}
                                placeholder="Enter Bags token mint address..."
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary font-mono text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-accent-cyan/50"
                            />
                            {isValidating && (
                                <p className="text-xs text-text-muted mt-2 flex items-center gap-2">
                                    <span className="animate-spin w-3 h-3 border border-accent-cyan border-t-transparent rounded-full" />
                                    Validating...
                                </p>
                            )}
                        </div>

                        {/* MM Strategy Selection */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                            <label className="block text-sm text-text-muted mb-3">Market Making Strategy</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { value: 'simple', label: '🐢 Simple', desc: '5 buys, 5 sells', disabled: false },
                                    { value: 'turbo_lite', label: '🚀 Turbo', desc: '8 buys, 8 sells (8x)', disabled: false },
                                    { value: 'rebalance', label: '⚖️ Rebalance', desc: 'Portfolio %', disabled: true },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => !opt.disabled && setData({ ...data, mmAlgorithm: opt.value as MmData['mmAlgorithm'] })}
                                        disabled={opt.disabled}
                                        className={`p-3 rounded-lg text-center transition-colors ${
                                            opt.disabled
                                                ? 'bg-bg-secondary/50 text-text-muted opacity-50 cursor-not-allowed border border-border-subtle'
                                                : data.mmAlgorithm === opt.value
                                                ? 'bg-accent-cyan text-bg-void'
                                                : 'bg-bg-secondary text-text-secondary hover:bg-bg-card-hover border border-border-subtle'
                                        }`}
                                    >
                                        <div className="text-sm font-medium">{opt.label}</div>
                                        <div className="text-xs opacity-70">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 text-sm space-y-2">
                            <p className="text-text-secondary">
                                <span className="text-text-muted">Minimum Deposit:</span>{' '}
                                <span className="text-accent-cyan font-medium">0.10 SOL</span>
                            </p>
                            <p className="text-text-muted text-xs">
                                Deposit SOL to your ops wallet to start market making
                            </p>
                        </div>

                        <div className="bg-warning/20 border border-warning/30 rounded-xl p-4">
                            <p className="text-xs text-warning">
                                Note: As an MM-only user, you receive trading profits but cannot claim creator fees (since you're not the token creator).
                            </p>
                        </div>

                        {error && (
                            <div className="bg-error/20 border border-error/50 rounded-xl p-4">
                                <p className="text-sm text-error">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleContinueToReview}
                            disabled={!canContinue}
                            className="w-full bg-accent-cyan hover:bg-accent-cyan/80 disabled:bg-bg-card disabled:text-text-muted text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
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
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 space-y-4">
                            <div>
                                <p className="text-xs text-text-muted mb-1">Token Mint</p>
                                <p className="font-mono text-sm text-accent-cyan break-all">{data.tokenMint}</p>
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-1">MM Strategy</p>
                                <p className="font-medium capitalize text-text-primary">{data.mmAlgorithm}</p>
                            </div>
                        </div>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 text-sm space-y-2">
                            <p className="text-text-secondary">
                                <span className="text-text-muted">Minimum Deposit:</span>{' '}
                                <span className="text-accent-cyan font-medium">0.10 SOL</span>
                            </p>
                            <p className="text-text-muted text-xs">
                                Your ops wallet will be used for market making
                            </p>
                        </div>

                        {error && (
                            <div className="bg-error/20 border border-error/50 rounded-xl p-4">
                                <p className="text-sm text-error">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleStartMm}
                            disabled={isSubmitting}
                            className="w-full bg-accent-cyan hover:bg-accent-cyan/80 disabled:bg-bg-card disabled:text-text-muted text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin w-5 h-5 border-2 border-bg-void border-t-transparent rounded-full" />
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
                                    className="w-16 h-16 rounded-xl object-cover border-2 border-border-accent"
                                />
                            </div>
                        )}

                        <div className="text-3xl mb-2">💰</div>
                        <h2 className="text-xl font-bold mb-2 text-text-primary">Deposit to Activate MM</h2>
                        <p className="text-text-secondary mb-2">
                            {pendingMm.tokenName || pendingMm.tokenSymbol} ({pendingMm.tokenSymbol})
                        </p>
                        <p className="text-text-muted text-sm mb-4">
                            Send at least <span className="text-accent-cyan font-bold">{pendingMm.minDepositSol.toFixed(2)} SOL</span> to your ops wallet
                        </p>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-4">
                            <p className="text-sm text-text-muted mb-2">Ops Wallet Address</p>
                            <p className="font-mono text-accent-cyan text-sm break-all">
                                {pendingMm.depositAddress}
                            </p>
                        </div>

                        {/* Balance indicator */}
                        <div className={`rounded-xl p-4 mb-4 ${depositBalance >= pendingMm.minDepositSol ? 'bg-success/20 border border-success/30' : 'bg-bg-card border border-border-subtle'}`}>
                            <p className={`text-sm ${depositBalance >= pendingMm.minDepositSol ? 'text-success' : 'text-text-secondary'}`}>
                                Current Balance: <span className="font-bold">{depositBalance.toFixed(4)} SOL</span>
                            </p>
                            {depositBalance >= pendingMm.minDepositSol && (
                                <p className="text-xs text-success/70 mt-1">
                                    Activating MM...
                                </p>
                            )}
                        </div>

                        {/* Status indicator */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2">
                                <div className="animate-spin w-4 h-4 border-2 border-accent-cyan border-t-transparent rounded-full" />
                                <span className="text-sm text-text-muted">Waiting for deposit...</span>
                            </div>
                        </div>

                        <p className="text-sm text-text-muted mb-6">
                            MM will activate automatically when the deposit is detected.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCancelPending}
                                className="flex-1 bg-bg-card border border-border-subtle hover:bg-bg-card-hover text-text-primary py-4 rounded-xl font-medium transition-colors btn-press"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleGoToDashboard}
                                className="flex-1 bg-bg-card border border-border-subtle hover:bg-bg-card-hover text-text-primary py-4 rounded-xl font-medium transition-colors btn-press"
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
                        <h2 className="text-2xl font-bold mb-2 text-accent-cyan">MM Activated!</h2>
                        <p className="text-text-muted mb-4">
                            Market making is now running for {tokenInfo?.tokenSymbol || 'your token'}
                        </p>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-8 w-full">
                            <p className="text-xs text-text-muted">
                                The flywheel is now executing trades. View your token in the dashboard to monitor progress and withdraw anytime.
                            </p>
                        </div>

                        <button
                            onClick={handleGoToDashboard}
                            className="w-full bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
                        >
                            View in Dashboard
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
