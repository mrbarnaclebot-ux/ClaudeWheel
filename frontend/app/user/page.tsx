'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivyWrapper } from '@/app/hooks/usePrivyWrapper';
import { useOnboardingStatus } from '@/app/hooks/useOnboarding';

export default function UserEntryPage() {
    const router = useRouter();
    const { ready, authenticated, login } = usePrivyWrapper();
    const { isOnboarded, isLoading } = useOnboardingStatus();
    const [timedOut, setTimedOut] = useState(false);

    // Debug logging
    useEffect(() => {
        console.log('[UserEntry] State:', { ready, authenticated, isLoading, isOnboarded });
    }, [ready, authenticated, isLoading, isOnboarded]);

    // Timeout after 15 seconds
    useEffect(() => {
        const timeout = setTimeout(() => setTimedOut(true), 15000);
        return () => clearTimeout(timeout);
    }, []);

    // Navigation logic
    useEffect(() => {
        if (!ready || isLoading) return;

        if (!authenticated) {
            // Show login for web users
            return;
        }

        if (!isOnboarded) {
            router.replace('/user/onboarding');
        } else {
            router.replace('/user/dashboard');
        }
    }, [ready, authenticated, isOnboarded, isLoading, router]);

    // Not authenticated - show login screen
    if (ready && !authenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg-void">
                <div className="text-6xl mb-6">🎡</div>
                <h1 className="text-2xl font-bold text-text-primary mb-4">Welcome to ClaudeWheel</h1>
                <p className="text-text-muted mb-8 max-w-sm">
                    Launch tokens on Bags.fm and let our flywheel automatically trade and collect fees for you.
                </p>
                <button
                    onClick={() => login()}
                    className="px-8 py-4 bg-accent-primary hover:bg-accent-secondary text-bg-void rounded-xl font-semibold transition-all btn-press hover:shadow-wood-glow"
                >
                    Sign In to Get Started
                </button>
            </div>
        );
    }

    // Timeout error screen
    if (timedOut && (!ready || isLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg-void">
                <div className="text-error text-xl font-semibold mb-4">Connection Issue</div>
                <div className="text-text-muted text-sm mb-6 space-y-1">
                    {!ready && <div>• Loading authentication...</div>}
                    {isLoading && <div>• Loading user status...</div>}
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-accent-primary text-bg-void rounded-xl font-semibold active:scale-95 transition-transform"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-void">
            <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
        </div>
    );
}
