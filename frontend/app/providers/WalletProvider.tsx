'use client'

import { FC, ReactNode, useMemo, useState, useEffect } from 'react'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css'

interface Props {
  children: ReactNode
}

export const WalletProvider: FC<Props> = ({ children }) => {
  // Prevent hydration errors by only rendering wallet provider on client
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Use mainnet
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), [])

  // Supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  // Always render the wallet context to prevent "WalletContext not found" errors
  // Only auto-connect and render real children when mounted on client
  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={mounted}>
        <WalletModalProvider>
          {mounted ? children : (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
