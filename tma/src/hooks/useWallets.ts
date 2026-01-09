import { useWallets } from '@privy-io/react-auth/solana';

export function useUserWallets() {
    const { wallets } = useWallets();

    // useWallets from solana entrypoint returns only Solana wallets
    return {
        devWallet: wallets[0] || null,
        opsWallet: wallets[1] || null,
        hasWallets: wallets.length >= 2,
    };
}
