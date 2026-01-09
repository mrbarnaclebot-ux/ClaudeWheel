'use client';

import React, { useEffect, createContext, useContext, useState } from 'react';
import { retrieveLaunchParams, type RetrieveLPResultCamelCased } from '@telegram-apps/bridge';

interface TelegramContextType {
    isReady: boolean;
    launchParams: RetrieveLPResultCamelCased | null;
    user: {
        id: number;
        firstName: string;
        lastName?: string;
        username?: string;
        photoUrl?: string;
    } | null;
    close: () => void;
    expand: () => void;
    hapticFeedback: (type: 'light' | 'medium' | 'heavy') => void;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export function TelegramProvider({ children }: { children: React.ReactNode }) {
    const [isReady, setIsReady] = useState(false);
    const [launchParams, setLaunchParams] = useState<RetrieveLPResultCamelCased | null>(null);
    const [user, setUser] = useState<TelegramContextType['user']>(null);

    useEffect(() => {
        // Only run in browser
        if (typeof window === 'undefined') return;

        try {
            // Get launch params (contains user info) - use camelCase version
            const params = retrieveLaunchParams(true);
            setLaunchParams(params);

            // Extract user from tgWebAppData (init data)
            const initData = params.tgWebAppData;
            if (initData?.user) {
                setUser({
                    id: initData.user.id,
                    firstName: initData.user.firstName,
                    lastName: initData.user.lastName,
                    username: initData.user.username,
                    photoUrl: initData.user.photoUrl,
                });
            }

            // Expand the Mini App to full height
            window.Telegram?.WebApp?.expand();

            setIsReady(true);
        } catch (error) {
            console.error('Failed to initialize Telegram:', error);
            // Still mark as ready for development outside Telegram
            setIsReady(true);
        }
    }, []);

    const close = () => window.Telegram?.WebApp?.close();
    const expand = () => window.Telegram?.WebApp?.expand();
    const hapticFeedback = (type: 'light' | 'medium' | 'heavy') => {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(type);
    };

    return (
        <TelegramContext.Provider value={{ isReady, launchParams, user, close, expand, hapticFeedback }}>
            {children}
        </TelegramContext.Provider>
    );
}

export function useTelegram() {
    const context = useContext(TelegramContext);
    if (!context) throw new Error('useTelegram must be used within TelegramProvider');
    return context;
}
