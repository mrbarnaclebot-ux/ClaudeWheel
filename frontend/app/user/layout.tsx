'use client';

import { ReactNode } from 'react';
import { QueryProvider } from '@/app/components/QueryProvider';
import { WebProvider } from '@/app/components/WebProvider';
import { PrivyWebProvider } from '@/app/components/PrivyWebProvider';
import { Toaster } from 'sonner';

interface UserLayoutProps {
    children: ReactNode;
}

export default function UserLayout({ children }: UserLayoutProps) {
    return (
        <PrivyWebProvider>
            <QueryProvider>
                <WebProvider>
                    <div className="min-h-screen bg-bg-void safe-area-inset-top safe-area-inset-bottom">
                        {children}
                    </div>
                    <Toaster
                        position="top-center"
                        expand={false}
                        richColors
                        closeButton
                        theme="dark"
                        toastOptions={{
                            duration: 4000,
                        }}
                    />
                </WebProvider>
            </QueryProvider>
        </PrivyWebProvider>
    );
}
