'use client';

/**
 * Privy Hook Wrappers for E2E Testing Support
 *
 * These hooks wrap Privy's hooks to support E2E testing mode.
 * When NEXT_PUBLIC_PRIVY_APP_ID is not set and window.__PRIVY_E2E_MOCK__ exists,
 * these hooks return mock state instead of using real Privy.
 *
 * Components should import from this file instead of directly from @privy-io/react-auth
 * when they need to work in E2E test mode.
 */

import { useMockPrivy } from '@/components/PrivyTMAProvider';

// Check if we're in mock mode (no Privy app ID configured)
const IS_MOCK_MODE = !process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// Re-export types that components need
export type { WalletWithMetadata } from '@privy-io/react-auth';

// Wallet interface that matches both real and mock modes
export interface MockSolanaWallet {
    address: string;
    delegated: boolean;
    chainType: string;
    walletClientType: string;
}

/**
 * Wrapper for usePrivy that works in both real and mock modes
 */
export function usePrivyWrapper() {
    // Always call the mock hook to satisfy React's rules of hooks
    const mockPrivy = useMockPrivy();

    if (IS_MOCK_MODE) {
        return {
            ready: mockPrivy.ready,
            authenticated: mockPrivy.authenticated,
            user: mockPrivy.user,
            getAccessToken: mockPrivy.getAccessToken,
            logout: async () => { console.log('[MockPrivy] logout called'); },
        };
    }

    // In real mode, dynamically import from Privy
    // This is a workaround - in production, components should use the real hook
    const { usePrivy } = require('@privy-io/react-auth');
    return usePrivy();
}

/**
 * Wrapper for useWallets that works in both real and mock modes
 */
export function useWalletsWrapper(): { wallets: MockSolanaWallet[] } {
    const mockPrivy = useMockPrivy();

    if (IS_MOCK_MODE) {
        return {
            wallets: mockPrivy.wallets as MockSolanaWallet[],
        };
    }

    const { useWallets } = require('@privy-io/react-auth/solana');
    return useWallets();
}

/**
 * Wrapper for useCreateWallet that works in both real and mock modes
 */
export function useCreateWalletWrapper() {
    const mockPrivy = useMockPrivy();

    if (IS_MOCK_MODE) {
        return {
            createWallet: mockPrivy.createWallet,
        };
    }

    const { useCreateWallet } = require('@privy-io/react-auth/solana');
    return useCreateWallet();
}

/**
 * Wrapper for useSigners that works in both real and mock modes
 */
export function useSignersWrapper() {
    const mockPrivy = useMockPrivy();

    if (IS_MOCK_MODE) {
        return {
            addSigners: mockPrivy.addSigners,
        };
    }

    const { useSigners } = require('@privy-io/react-auth');
    return useSigners();
}

/**
 * Wrapper for useHeadlessDelegatedActions that works in both real and mock modes
 */
export function useHeadlessDelegatedActionsWrapper() {
    if (IS_MOCK_MODE) {
        return {
            delegateWallet: async ({ address, chainType }: { address: string; chainType: string }) => {
                console.log('[MockPrivy] delegateWallet called for:', address, chainType);
                return { success: true };
            },
        };
    }

    const { useHeadlessDelegatedActions } = require('@privy-io/react-auth');
    return useHeadlessDelegatedActions();
}
