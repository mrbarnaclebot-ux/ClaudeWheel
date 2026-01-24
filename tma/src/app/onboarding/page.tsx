'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSigners, type WalletWithMetadata } from '@privy-io/react-auth';
import { useWallets, useCreateWallet } from '@privy-io/react-auth/solana';
import { useTelegram } from '@/components/TelegramProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// Key Quorum ID from Privy Dashboard -> Wallet Infrastructure -> Authorization Keys
const PRIVY_SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

type Step = 'welcome' | 'creating_wallets' | 'delegate_dev' | 'delegate_ops' | 'registering' | 'complete';

export default function OnboardingPage() {
    const router = useRouter();
    const { ready, authenticated, getAccessToken, user } = usePrivy();
    const { wallets } = useWallets();
    const { createWallet } = useCreateWallet();
    // Use new Signers API (replaces deprecated delegateWallet)
    const { addSigners } = useSigners();
    const { user: telegramUser, hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('welcome');
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [debugInfo, setDebugInfo] = useState<string | null>(null);

    // Track wallet loading state - prevents showing welcome screen before wallets load
    const [walletsLoading, setWalletsLoading] = useState(true);
    const walletsLoadingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autoCompleteAttempted = useRef(false); // Prevent double auto-complete

    // Ref to track current wallets for setTimeout callback (avoids closure capture)
    const walletsRef = useRef(wallets);

    // Extract Solana wallets from linkedAccounts (more reliable than useWallets hook in TMA)
    const linkedSolanaWallets = (user?.linkedAccounts?.filter(
        (account: any): account is WalletWithMetadata =>
            account.type === 'wallet' &&
            (account as WalletWithMetadata).chainType === 'solana'
    ) || []) as WalletWithMetadata[];

    // Use linkedAccounts as primary source, fall back to useWallets hook
    const solanaWallets = linkedSolanaWallets.length >= 2 ? linkedSolanaWallets : wallets;
    const effectiveWalletCount = Math.max(linkedSolanaWallets.length, wallets.length);

    // Helper to check if a wallet is already delegated via user.linkedAccounts
    const isWalletDelegated = (walletAddress: string): boolean => {
        if (!user?.linkedAccounts) return false;
        return user.linkedAccounts.some(
            (account: any): account is WalletWithMetadata =>
                account.type === 'wallet' &&
                (account as WalletWithMetadata).address === walletAddress &&
                (account as WalletWithMetadata).delegated === true
        );
    };

    // Track if we should auto-complete registration (both wallets already delegated)
    const [shouldAutoComplete, setShouldAutoComplete] = useState(false);

    // Keep walletsRef in sync with current wallets array
    useEffect(() => {
        walletsRef.current = wallets;
    }, [wallets]);

    // If user already has 2 wallets, check delegation status and skip appropriately
    useEffect(() => {
        if (!ready || !authenticated || effectiveWalletCount < 2 || step !== 'welcome') return;

        const devDelegated = isWalletDelegated(solanaWallets[0]?.address);
        const opsDelegated = isWalletDelegated(solanaWallets[1]?.address);

        console.log('[Onboarding] Checking existing wallet status:', {
            devAddress: solanaWallets[0]?.address?.slice(0, 8),
            opsAddress: solanaWallets[1]?.address?.slice(0, 8),
            devDelegated,
            opsDelegated,
        });

        if (devDelegated && opsDelegated) {
            // Both wallets already delegated, skip to registration
            console.log('[Onboarding] Both wallets already delegated, completing registration...');
            setStep('registering');
            setShouldAutoComplete(true);
        } else if (devDelegated) {
            // Dev wallet delegated, skip to ops delegation
            console.log('[Onboarding] Dev wallet already delegated, skipping to ops...');
            setStep('delegate_ops');
        } else {
            // Need to delegate dev wallet
            setStep('delegate_dev');
        }
    }, [ready, authenticated, effectiveWalletCount, step, user?.linkedAccounts]);

    // Wait for wallets to load with timeout
    useEffect(() => {
        if (!ready || !authenticated) {
            return;
        }

        console.log('[Onboarding] Wallet loading check:', {
            walletsHookLength: wallets.length,
            linkedSolanaWalletsLength: linkedSolanaWallets.length,
            effectiveWalletCount,
        });

        // If we have 2+ wallets from either source, done loading immediately
        if (effectiveWalletCount >= 2) {
            if (walletsLoadingTimerRef.current) {
                clearTimeout(walletsLoadingTimerRef.current);
                walletsLoadingTimerRef.current = null;
            }
            console.log('[Onboarding] Found 2+ wallets, done loading');
            setWalletsLoading(false);
            return;
        }

        // New user case (no linked wallets) - short timeout
        if (!walletsLoadingTimerRef.current) {
            walletsLoadingTimerRef.current = setTimeout(() => {
                console.log('[Onboarding] Timeout reached, assuming new user');
                setWalletsLoading(false);
                walletsLoadingTimerRef.current = null;
            }, 2500);
        }

        return () => {
            if (walletsLoadingTimerRef.current) {
                clearTimeout(walletsLoadingTimerRef.current);
                walletsLoadingTimerRef.current = null;
            }
        };
    }, [ready, authenticated, effectiveWalletCount]);

    // Auto-complete registration for users who have delegated wallets but no backend record
    useEffect(() => {
        if (!ready || !authenticated || walletsLoading || autoCompleteAttempted.current) {
            return;
        }

        if (effectiveWalletCount >= 2) {
            const devDelegated = isWalletDelegated(solanaWallets[0]?.address);
            const opsDelegated = isWalletDelegated(solanaWallets[1]?.address);

            console.log('[Onboarding] Auto-check wallet status:', { devDelegated, opsDelegated });

            if (devDelegated && opsDelegated) {
                // User has delegated wallets - auto-complete registration
                autoCompleteAttempted.current = true;
                console.log('[Onboarding] Both wallets delegated, auto-completing registration...');
                setStep('registering');
                setIsInitializing(false);
                completeRegistration();
                return;
            }
        }
    }, [ready, authenticated, walletsLoading, effectiveWalletCount, user?.linkedAccounts]);

    // Determine step for users with wallets but incomplete delegation
    useEffect(() => {
        if (!ready || !authenticated || walletsLoading) {
            return;
        }

        setIsInitializing(false);

        if (effectiveWalletCount >= 2) {
            const devDelegated = isWalletDelegated(solanaWallets[0]?.address);
            const opsDelegated = isWalletDelegated(solanaWallets[1]?.address);

            // Auto-complete case is handled by the effect above
            if (devDelegated && opsDelegated) {
                return; // Let auto-complete effect handle this
            } else if (devDelegated) {
                setStep('delegate_ops');
            } else {
                setStep('delegate_dev');
            }
        }
        // else: Stay on welcome step for new users (effectiveWalletCount < 2)
    }, [ready, authenticated, walletsLoading, effectiveWalletCount, user?.linkedAccounts]);

    // Debug logging useEffect
    useEffect(() => {
        if (ready && authenticated) {
            console.log('[Onboarding] State:', {
                step,
                walletsCount: wallets.length,
                walletAddresses: wallets.map(w => w.address.slice(0, 8)),
                linkedAccounts: user?.linkedAccounts?.length,
                devDelegated: wallets[0] ? isWalletDelegated(wallets[0].address) : false,
                opsDelegated: wallets[1] ? isWalletDelegated(wallets[1].address) : false,
            });
        }
    }, [ready, authenticated, wallets.length, step, user?.linkedAccounts]);

    async function handleStart() {
        if (!ready || !authenticated) {
            setError('Please wait for authentication to complete.');
            return;
        }

        if (isCreating) return; // Prevent double-clicks
        setIsCreating(true);
        hapticFeedback('medium');
        setError(null);

        try {
            console.log('[Onboarding] Starting wallet creation, effective count:', effectiveWalletCount);

            // GUARD: If user already has 2+ wallets (from linkedAccounts or hook), skip creation entirely
            if (effectiveWalletCount >= 2) {
                console.log('[Onboarding] User already has wallets, skipping creation');
                const devDelegated = isWalletDelegated(solanaWallets[0]?.address);
                if (devDelegated) {
                    setStep('delegate_ops');
                } else {
                    setStep('delegate_dev');
                }
                setIsCreating(false); // Reset state before returning
                return;
            }

            // Only set step to 'creating_wallets' if actually creating wallets
            setStep('creating_wallets');

            let devWalletCreated = false;
            let opsWalletCreated = false;

            // Create dev wallet if needed
            if (wallets.length === 0) {
                console.log('[Onboarding] Creating first wallet (dev)...');
                const result = await createWallet();
                console.log('[Onboarding] Dev wallet created:', result?.wallet?.address);
                devWalletCreated = true;

                // Wait for Privy state to sync (poll for wallet)
                console.log('[Onboarding] Waiting for dev wallet to appear in state...');
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (wallets.length > 0) {
                        console.log('[Onboarding] Dev wallet now in state');
                        break;
                    }
                }
            }

            // Create ops wallet if needed (check fresh wallet count)
            if (wallets.length < 2) {
                console.log('[Onboarding] Creating second wallet (ops)...');
                const result = await createWallet({ createAdditional: true });
                console.log('[Onboarding] Ops wallet created:', result?.wallet?.address);
                opsWalletCreated = true;

                // Wait for Privy state to sync
                console.log('[Onboarding] Waiting for ops wallet to appear in state...');
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    if (wallets.length >= 2) {
                        console.log('[Onboarding] Ops wallet now in state');
                        break;
                    }
                }
            }

            if (devWalletCreated || opsWalletCreated) {
                toast.success('Wallets created successfully', {
                    description: 'Your dev and ops wallets are ready',
                });
            }

            setStep('delegate_dev');
        } catch (err: any) {
            console.error('[Onboarding] Wallet creation failed:', err);
            console.error('[Onboarding] Error details:', err?.message, err?.code, err?.cause);

            const errorMsg = err?.message || 'Unknown error';

            // Check if error is "already has wallet" - use linkedAccounts data directly
            if (errorMsg.includes('already has') || errorMsg.includes('embedded wallet')) {
                console.log('[Onboarding] User already has wallets, using linkedAccounts data...');

                // Use linkedAccounts directly since useWallets() hook isn't working in TMA
                if (linkedSolanaWallets.length >= 2) {
                    const devDelegated = isWalletDelegated(linkedSolanaWallets[0]?.address);
                    const opsDelegated = isWalletDelegated(linkedSolanaWallets[1]?.address);

                    console.log('[Onboarding] Delegation status from linkedAccounts:', { devDelegated, opsDelegated });

                    // Redirect based on delegation state
                    if (devDelegated && opsDelegated) {
                        console.log('[Onboarding] Both wallets delegated, auto-completing registration');
                        setStep('registering');
                        await completeRegistration();
                    } else if (devDelegated) {
                        console.log('[Onboarding] Only dev delegated, skipping to ops delegation');
                        setStep('delegate_ops');
                    } else {
                        console.log('[Onboarding] No delegation, starting with dev delegation');
                        setStep('delegate_dev');
                    }

                    toast.info('Wallets already exist', {
                        description: 'Continuing with wallet authorization',
                    });
                    return;
                }

                // Fallback: if linkedAccounts also doesn't have wallets, redirect to dashboard
                console.error('[Onboarding] No wallets found in linkedAccounts either');
                router.replace('/dashboard');
                return;
            }

            // Other errors
            const displayError = `Failed to create wallets: ${errorMsg}. Please try again.`;
            setError(displayError);
            toast.error('Wallet creation failed', {
                description: errorMsg,
            });
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
            // Check for required signer ID
            if (!PRIVY_SIGNER_ID) {
                throw new Error('NEXT_PUBLIC_PRIVY_SIGNER_ID not configured');
            }

            const devWallet = solanaWallets[0];
            if (!devWallet) {
                throw new Error('Dev wallet not found');
            }

            // Check if already delegated via user.linkedAccounts
            const isDelegated = isWalletDelegated(devWallet.address);
            const linkedAccountsInfo = user?.linkedAccounts?.filter((a: any) => a.type === 'wallet').map((a: any) => ({
                address: (a as WalletWithMetadata).address?.slice(0, 8),
                delegated: (a as WalletWithMetadata).delegated,
                walletClientType: (a as WalletWithMetadata).walletClientType,
                chainType: (a as any).chainType || 'unknown',
            }));

            const walletInfo = `Dev: ${devWallet.address.slice(0, 8)}...\ndelegated: ${isDelegated}\nsignerId: ${PRIVY_SIGNER_ID.slice(0, 8)}...\nlinkedWallets: ${JSON.stringify(linkedAccountsInfo, null, 1)}`;
            console.log('[Onboarding] Wallet info:', walletInfo);
            setDebugInfo(walletInfo);

            if (isDelegated) {
                console.log('[Onboarding] Dev wallet already delegated, skipping...');
                setStep('delegate_ops');
                return;
            }

            setDebugInfo(`${walletInfo}\n\nAdding signer...`);
            console.log('[Onboarding] Adding signer to dev wallet:', devWallet.address);

            // Use new Signers API instead of delegateWallet
            const result = await addSigners({
                address: devWallet.address,
                signers: [{ signerId: PRIVY_SIGNER_ID, policyIds: [] }],
            });

            console.log('[Onboarding] addSigners result:', result);
            setDebugInfo(`${walletInfo}\n\nSigner added successfully!`);

            toast.success('Dev wallet authorized', {
                description: 'Trading enabled for dev wallet',
            });
            setStep('delegate_ops');
        } catch (err: any) {
            console.error('[Onboarding] Dev wallet signer failed:', err);
            console.error('[Onboarding] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

            const errorDetails = {
                message: err?.message,
                code: err?.code,
                name: err?.name,
                cause: err?.cause,
                stack: err?.stack?.split('\n')[0],
            };

            setDebugInfo(`Error: ${JSON.stringify(errorDetails)}`);
            const errorMsg = `Dev wallet authorization failed: ${err?.message || 'Unknown error'}`;
            setError(errorMsg);
            toast.error('Dev wallet authorization failed', {
                description: err?.message || 'Unknown error',
            });
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
            // Check for required signer ID
            if (!PRIVY_SIGNER_ID) {
                throw new Error('NEXT_PUBLIC_PRIVY_SIGNER_ID not configured');
            }

            const opsWallet = solanaWallets[1];
            if (!opsWallet) {
                throw new Error('Ops wallet not found');
            }

            // Check if already delegated via user.linkedAccounts
            const isDelegated = isWalletDelegated(opsWallet.address);
            const linkedAccountsInfo = user?.linkedAccounts?.filter((a: any) => a.type === 'wallet').map((a: any) => ({
                address: (a as WalletWithMetadata).address?.slice(0, 8),
                delegated: (a as WalletWithMetadata).delegated,
                walletClientType: (a as WalletWithMetadata).walletClientType,
            }));
            const walletInfo = `Ops: ${opsWallet.address.slice(0, 8)}... | delegated: ${isDelegated} | signerId: ${PRIVY_SIGNER_ID.slice(0, 8)}...`;
            console.log('[Onboarding] Wallet info:', walletInfo);
            setDebugInfo(walletInfo);

            if (isDelegated) {
                console.log('[Onboarding] Ops wallet already delegated, proceeding to registration...');
                setStep('registering');
                await completeRegistration();
                return;
            }

            console.log('[Onboarding] Adding signer to ops wallet:', opsWallet.address);

            // Use new Signers API instead of delegateWallet
            const result = await addSigners({
                address: opsWallet.address,
                signers: [{ signerId: PRIVY_SIGNER_ID, policyIds: [] }],
            });

            console.log('[Onboarding] addSigners result:', result);
            console.log('[Onboarding] Ops wallet signer added successfully');

            toast.success('Ops wallet authorized', {
                description: 'Trading enabled for ops wallet',
            });

            // Now register with backend
            setStep('registering');
            await completeRegistration();
        } catch (err: any) {
            console.error('[Onboarding] Ops wallet signer failed:', err);
            console.error('[Onboarding] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

            const errorDetails = {
                message: err?.message,
                code: err?.code,
                name: err?.name,
                cause: err?.cause,
                stack: err?.stack?.split('\n')[0],
            };

            setDebugInfo(`Error: ${JSON.stringify(errorDetails)}`);
            const errorMsg = `Ops wallet authorization failed: ${err?.message || 'Unknown error'}`;
            setError(errorMsg);
            toast.error('Ops wallet authorization failed', {
                description: err?.message || 'Unknown error',
            });
        } finally {
            setIsDelegating(false);
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
            toast.success('🎉 Registration complete!', {
                description: 'Redirecting to your dashboard...',
            });
            setStep('complete');

            setTimeout(() => router.replace('/dashboard'), 1500);
        } catch (err: any) {
            console.error('[Onboarding] Registration failed:', err);
            const errorMsg = err?.response?.data?.error || err?.message || 'Unknown error';
            setError(`Registration failed: ${errorMsg}`);
            toast.error('Registration failed', {
                description: errorMsg,
            });
            setStep('delegate_ops'); // Go back to retry
        }
    }

    // Auto-complete registration if both wallets were already delegated
    useEffect(() => {
        if (shouldAutoComplete && step === 'registering') {
            completeRegistration();
            setShouldAutoComplete(false); // Prevent re-running
        }
    }, [shouldAutoComplete, step]);

    return (
        <div className="min-h-screen flex flex-col p-6">
            {/* Show loading spinner during initialization */}
            {(!ready || isInitializing || walletsLoading) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
                    <p className="text-telegram-hint text-sm">Loading...</p>
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
                                disabled={isCreating || effectiveWalletCount >= 2 || walletsLoading}
                                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-xl font-medium text-lg"
                            >
                                {walletsLoading ? 'Checking wallets...' : effectiveWalletCount >= 2 ? 'Wallets Ready' : 'Get Started'}
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
                            disabled={isDelegating}
                            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-4 rounded-xl font-medium text-lg flex items-center justify-center gap-2"
                        >
                            {isDelegating ? (
                                <>
                                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                    Delegating...
                                </>
                            ) : (
                                'Authorize Dev Wallet'
                            )}
                        </button>

                        {error && (
                            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
                        )}

                        {debugInfo && (
                            <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                                <p className="text-xs text-gray-500 font-mono break-all">{debugInfo}</p>
                            </div>
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

                        {debugInfo && (
                            <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                                <p className="text-xs text-gray-500 font-mono break-all">{debugInfo}</p>
                            </div>
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
            )}
        </div>
    );
}
