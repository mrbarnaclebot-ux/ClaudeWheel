import type { Metadata } from 'next'
import './globals.css'
import { WalletProvider } from './providers/WalletProvider'
import { AuthProvider } from './providers/AuthProvider'

export const metadata: Metadata = {
  title: 'Claude Wheel | Autonomous Market Making',
  description: 'Real-time visualization of the Claude Wheel - automated fee collection and market making on Solana',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-void min-h-screen antialiased">
        {/* Noise texture overlay */}
        <div className="noise-overlay" />

        {/* Scan lines effect */}
        <div className="scanlines fixed inset-0 pointer-events-none z-50" />

        {/* Grid pattern background */}
        <div className="fixed inset-0 bg-grid pointer-events-none opacity-50" />

        {/* Main content with Wallet and Auth Providers */}
        <WalletProvider>
          <AuthProvider>
            <div className="relative z-10">
              {children}
            </div>
          </AuthProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
