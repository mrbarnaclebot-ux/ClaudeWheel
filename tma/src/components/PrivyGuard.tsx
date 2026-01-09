'use client';

import { usePrivy } from '@privy-io/react-auth';
import { ReactNode } from 'react';

interface PrivyGuardProps {
    children: ReactNode;
    fallback?: ReactNode;
}

// Component that only renders children when Privy is available and ready
export function PrivyGuard({ children, fallback }: PrivyGuardProps) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    // During SSG or if Privy is not configured, show fallback
    if (!appId) {
        return fallback ? <>{fallback}</> : (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-400">Configuration required</p>
            </div>
        );
    }

    // Use Privy hook only when app ID is available
    return <PrivyReadyGuard fallback={fallback}>{children}</PrivyReadyGuard>;
}

// Separate component to safely use Privy hooks
function PrivyReadyGuard({ children, fallback }: PrivyGuardProps) {
    const { ready, authenticated } = usePrivy();

    if (!ready) {
        return fallback ? <>{fallback}</> : (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return <>{children}</>;
}
