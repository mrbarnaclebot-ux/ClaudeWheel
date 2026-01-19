'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivyWrapper } from '@/hooks/usePrivyWrapper';
import { useTelegram } from '@/components/TelegramProvider';
import { useOnboardingStatus } from '@/hooks/useOnboarding';

export default function EntryPage() {
    const router = useRouter();
    const { ready, authenticated } = usePrivyWrapper();
    const { isReady: telegramReady } = useTelegram();
    const { isOnboarded, isLoading } = useOnboardingStatus();
    const [timedOut, setTimedOut] = useState(false);

    // Debug logging
    useEffect(() => {
        console.log('[EntryPage] State:', { ready, authenticated, telegramReady, isLoading, isOnboarded });
    }, [ready, authenticated, telegramReady, isLoading, isOnboarded]);

    // Timeout after 15 seconds
    useEffect(() => {
        const timeout = setTimeout(() => setTimedOut(true), 15000);
        return () => clearTimeout(timeout);
    }, []);

    // Navigation logic
    useEffect(() => {
        if (!ready || !telegramReady || isLoading) return;

        if (!authenticated) {
            console.error('[EntryPage] Privy not authenticated in TMA');
            return;
        }

        if (!isOnboarded) {
            router.replace('/onboarding');
        } else {
            router.replace('/dashboard');
        }
    }, [ready, telegramReady, authenticated, isOnboarded, isLoading, router]);

    // Timeout error screen - shows which condition is blocking
    if (timedOut && (!ready || !telegramReady || isLoading || !authenticated)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#0e0804]">
                <div className="text-[#A63D2F] text-xl font-semibold mb-4">Connection Issue</div>
                <div className="text-[#7A756B] text-sm mb-6 space-y-1">
                    {!ready && <div>• Privy not ready</div>}
                    {ready && !authenticated && <div>• Not authenticated</div>}
                    {!telegramReady && <div>• Telegram not ready</div>}
                    {isLoading && <div>• Loading user status...</div>}
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-[#e67428] text-[#0e0804] rounded-xl font-semibold active:scale-95 transition-transform"
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
