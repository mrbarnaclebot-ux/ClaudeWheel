'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface TokenInfo {
    tokenMint: string;
    tokenName: string;
    tokenSymbol: string;
    tokenImage?: string;
    tokenDecimals: number;
    creatorAddress: string;
}

type Step = 'enter' | 'validate' | 'review' | 'success';

export default function RegisterPage() {
    const queryClient = useQueryClient();
    const { getAccessToken } = usePrivy();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('enter');
    const [mintAddress, setMintAddress] = useState('');
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [registeredTokenId, setRegisteredTokenId] = useState<string | null>(null);

    // Validate token from Bags.fm
    const validateMutation = useMutation({
        mutationFn: async (mint: string) => {
            const token = await getAccessToken();
            const res = await api.get(`/api/bags/token/${mint}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data as TokenInfo;
        },
        onSuccess: (data) => {
            setTokenInfo(data);
            setError(null);
            setStep('review');
            hapticFeedback('medium');
        },
        onError: (err: any) => {
            setError(err.response?.data?.error || 'Failed to fetch token info. Make sure this is a valid Bags.fm token.');
            hapticFeedback('heavy');
        },
    });

    // Register token
    const registerMutation = useMutation({
        mutationFn: async () => {
            if (!tokenInfo) throw new Error('No token info');
            const token = await getAccessToken();
            const res = await api.post('/api/privy/tokens', {
                tokenMintAddress: tokenInfo.tokenMint,
                tokenSymbol: tokenInfo.tokenSymbol,
                tokenName: tokenInfo.tokenName,
                tokenImage: tokenInfo.tokenImage,
                tokenDecimals: tokenInfo.tokenDecimals,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data;
        },
        onSuccess: (data) => {
            setRegisteredTokenId(data.tokenId);
            setStep('success');
            queryClient.invalidateQueries({ queryKey: ['tokens'] });
            hapticFeedback('medium');
        },
        onError: (err: any) => {
            setError(err.response?.data?.error || 'Failed to register token');
            hapticFeedback('heavy');
        },
    });

    const handleValidate = () => {
        if (!mintAddress.trim()) {
            setError('Please enter a token mint address');
            return;
        }
        setStep('validate');
        validateMutation.mutate(mintAddress.trim());
    };

    const handleRegister = () => {
        registerMutation.mutate();
    };

    const handleBack = () => {
        if (step === 'review') {
            setStep('enter');
            setTokenInfo(null);
        }
    };

    return (
        <div className="min-h-screen p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                {step !== 'success' && (
                    <Link
                        href="/dashboard"
                        onClick={() => hapticFeedback('light')}
                        className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                    >
                        ←
                    </Link>
                )}
                <div>
                    <h1 className="text-xl font-bold">Register Token</h1>
                    <p className="text-sm text-gray-400">Add an existing token to flywheel</p>
                </div>
            </div>

            {/* Step Indicator */}
            {step !== 'success' && (
                <div className="flex items-center justify-center gap-2 mb-8">
                    <StepDot active={step === 'enter'} completed={step !== 'enter'} label="1" />
                    <div className="w-8 h-0.5 bg-gray-700" />
                    <StepDot active={step === 'validate'} completed={step === 'review'} label="2" />
                    <div className="w-8 h-0.5 bg-gray-700" />
                    <StepDot active={step === 'review'} completed={false} label="3" />
                </div>
            )}

            {/* Step Content */}
            <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
            >
                {step === 'enter' && (
                    <div className="space-y-6">
                        <div className="bg-gray-800/50 rounded-xl p-4">
                            <label className="block text-sm text-gray-400 mb-2">Token Mint Address</label>
                            <input
                                type="text"
                                value={mintAddress}
                                onChange={(e) => setMintAddress(e.target.value)}
                                placeholder="Enter mint address..."
                                className="w-full bg-gray-900 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                Enter the Solana mint address of your token launched on Bags.fm
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleValidate}
                            disabled={!mintAddress.trim()}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl py-4 font-medium transition-colors"
                        >
                            Validate Token
                        </button>
                    </div>
                )}

                {step === 'validate' && (
                    <div className="bg-gray-800/50 rounded-xl p-8 text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-gray-400">Fetching token info from Bags.fm...</p>
                    </div>
                )}

                {step === 'review' && tokenInfo && (
                    <div className="space-y-6">
                        {/* Token Preview */}
                        <div className="bg-gray-800/50 rounded-xl p-6 text-center">
                            {tokenInfo.tokenImage ? (
                                <img
                                    src={tokenInfo.tokenImage}
                                    alt={tokenInfo.tokenSymbol}
                                    className="w-20 h-20 rounded-full mx-auto mb-4 object-cover"
                                />
                            ) : (
                                <div className="w-20 h-20 bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl font-bold">
                                    {tokenInfo.tokenSymbol[0]}
                                </div>
                            )}
                            <h2 className="text-2xl font-bold">{tokenInfo.tokenName}</h2>
                            <p className="text-gray-400">${tokenInfo.tokenSymbol}</p>
                        </div>

                        {/* Token Details */}
                        <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Mint Address</span>
                                <span className="font-mono text-xs truncate max-w-[180px]">{tokenInfo.tokenMint}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Decimals</span>
                                <span>{tokenInfo.tokenDecimals}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Creator</span>
                                <span className="font-mono text-xs truncate max-w-[180px]">{tokenInfo.creatorAddress}</span>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="bg-blue-500/20 border border-blue-500/50 rounded-xl p-4 text-blue-400 text-sm">
                            By registering this token, you confirm that you are the creator and want to enable the flywheel for automated fee collection and market making.
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleBack}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-xl py-4 font-medium transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleRegister}
                                disabled={registerMutation.isPending}
                                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 rounded-xl py-4 font-medium transition-colors"
                            >
                                {registerMutation.isPending ? 'Registering...' : 'Register Token'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'success' && (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full mx-auto flex items-center justify-center">
                            <span className="text-4xl">✓</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-2">Token Registered!</h2>
                            <p className="text-gray-400">
                                Your token has been added to ClaudeWheel. The flywheel is now active.
                            </p>
                        </div>

                        <div className="bg-gray-800/50 rounded-xl p-4 space-y-2 text-left">
                            <p className="text-green-400 flex items-center gap-2">
                                <span>✓</span> Flywheel enabled
                            </p>
                            <p className="text-green-400 flex items-center gap-2">
                                <span>✓</span> Auto-claim active
                            </p>
                            <p className="text-gray-400 text-sm">
                                Trading will begin automatically when the ops wallet has SOL.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {registeredTokenId && (
                                <Link
                                    href={`/token/${registeredTokenId}`}
                                    onClick={() => hapticFeedback('light')}
                                    className="w-full bg-green-600 hover:bg-green-500 rounded-xl py-4 font-medium transition-colors text-center"
                                >
                                    View Token Details
                                </Link>
                            )}
                            <Link
                                href="/dashboard"
                                onClick={() => hapticFeedback('light')}
                                className="w-full bg-gray-700 hover:bg-gray-600 rounded-xl py-4 font-medium transition-colors text-center"
                            >
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function StepDot({ active, completed, label }: { active: boolean; completed: boolean; label: string }) {
    return (
        <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                completed ? 'bg-green-500 text-white' :
                active ? 'bg-green-600 text-white' :
                'bg-gray-700 text-gray-400'
            }`}
        >
            {completed ? '✓' : label}
        </div>
    );
}
