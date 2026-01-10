'use client';

// Force dynamic rendering - this page uses Privy hooks which require runtime
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useTelegram } from '@/components/TelegramProvider';
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
}

interface PendingLaunch {
    id: string;
    status: 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded';
    deposit_address: string;
    required_amount: number;
    token_mint?: string;
    balance?: number;
    error?: string;
}

export default function LaunchPage() {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<LaunchStep>('details');
    const [data, setData] = useState<TokenData>({
        name: '',
        symbol: '',
        description: '',
        imageUrl: '',
    });
    const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [launchStatus, setLaunchStatus] = useState<string>('awaiting_deposit');
    const [depositBalance, setDepositBalance] = useState<number>(0);
    const [isUploading, setIsUploading] = useState(false);

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
            } else {
                setError('Failed to upload image');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to upload image');
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
                setStep('launched');
            } else if (launch.status === 'failed' || launch.status === 'expired' || launch.status === 'refunded') {
                setError(launch.lastError || launch.error || `Launch ${launch.status}`);
            }
        } catch (err) {
            console.error('Failed to poll launch status:', err);
        }
    }, [pendingLaunch?.id, getAccessToken, hapticFeedback]);

    // Start polling when in depositing step
    useEffect(() => {
        if (step !== 'depositing' || !pendingLaunch?.id) return;

        // Poll immediately
        pollLaunchStatus();

        // Then poll every 5 seconds
        const interval = setInterval(pollLaunchStatus, 5000);

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

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Token Image *</label>

                            {/* Image preview */}
                            {data.imageUrl && (
                                <div className="mb-3 flex justify-center">
                                    <div className="relative">
                                        <img
                                            src={data.imageUrl}
                                            alt="Token preview"
                                            className="w-24 h-24 rounded-xl object-cover bg-gray-700"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                setData(prev => ({ ...prev, imageUrl: '' }));
                                                setError('Failed to load image - please try a different URL');
                                            }}
                                        />
                                        <button
                                            onClick={() => setData({ ...data, imageUrl: '' })}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Upload button */}
                            {!data.imageUrl && (
                                <label className={`block w-full bg-gray-800 rounded-xl p-4 text-center cursor-pointer hover:bg-gray-700 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
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
                                        <span className="flex items-center justify-center gap-2 text-gray-400">
                                            <span className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                                            Uploading...
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">
                                            📤 Tap to upload image
                                        </span>
                                    )}
                                </label>
                            )}

                            {/* Or divider */}
                            {!data.imageUrl && (
                                <div className="flex items-center gap-3 my-3">
                                    <div className="flex-1 h-px bg-gray-700" />
                                    <span className="text-xs text-gray-500">OR</span>
                                    <div className="flex-1 h-px bg-gray-700" />
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
                                    className="w-full bg-gray-800 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            )}

                            <p className="text-xs text-gray-500 mt-2">
                                Recommended: 400x400 square image (PNG or JPG)
                            </p>
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
                            {data.imageUrl && (
                                <div className="flex justify-center mb-2">
                                    <img
                                        src={data.imageUrl}
                                        alt={data.name}
                                        className="w-20 h-20 rounded-xl object-cover"
                                    />
                                </div>
                            )}
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
                        {/* Status-based icon and title */}
                        {launchStatus === 'launching' ? (
                            <>
                                <div className="text-5xl mb-4">🚀</div>
                                <h2 className="text-xl font-bold mb-2 text-green-400">Deposit Detected!</h2>
                                <p className="text-gray-400 mb-6">
                                    <span className="text-green-400 font-bold">{depositBalance.toFixed(4)} SOL</span> received - launching your token...
                                </p>
                            </>
                        ) : launchStatus === 'failed' || launchStatus === 'expired' || launchStatus === 'refunded' ? (
                            <>
                                <div className="text-5xl mb-4">❌</div>
                                <h2 className="text-xl font-bold mb-2 text-red-400">Launch {launchStatus}</h2>
                                {error && <p className="text-gray-400 mb-6">{error}</p>}
                            </>
                        ) : (
                            <>
                                <div className="text-5xl mb-4">💰</div>
                                <h2 className="text-xl font-bold mb-2">Deposit to Launch</h2>
                                <p className="text-gray-400 mb-6">
                                    Send at least <span className="text-green-400 font-bold">0.5 SOL</span> to your dev wallet
                                </p>
                            </>
                        )}

                        <div className="bg-gray-800 rounded-xl p-4 mb-4">
                            <p className="text-sm text-gray-400 mb-2">Dev Wallet Address</p>
                            <p className="font-mono text-green-400 text-sm break-all">
                                {devWallet?.address || pendingLaunch.deposit_address}
                            </p>
                        </div>

                        {/* Balance indicator */}
                        {depositBalance > 0 && (
                            <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4 mb-4">
                                <p className="text-sm text-green-400">
                                    Current Balance: <span className="font-bold">{depositBalance.toFixed(4)} SOL</span>
                                </p>
                            </div>
                        )}

                        {/* Status indicator */}
                        <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2">
                                {launchStatus === 'launching' ? (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                                        <span className="text-sm text-green-400">Launching on Bags.fm...</span>
                                    </>
                                ) : launchStatus === 'failed' || launchStatus === 'expired' || launchStatus === 'refunded' ? (
                                    <span className="text-sm text-red-400">
                                        {launchStatus === 'refunded' ? 'SOL has been refunded to your wallet' : 'Please try again'}
                                    </span>
                                ) : (
                                    <>
                                        <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                                        <span className="text-sm text-gray-400">Waiting for deposit...</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 mb-6">
                            {launchStatus === 'launching'
                                ? 'This may take a few moments. Do not close this page.'
                                : launchStatus === 'failed' || launchStatus === 'expired'
                                ? 'Use the button below to return to dashboard and try again.'
                                : 'Your token will launch automatically when the deposit is detected.'}
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
