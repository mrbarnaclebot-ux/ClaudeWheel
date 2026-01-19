// Re-export from app/hooks for consistent imports
export {
    usePrivyWrapper,
    useWalletsWrapper,
    useCreateWalletWrapper,
    useSignersWrapper,
    useHeadlessDelegatedActionsWrapper,
    type SolanaWallet,
} from '../app/hooks/usePrivyWrapper';
export type { WalletWithMetadata } from '@privy-io/react-auth';
