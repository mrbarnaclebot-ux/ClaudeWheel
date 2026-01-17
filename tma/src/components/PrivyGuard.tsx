'use client';

import { usePrivyWrapper } from '@/hooks/usePrivyWrapper';
import { ReactNode } from 'react';

interface PrivyGuardProps {
    children: ReactNode;
    fallback?: ReactNode;
}

// Check if we're in mock mode (E2E testing)
const IS_MOCK_MODE = !process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// Component that only renders children when Privy is available and ready
export function PrivyGuard({ children, fallback }: PrivyGuardProps) {
    // Use wrapper hooks that work in both real and mock mode
    return <PrivyReadyGuard fallback={fallback}>{children}</PrivyReadyGuard>;
}

// Separate component to safely use Privy hooks
function PrivyReadyGuard({ children, fallback }: PrivyGuardProps) {
    const { ready } = usePrivyWrapper();

    if (!ready) {
        return fallback ? <>{fallback}</> : (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return <>{children}</>;
}
