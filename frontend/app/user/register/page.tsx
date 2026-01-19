'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivyWrapper, useHeadlessDelegatedActionsWrapper } from '@/app/hooks/usePrivyWrapper';
import { useTelegram } from '@/app/components/WebProvider';
import { api } from '@/app/lib/api';
import { toast } from '@/app/lib/toast';
import { LoadingButton } from '@/app/components/user';
import Link from 'next/link';
import { motion } from 'framer-motion';

// Helper to decode base58 and derive public key from private key
// Using dynamic import to avoid SSR issues
const deriveAddressFromPrivateKey = async (privateKeyBase58: string): Promise<string | null> => {
    try {
        const bs58 = (await import('bs58')).default;
        const { Keypair } = await import('@solana/web3.js');
        const secretKey = bs58.decode(privateKeyBase58.trim());
        const keypair = Keypair.fromSecretKey(secretKey);
        return keypair.publicKey.toString();
    } catch (error) {
        console.error('Failed to derive address from private key:', error);
        return null;
    }
};

interface TokenInfo {
    tokenMint: string;
    tokenName: string;
    tokenSymbol: string;
    tokenImage?: string;
    tokenDecimals: number;
    creatorAddress: string;
}

type Step = 'enter_mint' | 'validating' | 'enter_key' | 'registering' | 'success';

export default function RegisterPage() {
    const queryClient = useQueryClient();
    const { getAccessToken } = usePrivyWrapper();
    const { delegateWallet } = useHeadlessDelegatedActionsWrapper();
    const { hapticFeedback } = useTelegram();

    const [step, setStep] = useState<Step>('enter_mint');
    const [mintAddress, setMintAddress] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [registeredTokenId, setRegisteredTokenId] = useState<string | null>(null);
    const [opsWalletAddress, setOpsWalletAddress] = useState<string | null>(null);
    const [copiedAddress, setCopiedAddress] = useState(false);

    // Validate token from Bags.fm
    const validateMutation = useMutation({
        mutationFn: async (mint: string) => {
            console.log('[Register] Validating token:', mint);
            try {
                const token = await getAccessToken();
                console.log('[Register] Got access token:', !!token);

                if (!token) {
                    throw new Error('Not authenticated. Please log in again.');
                }

                const res = await api.get(`/api/bags/token/${mint}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                console.log('[Register] Token info response:', res.data);

                // Backend wraps response in { success, data }
                const apiData = res.data.data || res.data;

                // Check if we got valid data
                if (!apiData || (!apiData.creatorWallet && !apiData.creatorAddress)) {
                    throw new Error('Could not find token creator. Make sure this is a valid Bags.fm token.');
                }

                // Map backend fields to our interface
                return {
                    tokenMint: apiData.tokenMint || mint,
                    tokenName: apiData.tokenName || 'Unknown Token',
                    tokenSymbol: apiData.tokenSymbol || 'UNKNOWN',
                    tokenImage: apiData.tokenImage,
                    tokenDecimals: apiData.tokenDecimals ?? 9, // Default to 9 for SPL tokens
                    creatorAddress: apiData.creatorWallet || apiData.creatorAddress,
                } as TokenInfo;
            } catch (error: any) {
                console.error('[Register] Validation error:', error);
                throw error;
            }
        },
        onSuccess: (data) => {
            console.log('[Register] Validation success:', data);
            setTokenInfo(data);
            setError(null);
            setStep('enter_key');
            toast.success('Token found!', {
                description: `${data.tokenName} (${data.tokenSymbol})`,
            });
        },
        onError: (err: any) => {
            console.error('[Register] Validation failed:', err);
            setStep('enter_mint');
            const errorMessage = err?.response?.data?.error || err?.message || 'Failed to fetch token info. Make sure this is a valid Bags.fm token.';
            setError(errorMessage);
            toast.error('Token not found', { description: errorMessage });
        },
    });

    // Register token with imported dev wallet
    const registerMutation = useMutation({
        mutationFn: async () => {
            console.log('[Register] Starting registration...');
            if (!tokenInfo) throw new Error('No token info');
            if (!privateKey) throw new Error('No private key');

            try {
                const token = await getAccessToken();
                console.log('[Register] Got access token for registration:', !!token);

                if (!token) {
                    throw new Error('Not authenticated. Please log in again.');
                }

                const res = await api.post('/api/privy/tokens/register-with-import', {
                    tokenMintAddress: tokenInfo.tokenMint,
                    tokenSymbol: tokenInfo.tokenSymbol,
                    tokenName: tokenInfo.tokenName,
                    tokenImage: tokenInfo.tokenImage,
                    tokenDecimals: tokenInfo.tokenDecimals,
                    devWalletPrivateKey: privateKey,
                    tokenSource: 'registered',
                }, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                console.log('[Register] Registration response:', res.data);

                // After import, delegate the wallet for server-side signing
                const importedWalletAddress = res.data.data?.devWallet?.address;
                if (importedWalletAddress) {
                    console.log('[Register] Delegating imported wallet:', importedWalletAddress);
                    try {
                        await delegateWallet({
                            address: importedWalletAddress,
                            chainType: 'solana',
                        });
                        console.log('[Register] Wallet delegation successful');
                    } catch (delegateError) {
                        console.error('[Register] Wallet delegation failed:', delegateError);
                        // Do not throw - the import succeeded, delegation can be retried
                    }
                }

                return res.data;
            } catch (error: any) {
                console.error('[Register] Registration error:', error);
                throw error;
            }
        },
        onSuccess: (data) => {
            console.log('[Register] Registration success:', data);
            setRegisteredTokenId(data.data?.token?.id);
            setOpsWalletAddress(data.data?.opsWallet?.address || null);
            setStep('success');
            queryClient.invalidateQueries({ queryKey: ['tokens'] });
            toast.success('Token registered!', {
                description: 'Flywheel is now active',
            });
            // Clear sensitive data
            setPrivateKey('');
        },
        onError: (err: any) => {
            console.error('[Register] Registration failed:', err);
            setStep('enter_key');
            const errorMessage = err?.response?.data?.error || err?.message || 'Failed to register token';
            setError(errorMessage);
            toast.error('Registration failed', { description: errorMessage });
        },
    });

    const handleValidateMint = () => {
        if (!mintAddress.trim()) {
            setError('Please enter a token mint address');
            return;
        }
        setError(null);
        setStep('validating');
        validateMutation.mutate(mintAddress.trim());
    };

    // Validate private key client-side and derive address
    const handlePrivateKeyChange = useCallback(async (value: string) => {
        setPrivateKey(value);
        setError(null);
        setDerivedAddress(null);

        if (!value.trim()) return;

        const derived = await deriveAddressFromPrivateKey(value);
        if (derived) {
            setDerivedAddress(derived);
        }
    }, []);

    const handleRegister = useCallback(async () => {
        if (!privateKey.trim()) {
            setError('Please enter your dev wallet private key');
            return;
        }

        // Validate key format
        const derived = await deriveAddressFromPrivateKey(privateKey);

        if (!derived) {
            setError('Invalid private key format. Please enter a valid base58-encoded Solana private key.');
            hapticFeedback?.('heavy');
            return;
        }

        // Check if it matches the creator address
        if (tokenInfo && derived !== tokenInfo.creatorAddress) {
            setError(`This private key derives to ${derived.slice(0, 8)}...${derived.slice(-4)}, but the token creator is ${tokenInfo.creatorAddress.slice(0, 8)}...${tokenInfo.creatorAddress.slice(-4)}. Please use the correct dev wallet key.`);
            hapticFeedback?.('heavy');
            return;
        }

        setError(null);
        setStep('registering');
        registerMutation.mutate();
    }, [privateKey, tokenInfo, hapticFeedback, registerMutation]);

    const handleBack = () => {
        hapticFeedback('light');
        if (step === 'enter_key') {
            setStep('enter_mint');
            setTokenInfo(null);
            setPrivateKey('');
            setDerivedAddress(null);
            setError(null);
        }
    };

    const keyMatchesCreator = derivedAddress && tokenInfo && derivedAddress === tokenInfo.creatorAddress;
    const keyMismatch = derivedAddress && tokenInfo && derivedAddress !== tokenInfo.creatorAddress;

    return (
        <div className="min-h-screen bg-void p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                {step !== 'success' && (
                    <Link
                        href="/user/dashboard"
                        onClick={() => hapticFeedback?.('light')}
                        className="w-10 h-10 bg-bg-card border border-border-subtle rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-accent transition-colors"
                    >
                        <span className="text-lg">&#8592;</span>
                    </Link>
                )}
                <div>
                    <h1 className="text-xl font-bold text-text-primary">Register Token</h1>
                    <p className="text-sm text-text-muted">Import existing token with dev wallet</p>
                </div>
            </div>

            {/* Step Indicator */}
            {step !== 'success' && (
                <div className="flex items-center justify-center gap-2 mb-8">
                    <StepDot
                        active={step === 'enter_mint' || step === 'validating'}
                        completed={step === 'enter_key' || step === 'registering'}
                        label="1"
                    />
                    <div className="w-8 h-0.5 bg-border-subtle" />
                    <StepDot
                        active={step === 'enter_key'}
                        completed={step === 'registering'}
                        label="2"
                    />
                    <div className="w-8 h-0.5 bg-border-subtle" />
                    <StepDot
                        active={step === 'registering'}
                        completed={false}
                        label="3"
                    />
                </div>
            )}

            {/* Step Content */}
            <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
            >
                {/* Step 1: Enter Mint Address */}
                {step === 'enter_mint' && (
                    <div className="space-y-6">
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                            <label className="block text-sm text-text-muted mb-2">Token Mint Address</label>
                            <input
                                type="text"
                                value={mintAddress}
                                onChange={(e) => {
                                    setMintAddress(e.target.value);
                                    setError(null);
                                }}
                                placeholder="Enter mint address..."
                                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-accent-cyan/50 font-mono text-sm"
                            />
                            <p className="text-xs text-text-muted mt-2">
                                Enter the Solana mint address of your token launched on Bags.fm
                            </p>
                        </div>

                        {error && (
                            <div className="bg-error/20 border border-error/50 rounded-xl p-4 text-error text-sm">
                                {error}
                            </div>
                        )}

                        <LoadingButton
                            onClick={handleValidateMint}
                            disabled={!mintAddress.trim()}
                            variant="primary"
                            size="lg"
                            fullWidth
                        >
                            Validate Token
                        </LoadingButton>
                    </div>
                )}

                {/* Validating */}
                {step === 'validating' && (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full mx-auto mb-4" />
                        <p className="text-text-muted">Fetching token info from Bags.fm...</p>
                    </div>
                )}

                {/* Step 2: Enter Private Key */}
                {step === 'enter_key' && tokenInfo && (
                    <div className="space-y-6">
                        {/* Token Preview */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                            <div className="flex items-center gap-4">
                                {tokenInfo.tokenImage ? (
                                    <img
                                        src={tokenInfo.tokenImage}
                                        alt={tokenInfo.tokenSymbol}
                                        className="w-16 h-16 rounded-full object-cover border-2 border-border-accent"
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center text-2xl font-bold text-text-primary border-2 border-border-accent">
                                        {tokenInfo.tokenSymbol[0]}
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary">{tokenInfo.tokenName}</h2>
                                    <p className="text-text-muted">${tokenInfo.tokenSymbol}</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-border-subtle space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-text-muted">Creator (Dev Wallet)</span>
                                    <span className="font-mono text-xs text-text-secondary truncate max-w-[160px]">{tokenInfo.creatorAddress}</span>
                                </div>
                            </div>
                        </div>

                        {/* Private Key Input */}
                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
                            <label className="block text-sm text-text-muted mb-2">Dev Wallet Private Key</label>
                            <input
                                type="password"
                                value={privateKey}
                                onChange={(e) => handlePrivateKeyChange(e.target.value)}
                                placeholder="Enter base58 private key..."
                                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-accent-cyan/50 font-mono text-sm"
                            />

                            {/* Key validation feedback */}
                            {derivedAddress && (
                                <div className={`mt-3 p-3 rounded-lg text-sm ${
                                    keyMatchesCreator
                                        ? 'bg-success/20 border border-success/50 text-success'
                                        : 'bg-error/20 border border-error/50 text-error'
                                }`}>
                                    {keyMatchesCreator ? (
                                        <span className="flex items-center gap-2">
                                            <span>&#10003;</span> Key matches token creator
                                        </span>
                                    ) : (
                                        <span>&#10007; Key derives to {derivedAddress.slice(0, 8)}...{derivedAddress.slice(-4)} (does not match creator)</span>
                                    )}
                                </div>
                            )}

                            <p className="text-xs text-text-muted mt-2">
                                Your private key will be securely imported into Privy for delegated signing.
                                We never store your raw private key.
                            </p>
                        </div>

                        {/* Security Notice */}
                        <div className="bg-warning/20 border border-warning/50 rounded-xl p-4 text-warning text-sm">
                            <p className="font-medium mb-1">Security Notice</p>
                            <p>Your private key is imported directly into Privy&apos;s secure enclave. ClaudeWheel uses delegated signing - we never have access to your raw key.</p>
                        </div>

                        {error && (
                            <div className="bg-error/20 border border-error/50 rounded-xl p-4 text-error text-sm">
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <LoadingButton
                                onClick={handleBack}
                                variant="secondary"
                                size="lg"
                                fullWidth
                            >
                                Back
                            </LoadingButton>
                            <LoadingButton
                                onClick={handleRegister}
                                disabled={!privateKey.trim() || !!keyMismatch}
                                variant="primary"
                                size="lg"
                                fullWidth
                            >
                                Register Token
                            </LoadingButton>
                        </div>
                    </div>
                )}

                {/* Registering */}
                {step === 'registering' && (
                    <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center space-y-4">
                        <div className="animate-spin w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full mx-auto" />
                        <div>
                            <p className="text-text-primary font-medium">Importing wallet to Privy...</p>
                            <p className="text-text-muted text-sm">This may take a few seconds</p>
                        </div>
                    </div>
                )}

                {/* Success */}
                {step === 'success' && (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-success/20 rounded-full mx-auto flex items-center justify-center">
                            <span className="text-4xl text-success">&#10003;</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-2 text-text-primary">Token Registered!</h2>
                            <p className="text-text-muted">
                                Your dev wallet has been imported and the flywheel is now active.
                            </p>
                        </div>

                        <div className="bg-bg-card border border-border-subtle rounded-xl p-4 space-y-2 text-left">
                            <p className="text-success flex items-center gap-2">
                                <span>&#10003;</span> Dev wallet imported to Privy
                            </p>
                            <p className="text-success flex items-center gap-2">
                                <span>&#10003;</span> Flywheel enabled
                            </p>
                            <p className="text-success flex items-center gap-2">
                                <span>&#10003;</span> Auto-claim active
                            </p>
                        </div>

                        {/* Ops Wallet Funding */}
                        {opsWalletAddress && (
                            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-left">
                                <p className="text-warning font-medium mb-2">Fund your Ops Wallet (optional)</p>
                                <p className="text-text-muted text-sm mb-3">
                                    Send SOL to your ops wallet to start market making. Claimed fees will also be deposited here.
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-bg-secondary rounded-lg px-3 py-2 text-xs font-mono text-accent-cyan truncate">
                                        {opsWalletAddress}
                                    </code>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(opsWalletAddress);
                                            setCopiedAddress(true);
                                            hapticFeedback?.('light');
                                            toast.copied();
                                            setTimeout(() => setCopiedAddress(false), 2000);
                                        }}
                                        className="bg-bg-card border border-border-subtle hover:bg-bg-card-hover hover:border-border-accent px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap text-text-primary"
                                    >
                                        {copiedAddress ? '&#10003; Copied' : 'Copy'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            {registeredTokenId && (
                                <Link
                                    href={`/user/token/${registeredTokenId}`}
                                    onClick={() => hapticFeedback?.('light')}
                                    className="w-full bg-accent-primary hover:bg-accent-secondary text-bg-void rounded-xl py-4 font-medium transition-colors text-center btn-press"
                                >
                                    View Token Details
                                </Link>
                            )}
                            <Link
                                href="/user/dashboard"
                                onClick={() => hapticFeedback?.('light')}
                                className="w-full bg-bg-card border border-border-subtle hover:bg-bg-card-hover hover:border-border-accent text-text-primary rounded-xl py-4 font-medium transition-colors text-center btn-press"
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
                completed ? 'bg-success text-white' :
                active ? 'bg-accent-primary text-bg-void' :
                'bg-bg-card text-text-muted border border-border-subtle'
            }`}
        >
            {completed ? <span>&#10003;</span> : label}
        </div>
    );
}
