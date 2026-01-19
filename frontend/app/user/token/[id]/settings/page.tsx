'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivyWrapper } from '@/app/hooks/usePrivyWrapper';
import { useTelegram } from '@/app/components/WebProvider';
import { api } from '@/app/lib/api';
import { toast } from '@/app/lib/toast';
import { LoadingButton, UnsavedChangesDialog, useUnsavedChanges, AlgorithmBadge } from '@/app/components/user';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';

type AlgorithmMode = 'simple' | 'turbo_lite' | 'rebalance';

interface TokenConfig {
    flywheel_active: boolean;
    auto_claim_enabled: boolean;
    algorithm_mode: AlgorithmMode;

    // Turbo Lite configuration
    turbo_job_interval_seconds?: number;
    turbo_cycle_size_buys?: number;
    turbo_cycle_size_sells?: number;
    turbo_inter_token_delay_ms?: number;
    turbo_global_rate_limit?: number;
    turbo_confirmation_timeout?: number;
    turbo_batch_state_updates?: boolean;
}

interface TokenDetails {
    id: string;
    token_symbol: string;
    token_name: string;
    config: TokenConfig;
}

export default function TokenSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const tokenId = params.id as string;
    const queryClient = useQueryClient();
    const { getAccessToken } = usePrivyWrapper();
    const { hapticFeedback } = useTelegram();

    const [formData, setFormData] = useState<Partial<TokenConfig>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch token details
    const { data: token, isLoading, error } = useQuery({
        queryKey: ['token', tokenId],
        queryFn: async () => {
            const accessToken = await getAccessToken();
            const res = await api.get(`/api/privy/tokens/${tokenId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            return res.data as TokenDetails;
        },
        enabled: !!tokenId,
    });

    // Initialize form data when token loads
    useEffect(() => {
        if (token?.config) {
            setFormData({
                flywheel_active: token.config.flywheel_active,
                auto_claim_enabled: token.config.auto_claim_enabled,
                algorithm_mode: token.config.algorithm_mode,

                // Initialize turbo fields with defaults
                turbo_job_interval_seconds: token.config.turbo_job_interval_seconds ?? 15,
                turbo_cycle_size_buys: token.config.turbo_cycle_size_buys ?? 8,
                turbo_cycle_size_sells: token.config.turbo_cycle_size_sells ?? 8,
                turbo_inter_token_delay_ms: token.config.turbo_inter_token_delay_ms ?? 200,
                turbo_global_rate_limit: token.config.turbo_global_rate_limit ?? 60,
                turbo_confirmation_timeout: token.config.turbo_confirmation_timeout ?? 45,
                turbo_batch_state_updates: token.config.turbo_batch_state_updates ?? true,
            });
        }
    }, [token]);

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async (data: Partial<TokenConfig>) => {
            const accessToken = await getAccessToken();
            await api.put(`/api/privy/tokens/${tokenId}/config`, data, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['token', tokenId] });
            queryClient.invalidateQueries({ queryKey: ['tokens'] });
            toast.success('Settings saved', {
                description: 'Your configuration has been updated',
            });
            setHasChanges(false);
            router.push(`/user/token/${tokenId}`);
        },
        onError: (error: any) => {
            toast.error('Failed to save settings', {
                description: error?.response?.data?.error || 'Please try again',
            });
        },
    });

    // Handle save for unsaved changes dialog
    const handleSave = useCallback(async () => {
        await saveMutation.mutateAsync(formData);
    }, [formData, saveMutation]);

    // Unsaved changes hook
    const {
        showDialog: showUnsavedDialog,
        handleNavigate,
        UnsavedChangesDialogProps,
    } = useUnsavedChanges({
        hasChanges,
        onSave: handleSave,
    });

    // Override back button to check for unsaved changes
    const handleBack = useCallback(() => {
        handleNavigate(() => router.push(`/user/token/${tokenId}`));
    }, [handleNavigate, router, tokenId]);

    const updateField = <K extends keyof TokenConfig>(field: K, value: TokenConfig[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        hapticFeedback('light');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-void p-4 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error || !token) {
        return (
            <div className="min-h-screen bg-void p-4">
                <div className="bg-error/20 border border-error/50 rounded-xl p-4 text-error text-center">
                    <p>Failed to load token settings</p>
                    <Link href="/user/dashboard" className="text-accent-primary mt-4 block">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-void p-4 pb-24">
            {/* Unsaved Changes Dialog */}
            <UnsavedChangesDialog {...UnsavedChangesDialogProps} />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="w-10 h-10 bg-bg-card border border-border-subtle hover:border-border-accent rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
                >
                    <span className="text-lg">&#8592;</span>
                </button>
                <div>
                    <h1 className="text-xl font-bold text-text-primary">{token.token_symbol} Settings</h1>
                    <p className="text-sm text-text-muted">Configure flywheel behavior</p>
                </div>
            </div>

            {/* Basic Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-text-secondary mb-4">Basic Settings</h3>

                <div className="space-y-4">
                    {/* Flywheel Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text-primary">Flywheel</p>
                            <p className="text-xs text-text-muted">Enable automated trading</p>
                        </div>
                        <button
                            onClick={() => updateField('flywheel_active', !formData.flywheel_active)}
                            className={`w-14 h-8 rounded-full transition-colors ${
                                formData.flywheel_active ? 'bg-success' : 'bg-bg-secondary'
                            }`}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full transition-transform mx-1 ${
                                formData.flywheel_active ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                        </button>
                    </div>

                    {/* Auto-claim Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text-primary">Auto-claim</p>
                            <p className="text-xs text-text-muted">Automatically claim fees when threshold is reached</p>
                        </div>
                        <button
                            onClick={() => updateField('auto_claim_enabled', !formData.auto_claim_enabled)}
                            className={`w-14 h-8 rounded-full transition-colors ${
                                formData.auto_claim_enabled ? 'bg-success' : 'bg-bg-secondary'
                            }`}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full transition-transform mx-1 ${
                                formData.auto_claim_enabled ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Algorithm Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-text-secondary mb-4">Algorithm Mode</h3>

                <div className="space-y-3">
                    {([
                        { value: 'simple' as const, label: 'Simple', icon: '', desc: '5 buys -> 5 sells (60s cycles)', disabled: false },
                        { value: 'turbo_lite' as const, label: 'Turbo Lite', icon: '', desc: '8 buys -> 8 sells (15s cycles, 8x faster)', disabled: false },
                        { value: 'rebalance' as const, label: 'Rebalance', icon: '', desc: 'Maintains target allocation', disabled: true },
                    ]).map((mode) => (
                        <button
                            key={mode.value}
                            onClick={() => !mode.disabled && updateField('algorithm_mode', mode.value)}
                            disabled={mode.disabled}
                            className={`w-full p-4 rounded-xl text-left transition-colors ${
                                mode.disabled
                                    ? 'bg-bg-secondary border border-border-subtle opacity-50 cursor-not-allowed'
                                    : formData.algorithm_mode === mode.value
                                    ? 'bg-success/20 border border-success/50'
                                    : 'bg-bg-secondary border border-transparent hover:border-border-accent'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <AlgorithmBadge mode={mode.value} size="sm" />
                                <p className="font-medium text-text-primary">{mode.label}</p>
                            </div>
                            <p className="text-xs text-text-muted mt-1">{mode.desc}</p>
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Turbo Mode Configuration */}
            {formData.algorithm_mode === 'turbo_lite' && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4 bg-bg-card border border-border-subtle rounded-xl p-4 mb-6"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <AlgorithmBadge mode="turbo_lite" size="md" />
                        <h3 className="font-semibold text-text-primary">Turbo Mode Settings</h3>
                    </div>

                    {/* Cycle Size Configuration */}
                    <div className="space-y-3">
                        <label className="block text-sm text-text-secondary">
                            Cycle Size (trades per phase)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-text-muted mb-1 block">Buys per cycle</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={formData.turbo_cycle_size_buys ?? 8}
                                    onChange={(e) => updateField('turbo_cycle_size_buys', parseInt(e.target.value) || 8)}
                                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-text-primary focus:border-border-accent focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-text-muted mb-1 block">Sells per cycle</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={formData.turbo_cycle_size_sells ?? 8}
                                    onChange={(e) => updateField('turbo_cycle_size_sells', parseInt(e.target.value) || 8)}
                                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-text-primary focus:border-border-accent focus:outline-none"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-text-muted">Default: 8 buys + 8 sells (vs 5+5 in Simple mode)</p>
                    </div>

                    {/* Rate Limit Configuration */}
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">
                            Rate Limit (trades per minute)
                        </label>
                        <input
                            type="range"
                            min={30}
                            max={200}
                            step={10}
                            value={formData.turbo_global_rate_limit ?? 60}
                            onChange={(e) => updateField('turbo_global_rate_limit', parseInt(e.target.value))}
                            className="w-full accent-accent-primary"
                        />
                        <div className="flex justify-between text-xs text-text-muted mt-1">
                            <span>30/min</span>
                            <span className="text-accent-primary font-semibold">
                                {formData.turbo_global_rate_limit ?? 60}/min
                            </span>
                            <span>200/min</span>
                        </div>
                    </div>

                    {/* Job Interval Configuration */}
                    <div>
                        <label className="block text-sm text-text-secondary mb-2">
                            Job Interval (seconds between cycles)
                        </label>
                        <input
                            type="range"
                            min={5}
                            max={60}
                            step={5}
                            value={formData.turbo_job_interval_seconds ?? 15}
                            onChange={(e) => updateField('turbo_job_interval_seconds', parseInt(e.target.value))}
                            className="w-full accent-accent-primary"
                        />
                        <div className="flex justify-between text-xs text-text-muted mt-1">
                            <span>5s</span>
                            <span className="text-accent-primary font-semibold">
                                {formData.turbo_job_interval_seconds ?? 15}s
                            </span>
                            <span>60s</span>
                        </div>
                    </div>

                    {/* Advanced Settings Toggle */}
                    <details className="border-t border-border-subtle pt-3">
                        <summary className="text-sm text-text-secondary cursor-pointer hover:text-text-primary">
                            Advanced Settings
                        </summary>
                        <div className="mt-3 space-y-3">
                            {/* Inter-token Delay */}
                            <div>
                                <label className="block text-xs text-text-muted mb-1">
                                    Inter-token Delay (ms)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    step={50}
                                    value={formData.turbo_inter_token_delay_ms ?? 200}
                                    onChange={(e) => updateField('turbo_inter_token_delay_ms', parseInt(e.target.value) || 200)}
                                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:border-border-accent focus:outline-none"
                                />
                            </div>

                            {/* Confirmation Timeout */}
                            <div>
                                <label className="block text-xs text-text-muted mb-1">
                                    Confirmation Timeout (seconds)
                                </label>
                                <input
                                    type="number"
                                    min={20}
                                    max={120}
                                    step={5}
                                    value={formData.turbo_confirmation_timeout ?? 45}
                                    onChange={(e) => updateField('turbo_confirmation_timeout', parseInt(e.target.value) || 45)}
                                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:border-border-accent focus:outline-none"
                                />
                            </div>

                            {/* Batch State Updates Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-xs text-text-secondary">Batch State Updates</label>
                                    <p className="text-xs text-text-muted">Save DB writes (recommended)</p>
                                </div>
                                <button
                                    onClick={() => updateField('turbo_batch_state_updates', !(formData.turbo_batch_state_updates ?? true))}
                                    className={`w-14 h-8 rounded-full transition-colors ${
                                        (formData.turbo_batch_state_updates ?? true) ? 'bg-success' : 'bg-bg-secondary'
                                    }`}
                                >
                                    <div className={`w-6 h-6 bg-white rounded-full transition-transform mx-1 ${
                                        (formData.turbo_batch_state_updates ?? true) ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>
                        </div>
                    </details>

                    {/* Performance Estimate */}
                    <div className="bg-success/10 border border-success/30 rounded-lg p-3 mt-4">
                        <div className="flex items-start gap-2">
                            <span className="text-lg">&#9889;</span>
                            <div>
                                <p className="text-sm font-semibold text-success">Estimated Performance</p>
                                <p className="text-xs text-text-secondary mt-1">
                                    ~{Math.floor((formData.turbo_cycle_size_buys ?? 8) * 2 * 60 / (formData.turbo_job_interval_seconds ?? 15))} trades/min
                                    ({Math.floor(((formData.turbo_cycle_size_buys ?? 8) * 2 * 60 / (formData.turbo_job_interval_seconds ?? 15)) / 10)}x faster than Simple mode)
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Save Button (Fixed at bottom) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="fixed bottom-0 left-0 right-0 p-4 bg-bg-void/90 backdrop-blur border-t border-border-subtle"
            >
                <LoadingButton
                    onClick={() => saveMutation.mutate(formData)}
                    isLoading={saveMutation.isPending}
                    loadingText="Saving..."
                    disabled={!hasChanges}
                    variant={hasChanges ? 'success' : 'secondary'}
                    fullWidth
                    className="py-4"
                >
                    {hasChanges ? 'Save Changes' : 'No Changes'}
                </LoadingButton>
            </motion.div>
        </div>
    );
}
