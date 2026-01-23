import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { api } from '@/lib/api';

export function useOnboardingStatus() {
    const { ready, authenticated, getAccessToken } = usePrivy();

    const { data, isLoading } = useQuery({
        queryKey: ['onboarding-status'],
        queryFn: async () => {
            const token = await getAccessToken();
            const res = await api.get('/api/users/onboarding-status', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data;
        },
        enabled: ready && authenticated,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    return {
        isOnboarded: data?.isOnboarded ?? false,
        isLoading: !ready || isLoading,
    };
}
