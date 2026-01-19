'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivyWrapper } from '@/hooks/usePrivyWrapper';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { LoadingButton } from '@/components/LoadingButton';
import { UnsavedChangesDialog, useUnsavedChanges } from '@/components/ConfirmDialog';
import { AlgorithmBadge } from '@/components/StatusBadge';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';

interface TokenConfig {
    flywheel_active: boolean;
    auto_claim_enabled: boolean;
    algorithm_mode: 'simple' | 'turbo_lite' | 'rebalance' | 'transaction_reactive';

    // Turbo Lite configuration
    turbo_job_interval_seconds?: number;
    turbo_cycle_size_buys?: number;
    turbo_cycle_size_sells?: number;
    turbo_inter_token_delay_ms?: number;
    turbo_global_rate_limit?: number;
    turbo_confirmation_timeout?: number;
    turbo_batch_state_updates?: boolean;

    // Transaction Reactive configuration
    reactive_enabled?: boolean;
    reactive_min_trigger_sol?: number;
    reactive_scale_percent?: number;
    reactive_max_response_percent?: number;
    reactive_cooldown_ms?: number;
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

                // Initialize reactive fields with defaults
                reactive_enabled: token.config.reactive_enabled ?? false,
                reactive_min_trigger_sol: token.config.reactive_min_trigger_sol ?? 0.5,
                reactive_scale_percent: token.config.reactive_scale_percent ?? 10,
                reactive_max_response_percent: token.config.reactive_max_response_percent ?? 80,
                reactive_cooldown_ms: token.config.reactive_cooldown_ms ?? 5000,
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
            router.push(`/token/${tokenId}`);
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
        handleNavigate(() => router.push(`/token/${tokenId}`));
    }, [handleNavigate, router, tokenId]);

    const updateField = <K extends keyof TokenConfig>(field: K, value: TokenConfig[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
                <div className="animate-spin w-12 h-12 border-3 border-accent-primary/30 border-t-accent-primary rounded-full mb-4" />
                <p className="text-text-primary font-medium">Loading Settings</p>
                <p className="text-xs text-text-muted mt-1">Fetching configuration...</p>
            </div>
        );
    }

    if (error || !token) {
        return (
            <div className="min-h-screen p-4">
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-400 text-center">
                    <p>Failed to load token settings</p>
                    <Link href="/dashboard" className="text-green-400 mt-4 block">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 pb-24">
            {/* Unsaved Changes Dialog */}
            <UnsavedChangesDialog {...UnsavedChangesDialogProps} />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={handleBack}
                    className="w-10 h-10 bg-bg-card border border-border-subtle hover:border-border-accent rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
                >
                    ←
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
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-4">Basic Settings</h3>

                <div className="space-y-4">
                    {/* Flywheel Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Flywheel</p>
                            <p className="text-xs text-gray-400">Enable automated trading</p>
                        </div>
                        <button
                            onClick={() => updateField('flywheel_active', !formData.flywheel_active)}
                            className={`w-14 h-8 rounded-full transition-colors ${
                                formData.flywheel_active ? 'bg-green-600' : 'bg-gray-600'
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
                            <p className="font-medium">Auto-claim</p>
                            <p className="text-xs text-gray-400">Automatically claim fees when threshold is reached</p>
                        </div>
                        <button
                            onClick={() => updateField('auto_claim_enabled', !formData.auto_claim_enabled)}
                            className={`w-14 h-8 rounded-full transition-colors ${
                                formData.auto_claim_enabled ? 'bg-green-600' : 'bg-gray-600'
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
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-2">Algorithm Mode</h3>
                <p className="text-xs text-text-muted mb-4">Choose how the flywheel executes trades</p>

                <div className="space-y-3">
                    {([
                        {
                            value: 'simple',
                            label: '🐢 Simple',
                            desc: 'Steady & reliable',
                            details: '5 buys then 5 sells per cycle, 60s intervals. Best for lower-volume tokens or if you want minimal activity.',
                            badge: 'Stable',
                            badgeColor: 'bg-blue-500/20 text-blue-400',
                            disabled: false
                        },
                        {
                            value: 'turbo_lite',
                            label: '🚀 Turbo Lite',
                            desc: 'High frequency trading',
                            details: '8 buys then 8 sells per cycle, 15s intervals. Generates more volume and fees but uses more capital.',
                            badge: 'Recommended',
                            badgeColor: 'bg-success/20 text-success',
                            disabled: false
                        },
                        {
                            value: 'transaction_reactive',
                            label: '⚡ Reactive',
                            desc: 'Counter big trades',
                            details: 'Monitors transactions in real-time. Sells when others buy big, buys when others sell big. Response scales with trade size.',
                            badge: 'Advanced',
                            badgeColor: 'bg-purple-500/20 text-purple-400',
                            disabled: false
                        },
                        {
                            value: 'rebalance',
                            label: '⚖️ Rebalance',
                            desc: 'Portfolio balancing',
                            details: 'Automatically maintains a target SOL/token ratio. Coming soon.',
                            badge: 'Coming Soon',
                            badgeColor: 'bg-gray-500/20 text-gray-400',
                            disabled: true
                        },
                    ] as const).map((mode) => (
                        <button
                            key={mode.value}
                            onClick={() => !mode.disabled && updateField('algorithm_mode', mode.value)}
                            disabled={mode.disabled}
                            className={`w-full p-4 rounded-xl text-left transition-colors ${
                                mode.disabled
                                    ? 'bg-gray-800/30 border border-gray-700/50 opacity-50 cursor-not-allowed'
                                    : formData.algorithm_mode === mode.value
                                    ? 'bg-green-600/20 border-2 border-green-600/50'
                                    : 'bg-gray-700/50 border border-gray-600/30 hover:border-gray-500/50'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <p className="font-medium">{mode.label}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${mode.badgeColor}`}>
                                    {mode.badge}
                                </span>
                            </div>
                            <p className="text-sm text-text-secondary mb-1">{mode.desc}</p>
                            <p className="text-xs text-gray-500">{mode.details}</p>
                        </button>
                    ))}
                </div>

                {/* Algorithm comparison */}
                <div className="mt-4 p-3 bg-bg-secondary rounded-lg">
                    <p className="text-xs text-text-muted mb-2">Quick comparison:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-text-muted">Simple:</span>
                            <span className="text-text-secondary">~10 trades/cycle</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-text-muted">Turbo:</span>
                            <span className="text-success">~64 trades/cycle</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Turbo Mode Configuration */}
            {formData.algorithm_mode === 'turbo_lite' && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4 bg-gray-800/30 rounded-xl p-4 border border-gray-700/50 mb-6"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🚀</span>
                            <h3 className="font-semibold text-white">Turbo Mode Settings</h3>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-2">
                        <label className="text-xs text-gray-400">Quick Presets</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                {
                                    name: 'Conservative',
                                    icon: '🛡️',
                                    values: { buys: 6, sells: 6, interval: 30, rateLimit: 40 },
                                    desc: 'Lower risk'
                                },
                                {
                                    name: 'Balanced',
                                    icon: '⚖️',
                                    values: { buys: 8, sells: 8, interval: 15, rateLimit: 60 },
                                    desc: 'Recommended'
                                },
                                {
                                    name: 'Aggressive',
                                    icon: '🔥',
                                    values: { buys: 12, sells: 12, interval: 10, rateLimit: 100 },
                                    desc: 'Max volume'
                                },
                            ].map((preset) => {
                                const isActive =
                                    formData.turbo_cycle_size_buys === preset.values.buys &&
                                    formData.turbo_cycle_size_sells === preset.values.sells &&
                                    formData.turbo_job_interval_seconds === preset.values.interval;
                                return (
                                    <button
                                        key={preset.name}
                                        onClick={() => {
                                            updateField('turbo_cycle_size_buys', preset.values.buys);
                                            updateField('turbo_cycle_size_sells', preset.values.sells);
                                            updateField('turbo_job_interval_seconds', preset.values.interval);
                                            updateField('turbo_global_rate_limit', preset.values.rateLimit);
                                        }}
                                        className={`p-2 rounded-lg text-center transition-colors ${
                                            isActive
                                                ? 'bg-green-600/30 border-2 border-green-500'
                                                : 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500'
                                        }`}
                                    >
                                        <span className="text-lg">{preset.icon}</span>
                                        <p className="text-xs font-medium mt-1">{preset.name}</p>
                                        <p className="text-xs text-gray-500">{preset.desc}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cycle Size Configuration */}
                    <div className="space-y-3 pt-3 border-t border-gray-700">
                        <label className="block text-sm text-gray-300">
                            Cycle Size (trades per phase)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Buys per cycle</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={formData.turbo_cycle_size_buys ?? 8}
                                    onChange={(e) => updateField('turbo_cycle_size_buys', parseInt(e.target.value) || 8)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Sells per cycle</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={formData.turbo_cycle_size_sells ?? 8}
                                    onChange={(e) => updateField('turbo_cycle_size_sells', parseInt(e.target.value) || 8)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Rate Limit Configuration */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Rate Limit (trades per minute)
                        </label>
                        <input
                            type="range"
                            min={30}
                            max={200}
                            step={10}
                            value={formData.turbo_global_rate_limit ?? 60}
                            onChange={(e) => updateField('turbo_global_rate_limit', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>30/min</span>
                            <span className="text-green-400 font-semibold">
                                {formData.turbo_global_rate_limit ?? 60}/min
                            </span>
                            <span>200/min</span>
                        </div>
                    </div>

                    {/* Job Interval Configuration */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Job Interval (seconds between cycles)
                        </label>
                        <input
                            type="range"
                            min={5}
                            max={60}
                            step={5}
                            value={formData.turbo_job_interval_seconds ?? 15}
                            onChange={(e) => updateField('turbo_job_interval_seconds', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>5s</span>
                            <span className="text-green-400 font-semibold">
                                {formData.turbo_job_interval_seconds ?? 15}s
                            </span>
                            <span>60s</span>
                        </div>
                    </div>

                    {/* Advanced Settings - Now expanded by default */}
                    <div className="border-t border-gray-700 pt-3">
                        <p className="text-sm text-gray-300 mb-3">Advanced Settings</p>
                        <div className="space-y-3">
                            {/* Inter-token Delay */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Inter-token Delay (ms)
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    step={50}
                                    value={formData.turbo_inter_token_delay_ms ?? 200}
                                    onChange={(e) => updateField('turbo_inter_token_delay_ms', parseInt(e.target.value) || 200)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">Delay between processing different tokens</p>
                            </div>

                            {/* Confirmation Timeout */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Confirmation Timeout (seconds)
                                </label>
                                <input
                                    type="number"
                                    min={20}
                                    max={120}
                                    step={5}
                                    value={formData.turbo_confirmation_timeout ?? 45}
                                    onChange={(e) => updateField('turbo_confirmation_timeout', parseInt(e.target.value) || 45)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">How long to wait for tx confirmation</p>
                            </div>

                            {/* Batch State Updates Toggle */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-xs text-gray-300">Batch State Updates</label>
                                    <p className="text-xs text-gray-500">Save DB writes (recommended)</p>
                                </div>
                                <button
                                    onClick={() => updateField('turbo_batch_state_updates', !(formData.turbo_batch_state_updates ?? true))}
                                    className={`w-14 h-8 rounded-full transition-colors ${
                                        (formData.turbo_batch_state_updates ?? true) ? 'bg-green-600' : 'bg-gray-600'
                                    }`}
                                >
                                    <div className={`w-6 h-6 bg-white rounded-full transition-transform mx-1 ${
                                        (formData.turbo_batch_state_updates ?? true) ? 'translate-x-6' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Performance Estimate */}
                    <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                            <span className="text-lg">⚡</span>
                            <div>
                                <p className="text-sm font-semibold text-green-400">Estimated Performance</p>
                                <p className="text-xs text-gray-300 mt-1">
                                    ~{Math.floor((formData.turbo_cycle_size_buys ?? 8) * 2 * 60 / (formData.turbo_job_interval_seconds ?? 15))} trades/min
                                    ({Math.floor(((formData.turbo_cycle_size_buys ?? 8) * 2 * 60 / (formData.turbo_job_interval_seconds ?? 15)) / 10)}x faster than Simple mode)
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Transaction Reactive Mode Configuration */}
            {formData.algorithm_mode === 'transaction_reactive' && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4 bg-gray-800/30 rounded-xl p-4 border border-gray-700/50 mb-6"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">⚡</span>
                        <h3 className="font-semibold text-white">Reactive Mode Settings</h3>
                    </div>

                    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-yellow-200">
                            <strong>How it works:</strong> Monitors transactions in real-time. When someone makes a big buy,
                            we automatically sell. When someone makes a big sell, we automatically buy.
                            Response size scales with trade size.
                        </p>
                    </div>

                    {/* Min Trigger Amount */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Minimum Trigger (SOL)
                        </label>
                        <input
                            type="range"
                            min={0.1}
                            max={10}
                            step={0.1}
                            value={formData.reactive_min_trigger_sol ?? 0.5}
                            onChange={(e) => updateField('reactive_min_trigger_sol', parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0.1 SOL</span>
                            <span className="text-cyan-400 font-semibold">
                                {(formData.reactive_min_trigger_sol ?? 0.5).toFixed(1)} SOL
                            </span>
                            <span>10 SOL</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Ignore trades smaller than this</p>
                    </div>

                    {/* Scale Percent */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Response Scale (% per SOL)
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={50}
                            step={1}
                            value={formData.reactive_scale_percent ?? 10}
                            onChange={(e) => updateField('reactive_scale_percent', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>1%</span>
                            <span className="text-cyan-400 font-semibold">
                                {formData.reactive_scale_percent ?? 10}% per SOL
                            </span>
                            <span>50%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Example: {formData.reactive_scale_percent ?? 10}% × 3 SOL trade = {(formData.reactive_scale_percent ?? 10) * 3}% response
                        </p>
                    </div>

                    {/* Max Response Percent */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Maximum Response (% of wallet)
                        </label>
                        <input
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={formData.reactive_max_response_percent ?? 80}
                            onChange={(e) => updateField('reactive_max_response_percent', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>10%</span>
                            <span className="text-cyan-400 font-semibold">
                                {formData.reactive_max_response_percent ?? 80}% max
                            </span>
                            <span>100%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Cap response size even on huge trades</p>
                    </div>

                    {/* Cooldown */}
                    <div>
                        <label className="block text-sm text-gray-300 mb-2">
                            Cooldown (seconds)
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={60}
                            step={1}
                            value={(formData.reactive_cooldown_ms ?? 5000) / 1000}
                            onChange={(e) => updateField('reactive_cooldown_ms', parseInt(e.target.value) * 1000)}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>1s</span>
                            <span className="text-cyan-400 font-semibold">
                                {(formData.reactive_cooldown_ms ?? 5000) / 1000}s
                            </span>
                            <span>60s</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Min time between reactive trades</p>
                    </div>

                    {/* Response Preview */}
                    <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-3 mt-4">
                        <div className="flex items-start gap-2">
                            <span className="text-lg">📊</span>
                            <div>
                                <p className="text-sm font-semibold text-cyan-400">Response Formula</p>
                                <p className="text-xs text-gray-300 mt-1">
                                    Response % = min(SOL × {formData.reactive_scale_percent ?? 10}%, {formData.reactive_max_response_percent ?? 80}%)
                                </p>
                                <div className="text-xs text-gray-400 mt-2 space-y-1">
                                    <p>• 1 SOL trade → {Math.min(1 * (formData.reactive_scale_percent ?? 10), formData.reactive_max_response_percent ?? 80)}% response</p>
                                    <p>• 3 SOL trade → {Math.min(3 * (formData.reactive_scale_percent ?? 10), formData.reactive_max_response_percent ?? 80)}% response</p>
                                    <p>• 10 SOL trade → {Math.min(10 * (formData.reactive_scale_percent ?? 10), formData.reactive_max_response_percent ?? 80)}% response</p>
                                </div>
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
