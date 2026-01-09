'use client';

// Force dynamic rendering - this page uses Privy hooks which require runtime
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useSigners, type WalletWithMetadata } from '@privy-io/react-auth';
import { useWallets, useCreateWallet } from '@privy-io/react-auth/solana';
import { useTelegram } from '@/components/TelegramProvider';
import { motion, AnimatePresence } from 'framer-motion';
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
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [debugInfo, setDebugInfo] = useState<string | null>(null);

    // useSolanaWallets already returns only Solana wallets
    const solanaWallets = wallets;

    // Helper to check if a wallet is already delegated via user.linkedAccounts
    const isWalletDelegated = (walletAddress: string): boolean => {
        if (!user?.linkedAccounts) return false;
        return user.linkedAccounts.some(
            (account): account is WalletWithMetadata =>
                account.type === 'wallet' &&
                (account as WalletWithMetadata).address === walletAddress &&
                (account as WalletWithMetadata).delegated === true
        );
    };

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
                const result = await createWallet();
                console.log('[Onboarding] Dev wallet created:', result?.wallet?.address);
            }

            // Small delay to let Privy state update
            await new Promise(resolve => setTimeout(resolve, 500));

            // Create ops wallet (second)
            // Check current wallets again after first creation
            if (wallets.length < 2) {
                console.log('[Onboarding] Creating second wallet (ops)...');
                const result = await createWallet({ createAdditional: true });
                console.log('[Onboarding] Ops wallet created:', result?.wallet?.address);
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
            const linkedAccountsInfo = user?.linkedAccounts?.filter(a => a.type === 'wallet').map(a => ({
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
            setError(`Dev wallet authorization failed: ${err?.message || 'Unknown error'}`);
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
            const linkedAccountsInfo = user?.linkedAccounts?.filter(a => a.type === 'wallet').map(a => ({
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
            setError(`Ops wallet authorization failed: ${err?.message || 'Unknown error'}`);
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
        </div>
    );
}
