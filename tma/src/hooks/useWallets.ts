import { useSolanaWallets } from '@privy-io/react-auth';

export function useUserWallets() {
    const { wallets } = useSolanaWallets();

    // useSolanaWallets already returns only Solana wallets, no need to filter
    return {
        devWallet: wallets[0] || null,
        opsWallet: wallets[1] || null,
        hasWallets: wallets.length >= 2,
    };
}
