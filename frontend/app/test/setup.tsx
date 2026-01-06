// ═══════════════════════════════════════════════════════════════════════════
// FRONTEND TEST SETUP
// Configure test environment and mocks
// ═══════════════════════════════════════════════════════════════════════════

import '@testing-library/dom'
import React from 'react'
import { vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const React = await import('react')

  const createMotionComponent = (element: string) => {
    return React.forwardRef(({ children, ...props }: any, ref: any) => {
      return React.createElement(element, { ...props, ref }, children)
    })
  }

  return {
    motion: {
      div: createMotionComponent('div'),
      span: createMotionComponent('span'),
      svg: createMotionComponent('svg'),
      circle: createMotionComponent('circle'),
      path: createMotionComponent('path'),
      header: createMotionComponent('header'),
      section: createMotionComponent('section'),
      article: createMotionComponent('article'),
      a: createMotionComponent('a'),
      button: createMotionComponent('button'),
      p: createMotionComponent('p'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      h3: createMotionComponent('h3'),
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useAnimation: () => ({
      start: vi.fn(),
      stop: vi.fn(),
    }),
  }
})

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  }),
}))

// Mock wallet adapter
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: null,
    connected: false,
    connecting: false,
    disconnect: vi.fn(),
    select: vi.fn(),
    wallet: null,
    wallets: [],
  }),
  useConnection: () => ({
    connection: {},
  }),
  ConnectionProvider: ({ children }: any) => <>{children}</>,
  WalletProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletModalProvider: ({ children }: any) => <>{children}</>,
  WalletMultiButton: () => <button>Connect Wallet</button>,
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
