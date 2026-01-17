'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

// Solana RPC endpoint - use Helius for reliability
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com';

// =============================================================================
// E2E Test Mode Support
// =============================================================================
// When window.__PRIVY_E2E_MOCK__ is set, the mock provider reads state from it.
// This allows Playwright tests to control auth state via page.addInitScript().

interface E2EMockWallet {
    address: string;
    delegated: boolean;
    chainType: string;
    walletClientType: string;
}

interface E2EMockUser {
    id: string;
    linkedAccounts: Array<{
        type: 'wallet' | 'telegram';
        address?: string;
        delegated?: boolean;
        chainType?: string;
        walletClientType?: string;
    }>;
}

interface E2EMockState {
    ready: boolean;
    authenticated: boolean;
    user: E2EMockUser | null;
    wallets: E2EMockWallet[];
    accessToken: string;
}

declare global {
    interface Window {
        __PRIVY_E2E_MOCK__?: E2EMockState;
    }
}

// Mock context for when Privy is not configured (SSG builds or E2E tests)
interface MockPrivyContextType {
    ready: boolean;
    authenticated: boolean;
    user: E2EMockUser | null;
    wallets: E2EMockWallet[];
    getAccessToken: () => Promise<string | null>;
    createWallet: (options?: { createAdditional?: boolean }) => Promise<{ wallet: { address: string } }>;
    // Signers API
    addSigners: (params: { address: string; signers: Array<{ signerId: string; policyIds: string[] }> }) => Promise<{ success: boolean }>;
}

const MockPrivyContext = createContext<MockPrivyContextType>({
    ready: false,
    authenticated: false,
    user: null,
    wallets: [],
    getAccessToken: async () => null,
    createWallet: async () => ({ wallet: { address: '' } }),
    addSigners: async () => ({ success: true }),
});

export const useMockPrivy = () => useContext(MockPrivyContext);

// Helper to get mock state from window (handles SSR)
function getMockStateFromWindow(): E2EMockState | null {
    if (typeof window !== 'undefined' && window.__PRIVY_E2E_MOCK__) {
        return window.__PRIVY_E2E_MOCK__;
    }
    return null;
}

const DEFAULT_MOCK_STATE: E2EMockState = {
    ready: false,
    authenticated: false,
    user: null,
    wallets: [],
    accessToken: '',
};

function MockPrivyProvider({ children }: { children: ReactNode }) {
    // Force re-render after mount to pick up window.__PRIVY_E2E_MOCK__
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== 'undefined' && window.__PRIVY_E2E_MOCK__) {
            console.log('[MockPrivyProvider] E2E test mode detected:', window.__PRIVY_E2E_MOCK__);
        }
    }, []);

    // Read mock state directly from window on every render (after mount)
    // This ensures we always have the latest state from E2E tests
    const mockState = mounted ? (getMockStateFromWindow() || DEFAULT_MOCK_STATE) : DEFAULT_MOCK_STATE;

    const getAccessToken = useCallback(async () => {
        return mockState.accessToken || 'mock-access-token';
    }, [mockState.accessToken]);

    const createWallet = useCallback(async (options?: { createAdditional?: boolean }) => {
        // In E2E mode, return a mock wallet
        const newAddress = `MockWallet${Date.now()}${options?.createAdditional ? 'Ops' : 'Dev'}`;
        console.log('[MockPrivyProvider] createWallet called, returning:', newAddress);
        return { wallet: { address: newAddress } };
    }, []);

    const addSigners = useCallback(async () => {
        console.log('[MockPrivyProvider] addSigners called');
        return { success: true };
    }, []);

    return (
        <MockPrivyContext.Provider value={{
            ready: mockState.ready,
            authenticated: mockState.authenticated,
            user: mockState.user,
            wallets: mockState.wallets,
            getAccessToken,
            createWallet,
            addSigners,
        }}>
            {children}
        </MockPrivyContext.Provider>
    );
}

export function PrivyTMAProvider({ children }: { children: React.ReactNode }) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    // During build or if app ID is missing, use mock provider
    // This allows static generation to work
    if (!appId) {
        console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set - using mock provider for build');
        return <MockPrivyProvider>{children}</MockPrivyProvider>;
    }

    // Dynamically import Solana connectors only when properly configured
    const getSolanaConfig = () => {
        try {
            const { toSolanaWalletConnectors } = require('@privy-io/react-auth/solana');
            const { createSolanaRpc, createSolanaRpcSubscriptions } = require('@solana/kit');

            return {
                solana: {
                    rpcs: {
                        'solana:mainnet': {
                            rpc: createSolanaRpc(SOLANA_RPC_URL),
                            rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WS_URL),
                        },
                    },
                },
                externalWallets: {
                    solana: {
                        connectors: toSolanaWalletConnectors(),
                    },
                },
            };
        } catch (e) {
            console.warn('Failed to initialize Solana config:', e);
            return {};
        }
    };

    const solanaConfig = getSolanaConfig();

    return (
        <PrivyProvider
            appId={appId}
            config={{
                // Appearance - match Telegram's theme
                appearance: {
                    theme: 'dark',
                    accentColor: '#00D26A',  // ClaudeWheel green
                    logo: '/logo.png',
                    walletChainType: 'solana-only',
                },

                // In TMA: Only allow embedded wallets (no external wallet popups)
                loginMethods: ['telegram'],

                // Embedded wallet config for Privy 3.x
                embeddedWallets: {
                    solana: {
                        createOnLogin: 'users-without-wallets',
                    },
                },

                // Spread Solana config if available
                ...solanaConfig,
            }}
        >
            {children}
        </PrivyProvider>
    );
}
