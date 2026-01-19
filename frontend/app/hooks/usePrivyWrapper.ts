'use client';

/**
 * Privy Hook Wrappers for Web Frontend
 *
 * These hooks wrap Privy's hooks for the web frontend.
 * They use the new Privy v3 API with Signers support.
 */

import { usePrivy, useHeadlessDelegatedActions } from '@privy-io/react-auth';
import { useWallets, useCreateWallet } from '@privy-io/react-auth/solana';
import { useSigners } from '@privy-io/react-auth';

// Re-export types that components need
export type { WalletWithMetadata } from '@privy-io/react-auth';

// Wallet interface - matches Privy v3 ConnectedStandardSolanaWallet
export interface SolanaWallet {
    address: string;
    // Optional fields that may not exist on all wallet types
    delegated?: boolean;
    chainType?: string;
    walletClientType?: string;
}

/**
 * Wrapper for usePrivy
 */
export function usePrivyWrapper() {
    const privy = usePrivy();

    return {
        ready: privy.ready,
        authenticated: privy.authenticated,
        user: privy.user,
        getAccessToken: privy.getAccessToken,
        logout: privy.logout,
        login: privy.login,
    };
}

/**
 * Wrapper for useWallets
 */
export function useWalletsWrapper(): { wallets: SolanaWallet[] } {
    const { wallets } = useWallets();
    return { wallets: wallets as SolanaWallet[] };
}

/**
 * Wrapper for useCreateWallet
 */
export function useCreateWalletWrapper() {
    const { createWallet } = useCreateWallet();
    return { createWallet };
}

/**
 * Wrapper for useSigners
 */
export function useSignersWrapper() {
    const { addSigners } = useSigners();
    return { addSigners };
}

/**
 * Wrapper for useHeadlessDelegatedActions
 */
export function useHeadlessDelegatedActionsWrapper() {
    const { delegateWallet } = useHeadlessDelegatedActions();
    return { delegateWallet };
}
