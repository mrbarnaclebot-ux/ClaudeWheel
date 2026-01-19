'use client';

import { PrivyProvider, PrivyClientConfig } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { ReactNode } from 'react';

interface PrivyWebProviderProps {
    children: ReactNode;
}

export function PrivyWebProvider({ children }: PrivyWebProviderProps) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    if (!appId) {
        // Development fallback - show warning
        console.warn('[PrivyWebProvider] NEXT_PUBLIC_PRIVY_APP_ID is not set');
        return <>{children}</>;
    }

    const config: PrivyClientConfig = {
        // Appearance
        appearance: {
            theme: 'dark',
            accentColor: '#e67428',
            logo: '/logo.png',
            showWalletLoginFirst: false,
        },
        // Login methods - prioritize email/social for web
        loginMethods: ['email', 'google', 'twitter'],
        // Embedded wallet configuration - Privy v3 API
        embeddedWallets: {
            solana: {
                createOnLogin: 'users-without-wallets',
            },
        },
        // Solana wallet connectors for external wallets
        externalWallets: {
            solana: {
                connectors: toSolanaWalletConnectors(),
            },
        },
        // Funding sources (for buying crypto)
        fundingMethodConfig: {
            moonpay: {
                useSandbox: process.env.NODE_ENV === 'development',
            },
        },
    };

    return (
        <PrivyProvider appId={appId} config={config}>
            {children}
        </PrivyProvider>
    );
}
