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

// Import real hooks only when not in mock mode
// This allows the bundler to tree-shake in production
const privyReact = IS_MOCK_MODE ? null : require('@privy-io/react-auth');
const privySolana = IS_MOCK_MODE ? null : require('@privy-io/react-auth/solana');

// Stub hooks for mock mode that satisfy React's rules of hooks
const stubPrivy = () => ({ ready: false, authenticated: false, user: null, getAccessToken: async () => null, logout: async () => {} });
const stubWallets = () => ({ wallets: [] });
const stubCreateWallet = () => ({ createWallet: async () => ({ wallet: { address: '' } }) });
const stubSigners = () => ({ addSigners: async () => ({ success: true }) });
const stubDelegatedActions = () => ({ delegateWallet: async () => ({ success: true }) });

// Get the actual hook to use (real or stub)
const usePrivyInternal = IS_MOCK_MODE ? stubPrivy : privyReact.usePrivy;
const useLoginInternal = IS_MOCK_MODE ? (() => ({ login: async () => {} })) : privyReact.useLogin;
const useWalletsInternal = IS_MOCK_MODE ? stubWallets : privySolana.useWallets;
const useCreateWalletInternal = IS_MOCK_MODE ? stubCreateWallet : privySolana.useCreateWallet;
const useSignersInternal = IS_MOCK_MODE ? stubSigners : privyReact.useSigners;
const useDelegatedActionsInternal = IS_MOCK_MODE ? stubDelegatedActions : privyReact.useHeadlessDelegatedActions;

/**
 * Wrapper for usePrivy that works in both real and mock modes
 */
export function usePrivyWrapper() {
    // Always call both hooks unconditionally to satisfy React's rules of hooks
    const mockPrivy = useMockPrivy();
    const realPrivy = usePrivyInternal();

    if (IS_MOCK_MODE) {
        return {
            ready: mockPrivy.ready,
            authenticated: mockPrivy.authenticated,
            user: mockPrivy.user,
            getAccessToken: mockPrivy.getAccessToken,
            logout: async () => { console.log('[MockPrivy] logout called'); },
        };
    }

    return realPrivy;
}

/**
 * Wrapper for useWallets that works in both real and mock modes
 */
export function useWalletsWrapper(): { wallets: MockSolanaWallet[] } {
    const mockPrivy = useMockPrivy();
    const realWallets = useWalletsInternal();

    if (IS_MOCK_MODE) {
        return {
            wallets: mockPrivy.wallets as MockSolanaWallet[],
        };
    }

    // Map real wallets to our interface
    return {
        wallets: realWallets.wallets.map((w: { address: string; walletClientType?: string }) => ({
            address: w.address,
            delegated: (w as unknown as { delegated?: boolean }).delegated ?? false,
            chainType: 'solana',
            walletClientType: w.walletClientType || 'privy',
        })),
    };
}

/**
 * Wrapper for useCreateWallet that works in both real and mock modes
 */
export function useCreateWalletWrapper() {
    const mockPrivy = useMockPrivy();
    const realCreateWallet = useCreateWalletInternal();

    if (IS_MOCK_MODE) {
        return {
            createWallet: mockPrivy.createWallet,
        };
    }

    return realCreateWallet;
}

/**
 * Wrapper for useSigners that works in both real and mock modes
 */
export function useSignersWrapper() {
    const mockPrivy = useMockPrivy();
    const realSigners = useSignersInternal();

    if (IS_MOCK_MODE) {
        return {
            addSigners: mockPrivy.addSigners,
        };
    }

    return realSigners;
}

/**
 * Wrapper for useHeadlessDelegatedActions that works in both real and mock modes
 */
export function useHeadlessDelegatedActionsWrapper() {
    const realDelegatedActions = useDelegatedActionsInternal();

    if (IS_MOCK_MODE) {
        return {
            delegateWallet: async ({ address, chainType }: { address: string; chainType: string }) => {
                console.log('[MockPrivy] delegateWallet called for:', address, chainType);
                return { success: true };
            },
        };
    }

    return realDelegatedActions;
}

/**
 * Wrapper for useLogin that works in both real and mock modes
 */
export function useLoginWrapper() {
    const realLogin = useLoginInternal();

    if (IS_MOCK_MODE) {
        return {
            login: async () => {
                console.log('[MockPrivy] login called');
            },
        };
    }

    return realLogin;
}
