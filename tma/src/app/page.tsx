'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { useOnboardingStatus } from '@/hooks/useOnboarding';

export default function EntryPage() {
    const router = useRouter();
    const { ready, authenticated } = usePrivy();
    const { login } = useLogin();
    const { isReady: telegramReady } = useTelegram();
    const { isOnboarded, isLoading } = useOnboardingStatus();

    const loginAttempted = useRef(false);
    const [timedOut, setTimedOut] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // Auto-login when Privy is ready but not authenticated
    useEffect(() => {
        // Skip in E2E test mode (tests inject authenticated: true)
        if (typeof window !== 'undefined' &&
            ((window as any).__PRIVY_E2E_MOCK__ || (window as any).__TELEGRAM_TEST_MODE__)) {
            return;
        }

        if (ready && telegramReady && !authenticated && !loginAttempted.current) {
            loginAttempted.current = true;
            console.log('[EntryPage] Triggering Privy login...');
            try {
                login();
            } catch (err) {
                console.error('[EntryPage] Login failed:', err);
                setLoginError(err instanceof Error ? err.message : 'Login failed');
            }
        }
    }, [ready, telegramReady, authenticated, login]);

    // Timeout after 15 seconds if still not authenticated
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (!authenticated) {
                setTimedOut(true);
            }
        }, 15000);
        return () => clearTimeout(timeout);
    }, [authenticated]);

    // Navigate once authenticated
    useEffect(() => {
        if (!ready || !telegramReady || isLoading) return;

        if (!authenticated) {
            // Wait for auto-login effect to trigger login
            return;
        }

        if (!isOnboarded) {
            router.replace('/onboarding');
        } else {
            router.replace('/dashboard');
        }
    }, [ready, telegramReady, authenticated, isOnboarded, isLoading, router]);

    // Timeout UI - show retry button after 15 seconds
    if ((timedOut || loginError) && !authenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#0e0804]">
                <div className="text-[#A63D2F] text-xl font-semibold mb-4">Connection Issue</div>
                <div className="text-[#7A756B] text-sm mb-6">
                    {loginError || 'Unable to authenticate. Please try again.'}
                </div>
                <button
                    onClick={() => {
                        loginAttempted.current = false;
                        setTimedOut(false);
                        setLoginError(null);
                    }}
                    className="px-6 py-3 bg-[#e67428] text-[#0e0804] rounded-xl font-semibold"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0e0804]">
            <div className="animate-spin w-8 h-8 border-2 border-[#e67428] border-t-transparent rounded-full" />
        </div>
    );
}
