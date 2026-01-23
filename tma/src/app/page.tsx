'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { useOnboardingStatus } from '@/hooks/useOnboarding';

export default function EntryPage() {
    const router = useRouter();
    const { ready, authenticated } = usePrivy();
    const { isReady: telegramReady } = useTelegram();
    const { isOnboarded, isLoading } = useOnboardingStatus();

    useEffect(() => {
        if (!ready || !telegramReady || isLoading) return;

        if (!authenticated) {
            // In TMA, Privy should auto-authenticate
            // If not authenticated, something went wrong
            console.error('Privy not authenticated in TMA');
            return;
        }

        if (!isOnboarded) {
            router.replace('/onboarding');
        } else {
            router.replace('/dashboard');
        }
    }, [ready, telegramReady, authenticated, isOnboarded, isLoading, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0e0804]">
            <div className="animate-spin w-8 h-8 border-2 border-[#e67428] border-t-transparent rounded-full" />
        </div>
    );
}
