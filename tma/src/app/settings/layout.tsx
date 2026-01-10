// Force dynamic rendering - pages in this directory use Privy hooks which require runtime
export const dynamic = 'force-dynamic';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
