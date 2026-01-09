'use client';

import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

// Solana RPC endpoint - use Helius for reliability
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export function PrivyTMAProvider({ children }: { children: React.ReactNode }) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    // During build or if app ID is missing, just render children without Privy
    if (!appId) {
        console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set');
        return <>{children}</>;
    }

    return (
        <PrivyProvider
            appId={appId}
            config={{
                // Appearance - match Telegram's theme
                appearance: {
                    theme: 'dark',
                    accentColor: '#00D26A',  // ClaudeWheel green
                    logo: '/logo.png',
                },

                // In TMA: Only allow embedded wallets (no external wallet popups)
                loginMethods: ['telegram'],

                // Embedded wallet config - createOnLogin applies to all embedded wallets
                embeddedWallets: {
                    createOnLogin: 'users-without-wallets',
                },

                // Solana configuration - required for delegation and transactions
                solanaClusters: [
                    {
                        name: 'mainnet-beta',
                        rpcUrl: SOLANA_RPC_URL,
                    },
                ],
                // Set default to mainnet
                defaultChain: undefined, // Let Privy determine

                // TMA-specific: Pass launch params for seamless auth
                // Privy will automatically use these when in Telegram environment
            }}
        >
            {children}
        </PrivyProvider>
    );
}
