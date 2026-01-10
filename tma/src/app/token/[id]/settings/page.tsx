'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useTelegram } from '@/components/TelegramProvider';
import { api } from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';

interface TokenConfig {
    flywheel_active: boolean;
    auto_claim_enabled: boolean;
    algorithm_mode: 'simple' | 'smart' | 'rebalance';
    min_buy_amount_sol: number;
    max_buy_amount_sol: number;
    max_sell_tokens: number;
    slippage_bps: number;
    trading_route: 'auto' | 'bags' | 'jupiter';
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
    const { getAccessToken } = usePrivy();
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
                min_buy_amount_sol: token.config.min_buy_amount_sol,
                max_buy_amount_sol: token.config.max_buy_amount_sol,
                slippage_bps: token.config.slippage_bps,
                trading_route: token.config.trading_route,
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
            hapticFeedback('medium');
            setHasChanges(false);
            router.push(`/token/${tokenId}`);
        },
        onError: () => {
            hapticFeedback('heavy');
        },
    });

    const updateField = <K extends keyof TokenConfig>(field: K, value: TokenConfig[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = () => {
        saveMutation.mutate(formData);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen p-4 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
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
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href={`/token/${tokenId}`}
                    onClick={() => hapticFeedback('light')}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center"
                >
                    ←
                </Link>
                <div>
                    <h1 className="text-xl font-bold">{token.token_symbol} Settings</h1>
                    <p className="text-sm text-gray-400">Configure flywheel behavior</p>
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

            {/* Trading Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-4">Trading Settings</h3>

                <div className="space-y-4">
                    {/* Min Buy Amount */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Min Buy Amount (SOL)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.001"
                            max={formData.max_buy_amount_sol}
                            value={formData.min_buy_amount_sol || ''}
                            onChange={(e) => updateField('min_buy_amount_sol', parseFloat(e.target.value))}
                            className="w-full bg-gray-900 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>

                    {/* Max Buy Amount */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Max Buy Amount (SOL)</label>
                        <input
                            type="number"
                            step="0.01"
                            min={formData.min_buy_amount_sol}
                            max="10"
                            value={formData.max_buy_amount_sol || ''}
                            onChange={(e) => updateField('max_buy_amount_sol', parseFloat(e.target.value))}
                            className="w-full bg-gray-900 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>

                    {/* Slippage */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Slippage: {((formData.slippage_bps || 0) / 100).toFixed(1)}%
                        </label>
                        <input
                            type="range"
                            min="50"
                            max="1000"
                            step="50"
                            value={formData.slippage_bps || 300}
                            onChange={(e) => updateField('slippage_bps', parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0.5%</span>
                            <span>10%</span>
                        </div>
                    </div>

                    {/* Trading Route */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Trading Route</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['auto', 'bags', 'jupiter'] as const).map((route) => (
                                <button
                                    key={route}
                                    onClick={() => updateField('trading_route', route)}
                                    className={`py-3 rounded-lg font-medium transition-colors capitalize ${
                                        formData.trading_route === route
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-700 text-gray-300'
                                    }`}
                                >
                                    {route}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            Auto: Uses Bags.fm before graduation, Jupiter after
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Algorithm Settings */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gray-800/50 rounded-xl p-4 mb-6"
            >
                <h3 className="font-medium text-gray-400 mb-4">Algorithm Mode</h3>

                <div className="space-y-3">
                    {([
                        { value: 'simple', label: 'Simple', desc: '5 buys then 5 sells, repeat', disabled: false },
                        { value: 'smart', label: 'Smart', desc: 'Coming Soon', disabled: true },
                        { value: 'rebalance', label: 'Rebalance', desc: 'Maintains target allocation', disabled: false },
                    ] as const).map((mode) => (
                        <button
                            key={mode.value}
                            onClick={() => !mode.disabled && updateField('algorithm_mode', mode.value)}
                            disabled={mode.disabled}
                            className={`w-full p-4 rounded-xl text-left transition-colors ${
                                mode.disabled
                                    ? 'bg-gray-800/30 border border-gray-700/50 opacity-50 cursor-not-allowed'
                                    : formData.algorithm_mode === mode.value
                                    ? 'bg-green-600/20 border border-green-600/50'
                                    : 'bg-gray-700/50 border border-transparent'
                            }`}
                        >
                            <p className="font-medium">{mode.label}</p>
                            <p className="text-xs text-gray-400">{mode.desc}</p>
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Save Button (Fixed at bottom) */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950/90 backdrop-blur"
            >
                <button
                    onClick={handleSave}
                    disabled={!hasChanges || saveMutation.isPending}
                    className={`w-full py-4 rounded-xl font-medium transition-colors ${
                        hasChanges
                            ? 'bg-green-600 hover:bg-green-500'
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {saveMutation.isPending ? 'Saving...' : hasChanges ? 'Save Changes' : 'No Changes'}
                </button>
            </motion.div>
        </div>
    );
}
