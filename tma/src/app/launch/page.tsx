'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivyWrapper, useWalletsWrapper } from '@/hooks/usePrivyWrapper';
import { toast } from '@/lib/toast';
import { useTelegram } from '@/components/TelegramProvider';
import { WalletAddress } from '@/components/WalletAddress';
import { LoadingButton } from '@/components/LoadingButton';
import { DepositProgress } from '@/components/DepositProgress';
import { api } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

type LaunchStep = 'details' | 'socials' | 'review' | 'depositing' | 'launched';

interface TokenData {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    twitter?: string;
    telegram?: string;
    website?: string;
    devBuy?: number;
    // MM Config
    mmAlgorithm: 'simple' | 'turbo_lite' | 'rebalance';
    mmAutoClaimEnabled: boolean;
}

interface PendingLaunch {
    id: string;
    status: 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded' | 'retry_pending';
    deposit_address: string;
    required_amount: number;
    token_mint?: string;
    balance?: number;
    error?: string;
    expiresAt?: string;
}

// Hook for countdown timer
function useCountdown(expiresAt: string | undefined) {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [hasWarned, setHasWarned] = useState(false);

    useEffect(() => {
        if (!expiresAt) {
            setTimeLeft(null);
            return;
        }

        const calculateTimeLeft = () => {
            const now = new Date().getTime();
            const expiry = new Date(expiresAt).getTime();
            const diff = Math.max(0, expiry - now);
            return Math.floor(diff / 1000); // seconds
        };

        setTimeLeft(calculateTimeLeft());
        const interval = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);

            // Warn when < 5 minutes remaining (only once)
            if (remaining > 0 && remaining <= 300 && !hasWarned) {
                setHasWarned(true);
                toast.warning('Launch expiring soon!', {
                    description: `You have ${Math.ceil(remaining / 60)} minutes left to deposit`,
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt, hasWarned]);

    const formatTime = useMemo(() => {
        if (timeLeft === null) return null;
        if (timeLeft <= 0) return 'Expired';

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, [timeLeft]);

    const isExpiring = timeLeft !== null && timeLeft > 0 && timeLeft <= 300; // < 5 minutes
    const isExpired = timeLeft !== null && timeLeft <= 0;

    return { timeLeft, formatTime, isExpiring, isExpired };
}

export default function LaunchPage() {
    const router = useRouter();
    const { getAccessToken } = usePrivyWrapper();
    const { wallets } = useWalletsWrapper();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<LaunchStep>('details');
    const [data, setData] = useState<TokenData>({
        name: '',
        symbol: '',
        description: '',
        imageUrl: '',
        // MM defaults
        mmAlgorithm: 'simple',
        mmAutoClaimEnabled: true,
    });
    const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [launchStatus, setLaunchStatus] = useState<string>('awaiting_deposit');
    const [depositBalance, setDepositBalance] = useState<number>(0);
    const [isUploading, setIsUploading] = useState(false);

    // Expiration countdown
    const { formatTime, isExpiring, isExpired } = useCountdown(pendingLaunch?.expiresAt);

    // Handle image file upload
    async function handleImageUpload(file: File) {
        // Client-side validation
        if (!file.type.startsWith('image/')) {
            setError('Only image files are allowed');
            hapticFeedback('heavy');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be less than 5MB');
            hapticFeedback('heavy');
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const token = await getAccessToken();
            const formData = new FormData();
            formData.append('image', file);

            const response = await api.post('/api/privy/launches/upload-image', formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });

            if (response.data.success && response.data.imageUrl) {
                setData(prev => ({ ...prev, imageUrl: response.data.imageUrl }));
                hapticFeedback('medium');
                toast.success('Image uploaded successfully');
            } else {
                const errorMsg = 'Failed to upload image';
                setError(errorMsg);
                toast.error(errorMsg);
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || 'Failed to upload image';
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setIsUploading(false);
        }
    }

    // Poll for launch status when in depositing step
    const pollLaunchStatus = useCallback(async () => {
        if (!pendingLaunch?.id) return;

        try {
            const token = await getAccessToken();
            const response = await api.get(`/api/privy/launches/${pendingLaunch.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const launch = response.data.data;
            setLaunchStatus(launch.status);
            setDepositBalance(launch.balance || launch.minDepositSol || 0);

            // Handle different statuses
            if (launch.status === 'completed') {
                hapticFeedback('heavy');
                toast.success('🎉 Token launched successfully!', {
                    description: 'View it in your dashboard',
                });
                setStep('launched');
            } else if (launch.status === 'failed' || launch.status === 'expired' || launch.status === 'refunded') {
                const errorMsg = launch.lastError || launch.error || `Launch ${launch.status}`;
                setError(errorMsg);
                toast.error('Launch failed', { description: errorMsg });
            } else if (launch.status === 'launching' && launch.balance >= launch.required_amount) {
                // Only show this toast once when deposit is detected
                if (launchStatus !== 'launching') {
                    toast.info('Deposit detected!', {
                        description: 'Launching your token...',
                    });
                }
            }
        } catch (err) {
            console.error('Failed to poll launch status:', err);
        }
    }, [pendingLaunch?.id, getAccessToken, hapticFeedback, launchStatus]);

    // Start polling when in depositing step
    useEffect(() => {
        if (step !== 'depositing' || !pendingLaunch?.id) return;

        // Poll immediately
        pollLaunchStatus();

        // Poll every 2 seconds for faster status updates
        const interval = setInterval(pollLaunchStatus, 2000);

        return () => clearInterval(interval);
    }, [step, pendingLaunch?.id, pollLaunchStatus]);

    // useSolanaWallets already returns only Solana wallets
    const devWallet = wallets[0];

    const canContinueDetails = data.name.trim() && data.symbol.trim() && data.description.trim() && data.imageUrl.trim();

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

            // Extract launch data from nested response structure
            const launchData = response.data?.data;
            if (!launchData?.launch?.id) {
                throw new Error('Invalid response from server');
            }
            setPendingLaunch({
                id: launchData.launch.id,
                status: launchData.launch.status,
                deposit_address: launchData.depositAddress,
                required_amount: launchData.minDeposit,
                expiresAt: launchData.launch.expiresAt || launchData.expiresAt,
            });
            hapticFeedback('heavy');
            toast.success('Launch created!', {
                description: 'Send SOL to your dev wallet to begin',
            });
            setStep('depositing');
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message || 'Failed to create launch';
            setError(errorMsg);
            toast.error('Failed to create launch', { description: errorMsg });
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
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="text-2xl text-text-secondary hover:text-text-primary transition-colors"
                    disabled={step === 'depositing' || step === 'launched'}
                >
                    ←
                </button>
                <h1 className="text-xl font-bold text-text-primary">{stepTitle[step]}</h1>
            </div>

            {/* Progress Indicator */}
            {step !== 'launched' && (
                <div className="flex gap-2 mb-6">
                    {['details', 'socials', 'review', 'depositing'].map((s, i) => (
                        <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                                ['details', 'socials', 'review', 'depositing'].indexOf(step) >= i
                                    ? 'bg-accent-primary'
                                    : 'bg-bg-card'
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
                            <label className="block text-sm text-text-muted mb-2">Token Name</label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={e => setData({ ...data, name: e.target.value })}
                                placeholder="My Awesome Token"
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Symbol</label>
                            <input
                                type="text"
                                value={data.symbol}
                                onChange={e => setData({ ...data, symbol: e.target.value.toUpperCase() })}
                                placeholder="AWESOME"
                                maxLength={8}
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary uppercase placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Description</label>
                            <textarea
                                value={data.description}
                                onChange={e => setData({ ...data, description: e.target.value })}
                                placeholder="Tell the world about your token..."
                                rows={3}
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary resize-none placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Token Image *</label>

                            {/* Image preview */}
                            {data.imageUrl && (
                                <div className="mb-3 flex justify-center">
                                    <div className="relative">
                                        <img
                                            src={data.imageUrl}
                                            alt="Token preview"
                                            className="w-24 h-24 rounded-xl object-cover bg-bg-card border-2 border-border-accent"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                setData(prev => ({ ...prev, imageUrl: '' }));
                                                setError('Failed to load image - please try a different URL');
                                            }}
                                        />
                                        <button
                                            onClick={() => setData({ ...data, imageUrl: '' })}
                                            className="absolute -top-2 -right-2 bg-error text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Upload button */}
                            {!data.imageUrl && (
                                <label className={`block w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-center cursor-pointer hover:bg-bg-card-hover hover:border-border-accent transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleImageUpload(file);
                                        }}
                                        disabled={isUploading}
                                    />
                                    {isUploading ? (
                                        <span className="flex items-center justify-center gap-2 text-text-muted">
                                            <span className="animate-spin w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full" />
                                            Uploading...
                                        </span>
                                    ) : (
                                        <span className="text-text-muted">
                                            📤 Tap to upload image
                                        </span>
                                    )}
                                </label>
                            )}

                            {/* Or divider */}
                            {!data.imageUrl && (
                                <div className="flex items-center gap-3 my-3">
                                    <div className="flex-1 h-px bg-border-subtle" />
                                    <span className="text-xs text-text-muted">OR</span>
                                    <div className="flex-1 h-px bg-border-subtle" />
                                </div>
                            )}

                            {/* URL input */}
                            {!data.imageUrl && (
                                <input
                                    type="url"
                                    value={data.imageUrl}
                                    onChange={e => {
                                        const url = e.target.value;
                                        // Only set if empty or valid URL format
                                        if (!url || url.startsWith('http://') || url.startsWith('https://')) {
                                            setData({ ...data, imageUrl: url });
                                        }
                                    }}
                                    placeholder="Paste image URL here (https://...)"
                                    className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                                />
                            )}

                            <p className="text-xs text-text-muted mt-2">
                                Recommended: 400x400 square image (PNG or JPG)
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Dev Buy Amount (Optional)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={data.devBuy || ''}
                                    onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        setData({ ...data, devBuy: isNaN(val) ? undefined : Math.min(10, Math.max(0, val)) });
                                    }}
                                    placeholder="0"
                                    step="0.1"
                                    min="0"
                                    max="10"
                                    className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 pr-16 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted">SOL</span>
                            </div>
                            <p className="text-xs text-text-muted mt-2">
                                Amount of SOL to use for initial buy at launch (0-10 SOL)
                            </p>
                        </div>

                        {/* MM Strategy Selection */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm text-text-muted">Market Making Strategy</label>
                                <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
                                    {data.mmAlgorithm === 'turbo_lite' ? 'Recommended' : data.mmAlgorithm === 'simple' ? 'Stable' : 'Advanced'}
                                </span>
                            </div>
                            <div className="space-y-2 mb-4">
                                {[
                                    {
                                        value: 'simple',
                                        label: '🐢 Simple',
                                        desc: 'Steady & reliable - 5 buys/sells per cycle',
                                        tooltip: 'Best for lower-volume tokens',
                                        disabled: false
                                    },
                                    {
                                        value: 'turbo_lite',
                                        label: '🚀 Turbo Lite',
                                        desc: 'High frequency - 8 buys/sells, 4x more trades',
                                        tooltip: 'More volume, more fees',
                                        disabled: false
                                    },
                                    {
                                        value: 'rebalance',
                                        label: '⚖️ Rebalance',
                                        desc: 'Auto-balance SOL/token ratio',
                                        tooltip: 'Coming soon',
                                        disabled: true
                                    },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => !opt.disabled && setData({ ...data, mmAlgorithm: opt.value as TokenData['mmAlgorithm'] })}
                                        className={`w-full p-3 rounded-lg text-left transition-colors ${
                                            opt.disabled
                                                ? 'bg-bg-secondary/50 text-text-muted cursor-not-allowed opacity-50'
                                                : data.mmAlgorithm === opt.value
                                                    ? 'bg-accent-primary/20 border-2 border-accent-primary text-text-primary'
                                                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-card-hover border border-border-subtle'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{opt.label}</span>
                                            {opt.disabled && <span className="text-xs text-text-muted">Soon</span>}
                                        </div>
                                        <div className="text-xs text-text-muted mt-1">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-text-muted">
                                {data.mmAlgorithm === 'turbo_lite'
                                    ? '🚀 Turbo generates more trading volume and fees but uses more capital.'
                                    : data.mmAlgorithm === 'simple'
                                    ? '🐢 Simple is best for getting started or lower-volume tokens.'
                                    : '⚖️ Rebalance maintains a target allocation automatically.'}
                            </p>
                        </div>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 text-sm space-y-2">
                            <p className="text-text-secondary">
                                <span className="text-text-muted">Minimum:</span>{' '}
                                <span className="text-accent-primary font-medium">{(0.1 + (data.devBuy || 0)).toFixed(2)} SOL</span>
                                <span className="text-text-muted ml-1">(0.1 base{data.devBuy ? ` + ${data.devBuy.toFixed(2)} dev buy` : ''})</span>
                            </p>
                            <p className="text-text-muted text-xs">
                                💡 Tip: We recommend <span className="text-accent-primary">{(0.5 + (data.devBuy || 0)).toFixed(2)} SOL</span> total for effective market making
                            </p>
                        </div>

                        <button
                            onClick={handleContinueToSocials}
                            disabled={!canContinueDetails}
                            className="w-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-card disabled:text-text-muted text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
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
                        <p className="text-sm text-text-muted mb-4">
                            Optional: Add social links to help build your community
                        </p>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Twitter / X</label>
                            <input
                                type="text"
                                value={data.twitter || ''}
                                onChange={e => setData({ ...data, twitter: e.target.value })}
                                placeholder="https://x.com/yourtoken"
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Telegram</label>
                            <input
                                type="text"
                                value={data.telegram || ''}
                                onChange={e => setData({ ...data, telegram: e.target.value })}
                                placeholder="https://t.me/yourtoken"
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-2">Website</label>
                            <input
                                type="text"
                                value={data.website || ''}
                                onChange={e => setData({ ...data, website: e.target.value })}
                                placeholder="https://yourtoken.com"
                                className="w-full bg-bg-card border border-border-subtle rounded-xl p-4 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-border-accent"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleContinueToReview}
                                className="flex-1 bg-bg-card border border-border-subtle hover:bg-bg-card-hover text-text-primary py-4 rounded-xl font-medium transition-colors btn-press"
                            >
                                Skip
                            </button>
                            <button
                                onClick={handleContinueToReview}
                                className="flex-1 bg-accent-primary hover:bg-accent-secondary text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
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
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 space-y-4">
                            {data.imageUrl && (
                                <div className="flex justify-center mb-2">
                                    <img
                                        src={data.imageUrl}
                                        alt={data.name}
                                        className="w-20 h-20 rounded-xl object-cover border-2 border-border-accent"
                                    />
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-text-muted mb-1">Token Name</p>
                                <p className="font-medium text-text-primary">{data.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-1">Symbol</p>
                                <p className="font-medium text-text-primary">{data.symbol}</p>
                            </div>
                            <div>
                                <p className="text-xs text-text-muted mb-1">Description</p>
                                <p className="text-sm text-text-secondary">{data.description}</p>
                            </div>
                            {(data.twitter || data.telegram || data.website) && (
                                <div>
                                    <p className="text-xs text-text-muted mb-1">Social Links</p>
                                    <div className="space-y-1">
                                        {data.twitter && (
                                            <p className="text-sm text-accent-primary truncate">{data.twitter}</p>
                                        )}
                                        {data.telegram && (
                                            <p className="text-sm text-accent-primary truncate">{data.telegram}</p>
                                        )}
                                        {data.website && (
                                            <p className="text-sm text-accent-primary truncate">{data.website}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {data.devBuy && data.devBuy > 0 && (
                            <div>
                                <p className="text-xs text-text-muted mb-1">Dev Buy Amount</p>
                                <p className="text-sm text-accent-primary">{data.devBuy} SOL</p>
                            </div>
                        )}

                        <div className="bg-warning/20 border border-warning/30 rounded-xl p-4 space-y-2">
                            <p className="text-sm text-warning">
                                Deposit at least <span className="font-bold">{(0.1 + (data.devBuy || 0)).toFixed(2)} SOL</span> to your dev wallet to launch.
                            </p>
                            <p className="text-xs text-warning/70">
                                💡 We recommend <span className="font-medium">{(0.5 + (data.devBuy || 0)).toFixed(2)} SOL</span> total for effective market making.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-error/20 border border-error/50 rounded-xl p-4">
                                <p className="text-sm text-error">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleCreatePendingLaunch}
                            disabled={isSubmitting}
                            className="w-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-card disabled:text-text-muted text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="animate-spin w-5 h-5 border-2 border-bg-void border-t-transparent rounded-full" />
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
                        {/* Status-based icon and title */}
                        {launchStatus === 'launching' ? (
                            <>
                                <div className="text-5xl mb-4">🚀</div>
                                <h2 className="text-xl font-bold mb-2 text-accent-primary">Launching...</h2>
                                <p className="text-text-muted mb-6">
                                    <span className="text-accent-primary font-bold">{depositBalance.toFixed(4)} SOL</span> received - launching your token...
                                </p>
                            </>
                        ) : launchStatus === 'retry_pending' ? (
                            <>
                                <div className="text-5xl mb-4">🔄</div>
                                <h2 className="text-xl font-bold mb-2 text-warning">Retrying...</h2>
                                <p className="text-text-muted mb-4">
                                    Launch attempt failed. Retrying automatically in a few seconds...
                                </p>
                                {error && <p className="text-warning/70 text-xs mb-4">{error}</p>}
                            </>
                        ) : launchStatus === 'failed' || launchStatus === 'expired' || launchStatus === 'refunded' ? (
                            <>
                                <div className="text-5xl mb-4">❌</div>
                                <h2 className="text-xl font-bold mb-2 text-error">Launch {launchStatus}</h2>
                                {error && <p className="text-text-muted mb-6">{error}</p>}
                            </>
                        ) : isExpired ? (
                            <>
                                <div className="text-5xl mb-4">⏰</div>
                                <h2 className="text-xl font-bold mb-2 text-error">Launch Expired</h2>
                                <p className="text-text-muted mb-4">
                                    This launch has expired. Please create a new launch.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="text-5xl mb-4">💰</div>
                                <h2 className="text-xl font-bold mb-2 text-text-primary">Deposit to Launch</h2>
                                <p className="text-text-muted mb-4">
                                    Send at least <span className="text-accent-primary font-bold">{pendingLaunch.required_amount?.toFixed(2) || '0.10'} SOL</span> to your dev wallet
                                </p>
                                <p className="text-text-muted text-xs mb-4">
                                    💡 We recommend <span className="text-accent-primary">{((pendingLaunch.required_amount || 0.1) + 0.4).toFixed(2)} SOL</span> total for effective MM
                                </p>
                            </>
                        )}

                        {/* Expiration Warning */}
                        {formatTime && !isExpired && launchStatus === 'awaiting_deposit' && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`rounded-xl p-3 mb-4 ${
                                    isExpiring
                                        ? 'bg-error/20 border border-error/30'
                                        : 'bg-bg-card border border-border-subtle'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <span className={isExpiring ? 'text-error' : 'text-text-muted'}>
                                        ⏱️
                                    </span>
                                    <span className={`font-mono text-sm ${isExpiring ? 'text-error font-bold' : 'text-text-secondary'}`}>
                                        {isExpiring ? '⚠️ Expires in ' : 'Time remaining: '}
                                        {formatTime}
                                    </span>
                                </div>
                                {isExpiring && (
                                    <p className="text-xs text-error/70 mt-1 text-center">
                                        Deposit now to avoid losing this launch!
                                    </p>
                                )}
                            </motion.div>
                        )}

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-4">
                            <p className="text-sm text-text-muted mb-2">Dev Wallet Address</p>
                            <div className="flex justify-center">
                                <WalletAddress
                                    address={devWallet?.address || pendingLaunch.deposit_address}
                                    className="text-sm"
                                />
                            </div>
                        </div>

                        {/* Deposit Progress */}
                        <div className="mb-4">
                            <DepositProgress
                                currentBalance={depositBalance}
                                requiredAmount={pendingLaunch.required_amount || 0.1}
                                recommendedAmount={(pendingLaunch.required_amount || 0.1) + 0.4}
                                accentColor="primary"
                            />
                        </div>

                        {/* Status indicator */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2">
                                {launchStatus === 'launching' ? (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full" />
                                        <span className="text-sm text-accent-primary">Launching on Bags.fm...</span>
                                    </>
                                ) : launchStatus === 'retry_pending' ? (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-warning border-t-transparent rounded-full" />
                                        <span className="text-sm text-warning">Retrying in a few seconds...</span>
                                    </>
                                ) : launchStatus === 'failed' || launchStatus === 'expired' || launchStatus === 'refunded' ? (
                                    <span className="text-sm text-error">
                                        {launchStatus === 'refunded' ? 'SOL has been refunded to your wallet' : 'Please try again'}
                                    </span>
                                ) : (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full" />
                                        <span className="text-sm text-text-muted">Waiting for deposit...</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <p className="text-sm text-text-muted mb-6">
                            {launchStatus === 'launching'
                                ? 'This may take a few moments. Do not close this page.'
                                : launchStatus === 'retry_pending'
                                ? 'An error occurred. Retrying automatically...'
                                : launchStatus === 'failed' || launchStatus === 'expired'
                                ? 'Use the button below to return to dashboard and try again.'
                                : 'Your token will launch automatically when the deposit is detected.'}
                        </p>

                        <button
                            onClick={handleGoToDashboard}
                            className="w-full bg-bg-card border border-border-subtle hover:bg-bg-card-hover text-text-primary py-4 rounded-xl font-medium transition-colors btn-press"
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
                        <h2 className="text-2xl font-bold mb-2 text-accent-primary">Token Launched!</h2>
                        <p className="text-text-muted mb-8">
                            Your token is now live on Bags.fm
                        </p>

                        <button
                            onClick={handleGoToDashboard}
                            className="w-full bg-accent-primary hover:bg-accent-secondary text-bg-void py-4 rounded-xl font-medium transition-colors btn-press"
                        >
                            View in Dashboard
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
