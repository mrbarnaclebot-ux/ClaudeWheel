import React from 'react';
import type { Metadata } from 'next';
import { TelegramProvider } from '@/components/TelegramProvider';
import { PrivyTMAProvider } from '@/components/PrivyTMAProvider';
import { QueryProvider } from '@/components/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
    title: 'ClaudeWheel',
    description: 'Autonomous token market-making on Solana',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-telegram-bg text-telegram-text">
                <TelegramProvider>
                    <PrivyTMAProvider>
                        <QueryProvider>
                            {children}
                        </QueryProvider>
                    </PrivyTMAProvider>
                </TelegramProvider>
            </body>
        </html>
    );
}
