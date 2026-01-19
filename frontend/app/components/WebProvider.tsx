'use client';

import { createContext, useContext, ReactNode, useCallback } from 'react';

/**
 * Web Provider - provides the same interface as TelegramProvider but for web
 * This allows components to work in both TMA and web environments
 */

interface WebContextValue {
    // Haptic feedback - no-op on web, provides the same interface as TMA
    hapticFeedback: (type: 'light' | 'medium' | 'heavy') => void;
    // User info - null on web (use Privy user instead)
    user: null;
    // Ready state
    isReady: boolean;
}

const WebContext = createContext<WebContextValue | null>(null);

interface WebProviderProps {
    children: ReactNode;
}

export function WebProvider({ children }: WebProviderProps) {
    // Haptic feedback is a no-op on web
    const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy') => {
        // Could add vibration API support here if desired
        // navigator.vibrate exists on some browsers
        if ('vibrate' in navigator) {
            const durations = {
                light: 10,
                medium: 20,
                heavy: 30,
            };
            try {
                navigator.vibrate(durations[type]);
            } catch {
                // Ignore vibration errors
            }
        }
    }, []);

    const value: WebContextValue = {
        hapticFeedback,
        user: null,
        isReady: true,
    };

    return (
        <WebContext.Provider value={value}>
            {children}
        </WebContext.Provider>
    );
}

/**
 * Hook to use web context
 * Provides the same interface as useTelegram
 */
export function useWeb() {
    const context = useContext(WebContext);
    if (!context) {
        // Return default values if provider is not mounted
        return {
            hapticFeedback: () => {},
            user: null,
            isReady: true,
        };
    }
    return context;
}

/**
 * Alias for useTelegram compatibility
 * Components can use this hook and it will work in both TMA and web
 */
export const useTelegram = useWeb;
