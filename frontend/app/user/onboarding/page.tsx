'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivyWrapper, useSignersWrapper, useWalletsWrapper, useCreateWalletWrapper, type WalletWithMetadata } from '@/app/hooks/usePrivyWrapper';
import { useTelegram } from '@/app/components/WebProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/app/lib/toast';
import { api } from '@/app/lib/api';

// Key Quorum ID from Privy Dashboard -> Wallet Infrastructure -> Authorization Keys
const PRIVY_SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

type Step = 'welcome' | 'creating_wallets' | 'delegate_dev' | 'delegate_ops' | 'registering' | 'complete';

export default function OnboardingPage() {
    const router = useRouter();
    const { ready, authenticated, getAccessToken, user } = usePrivyWrapper();
    const { wallets } = useWalletsWrapper();
    const { createWallet } = useCreateWalletWrapper();
    const { addSigners } = useSignersWrapper();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('welcome');
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [debugInfo, setDebugInfo] = useState<string | null>(null);

    const walletsRef = useRef(wallets);
    const solanaWallets = wallets;

    const isWalletDelegated = (walletAddress: string): boolean => {
        if (!user?.linkedAccounts) return false;
        return user.linkedAccounts.some(
            (account: any): account is WalletWithMetadata =>
                account.type === 'wallet' &&
                (account as WalletWithMetadata).address === walletAddress &&
                (account as WalletWithMetadata).delegated === true
        );
    };

    const [shouldAutoComplete, setShouldAutoComplete] = useState(false);

    useEffect(() => {
        walletsRef.current = wallets;
    }, [wallets]);

    useEffect(() => {
        if (!ready || !authenticated || wallets.length < 2 || step !== 'welcome') return;

        const devDelegated = isWalletDelegated(wallets[0]?.address);
        const opsDelegated = isWalletDelegated(wallets[1]?.address);

        if (devDelegated && opsDelegated) {
            setStep('registering');
            setShouldAutoComplete(true);
        } else if (devDelegated) {
            setStep('delegate_ops');
        } else {
            setStep('delegate_dev');
        }
    }, [ready, authenticated, wallets.length, step, user?.linkedAccounts]);

    useEffect(() => {
        if (!ready || !authenticated) return;

        if (wallets.length >= 2) {
            const devDelegated = isWalletDelegated(wallets[0]?.address);
            const opsDelegated = isWalletDelegated(wallets[1]?.address);

            if (devDelegated && opsDelegated) {
                router.replace('/user/dashboard');
                return;
            } else if (devDelegated) {
                setStep('delegate_ops');
                setIsInitializing(false);
            } else {
                setStep('delegate_dev');
                setIsInitializing(false);
            }
        } else if (wallets.length === 0) {
            const timer = setTimeout(() => {
                if (walletsRef.current.length === 0) {
                    setIsInitializing(false);
                }
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [ready, authenticated, wallets.length, user?.linkedAccounts, router]);

    async function handleStart() {
        if (!ready || !authenticated) {
            setError('Please wait for authentication to complete.');
            return;
        }

        if (isCreating) return;
        setIsCreating(true);
        hapticFeedback('medium');
        setError(null);

        try {
            if (wallets.length >= 2) {
                const devDelegated = isWalletDelegated(wallets[0]?.address);
                if (devDelegated) {
                    setStep('delegate_ops');
                } else {
                    setStep('delegate_dev');
                }
                setIsCreating(false);
                return;
            }

            setStep('creating_wallets');

            if (wallets.length === 0) {
                await createWallet();
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (wallets.length > 0) break;
                }
            }

            if (wallets.length < 2) {
                await createWallet({ createAdditional: true });
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (wallets.length >= 2) break;
                }
            }

            toast.success('Wallets created successfully');
            setStep('delegate_dev');
        } catch (err: any) {
            const errorMsg = err?.message || 'Unknown error';

            if (errorMsg.includes('already has') || errorMsg.includes('embedded wallet')) {
                for (let i = 0; i < 15; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (wallets.length >= 2) break;
                }

                if (wallets.length < 2) {
                    router.replace('/user/dashboard');
                    return;
                }

                const devDelegated = isWalletDelegated(wallets[0]?.address);
                const opsDelegated = isWalletDelegated(wallets[1]?.address);

                if (devDelegated && opsDelegated) {
                    router.replace('/user/dashboard');
                } else if (devDelegated) {
                    setStep('delegate_ops');
                } else {
                    setStep('delegate_dev');
                }

                toast.info('Wallets already exist');
                return;
            }

            setError(`Failed to create wallets: ${errorMsg}`);
            toast.error('Wallet creation failed');
            setStep('welcome');
        } finally {
            setIsCreating(false);
        }
    }

    const [isDelegating, setIsDelegating] = useState(false);

    async function handleDelegateDev() {
        hapticFeedback('medium');
        setError(null);
        setIsDelegating(true);

        try {
            if (!PRIVY_SIGNER_ID) {
                throw new Error('NEXT_PUBLIC_PRIVY_SIGNER_ID not configured');
            }

            const devWallet = solanaWallets[0];
            if (!devWallet) {
                throw new Error('Dev wallet not found');
            }

            const isDelegated = isWalletDelegated(devWallet.address);

            if (isDelegated) {
                setStep('delegate_ops');
                return;
            }

            await addSigners({
                address: devWallet.address,
                signers: [{ signerId: PRIVY_SIGNER_ID, policyIds: [] }],
            });

            toast.success('Dev wallet authorized');
            setStep('delegate_ops');
        } catch (err: any) {
            const errorMsg = `Dev wallet authorization failed: ${err?.message || 'Unknown error'}`;
            setError(errorMsg);
            toast.error('Dev wallet authorization failed');
        } finally {
            setIsDelegating(false);
        }
    }

    async function handleDelegateOps() {
        hapticFeedback('medium');
        setError(null);
        setDebugInfo(null);
        setIsDelegating(true);

        try {
            if (!PRIVY_SIGNER_ID) {
                throw new Error('NEXT_PUBLIC_PRIVY_SIGNER_ID not configured');
            }

            const opsWallet = solanaWallets[1];
            if (!opsWallet) {
                throw new Error('Ops wallet not found');
            }

            const isDelegated = isWalletDelegated(opsWallet.address);

            if (isDelegated) {
                setStep('registering');
                await completeRegistration();
                return;
            }

            await addSigners({
                address: opsWallet.address,
                signers: [{ signerId: PRIVY_SIGNER_ID, policyIds: [] }],
            });

            toast.success('Ops wallet authorized');
            setStep('registering');
            await completeRegistration();
        } catch (err: any) {
            const errorMsg = `Ops wallet authorization failed: ${err?.message || 'Unknown error'}`;
            setError(errorMsg);
            toast.error('Ops wallet authorization failed');
        } finally {
            setIsDelegating(false);
        }
    }

    async function completeRegistration() {
        try {
            const authToken = await getAccessToken();
            if (!authToken) {
                throw new Error('Failed to get auth token');
            }

            const payload = {
                devWalletAddress: solanaWallets[0]?.address,
                opsWalletAddress: solanaWallets[1]?.address,
            };

            await api.post('/api/users/complete-onboarding', payload, {
                headers: { Authorization: `Bearer ${authToken}` },
            });

            hapticFeedback('heavy');
            toast.success('Registration complete!');
            setStep('complete');

            setTimeout(() => router.replace('/user/dashboard'), 1500);
        } catch (err: any) {
            const errorMsg = err?.response?.data?.error || err?.message || 'Unknown error';
            setError(`Registration failed: ${errorMsg}`);
            toast.error('Registration failed');
            setStep('delegate_ops');
        }
    }

    useEffect(() => {
        if (shouldAutoComplete && step === 'registering') {
            completeRegistration();
            setShouldAutoComplete(false);
        }
    }, [shouldAutoComplete, step]);

    // Get user display name
    const displayName = user?.email?.address?.split('@')[0] || user?.google?.name || '';

    return (
        <div className="min-h-screen flex flex-col p-6 bg-bg-void">
            {(!ready || isInitializing) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
                    <p className="text-text-muted text-sm">Loading...</p>
                </div>
            ) : (
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
                                <h1 className="text-2xl font-bold mb-3 text-text-primary">
                                    Welcome to ClaudeWheel
                                </h1>
                                <p className="text-text-muted mb-2">
                                    Hey{displayName ? `, ${displayName}` : ''}!
                                </p>
                                <p className="text-text-muted max-w-sm">
                                    Launch tokens on Bags.fm and let our flywheel
                                    automatically trade and collect fees for you.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                                    <h3 className="font-medium mb-2 text-text-primary">What you'll get:</h3>
                                    <ul className="text-sm text-text-muted space-y-2">
                                        <li>✓ Two secure Solana wallets</li>
                                        <li>✓ Automated market-making</li>
                                        <li>✓ Automatic fee collection</li>
                                        <li>✓ Real-time notifications</li>
                                    </ul>
                                </div>

                                <button
                                    onClick={handleStart}
                                    disabled={isCreating || wallets.length >= 2}
                                    className="w-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-card disabled:text-text-muted text-bg-void py-4 rounded-xl font-medium text-lg transition-colors btn-press"
                                >
                                    {wallets.length >= 2 ? 'Wallets Ready' : 'Get Started'}
                                </button>

                                {error && (
                                    <p className="text-error text-sm text-center">{error}</p>
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
                            <div className="animate-spin w-12 h-12 border-3 border-accent-primary border-t-transparent rounded-full mb-6" />
                            <h2 className="text-xl font-medium mb-2 text-text-primary">Creating Your Wallets</h2>
                            <p className="text-text-muted">This only takes a moment...</p>
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
                                <h2 className="text-xl font-bold mb-3 text-text-primary">Authorize Dev Wallet</h2>
                                <p className="text-text-muted text-center mb-6 max-w-sm">
                                    Step 1 of 2: Enable trading for your Dev wallet.
                                </p>

                                <div className="bg-bg-card border border-border-subtle rounded-xl p-4 w-full mb-6">
                                    <span className="text-xs text-text-muted">Dev Wallet</span>
                                    <p className="text-accent-primary font-mono text-sm truncate">
                                        {solanaWallets[0]?.address}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleDelegateDev}
                                disabled={isDelegating}
                                className="w-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-card text-bg-void py-4 rounded-xl font-medium text-lg flex items-center justify-center gap-2 transition-colors btn-press"
                            >
                                {isDelegating ? (
                                    <>
                                        <div className="animate-spin w-5 h-5 border-2 border-bg-void border-t-transparent rounded-full" />
                                        Delegating...
                                    </>
                                ) : (
                                    'Authorize Dev Wallet'
                                )}
                            </button>

                            {error && (
                                <p className="text-error text-sm text-center mt-4">{error}</p>
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
                                <h2 className="text-xl font-bold mb-3 text-text-primary">Authorize Ops Wallet</h2>
                                <p className="text-text-muted text-center mb-6 max-w-sm">
                                    Step 2 of 2: Enable trading for your Ops wallet.
                                </p>

                                <div className="bg-bg-card border border-border-subtle rounded-xl p-4 w-full mb-6">
                                    <span className="text-xs text-text-muted">Ops Wallet</span>
                                    <p className="text-accent-primary font-mono text-sm truncate">
                                        {solanaWallets[1]?.address}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleDelegateOps}
                                disabled={isDelegating}
                                className="w-full bg-accent-primary hover:bg-accent-secondary disabled:bg-bg-card text-bg-void py-4 rounded-xl font-medium text-lg flex items-center justify-center gap-2 transition-colors btn-press"
                            >
                                {isDelegating ? (
                                    <>
                                        <div className="animate-spin w-5 h-5 border-2 border-bg-void border-t-transparent rounded-full" />
                                        Delegating...
                                    </>
                                ) : (
                                    'Authorize Ops Wallet'
                                )}
                            </button>

                            {error && (
                                <p className="text-error text-sm text-center mt-4">{error}</p>
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
                            <div className="animate-spin w-12 h-12 border-3 border-accent-primary border-t-transparent rounded-full mb-6" />
                            <h2 className="text-xl font-medium mb-2 text-text-primary">Completing Setup</h2>
                            <p className="text-text-muted">Registering with backend...</p>
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
                            <h2 className="text-2xl font-bold mb-2 text-success">You're All Set!</h2>
                            <p className="text-text-muted">Redirecting to dashboard...</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    );
}
