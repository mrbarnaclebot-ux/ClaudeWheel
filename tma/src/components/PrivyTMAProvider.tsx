'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

// Solana RPC endpoint - use Helius for reliability
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com';

// Mock context for when Privy is not configured (SSG builds)
const MockPrivyContext = createContext<{
    ready: boolean;
    authenticated: boolean;
    wallets: never[];
}>({
    ready: false,
    authenticated: false,
    wallets: [],
});

export const useMockPrivy = () => useContext(MockPrivyContext);

function MockPrivyProvider({ children }: { children: ReactNode }) {
    return (
        <MockPrivyContext.Provider value={{ ready: false, authenticated: false, wallets: [] }}>
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
