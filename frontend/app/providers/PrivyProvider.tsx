'use client'

import { FC, ReactNode, useState, useEffect } from 'react'
import { PrivyProvider as PrivyReactProvider } from '@privy-io/react-auth'

interface Props {
  children: ReactNode
}

export const PrivyProvider: FC<Props> = ({ children }) => {
  // Prevent hydration errors by only rendering wallet provider on client
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  // During build or if app ID is missing, show loading or render children without Privy
  if (!appId) {
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set')
    return <>{children}</>
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <PrivyReactProvider
      appId={appId}
      config={{
        // Appearance - dark theme to match existing UI
        appearance: {
          theme: 'dark',
          accentColor: '#00D26A',  // ClaudeWheel green
          logo: '/logo.png',
        },

        // For web: Allow both Telegram and external wallets
        loginMethods: ['wallet', 'telegram'],

        // External wallet configuration for web users - use Solana wallets
        externalWallets: {
          solana: {
            connectors: undefined, // Uses default connectors
          },
        },

        // Embedded wallet config - create for users without wallets
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      {children}
    </PrivyReactProvider>
  )
}
