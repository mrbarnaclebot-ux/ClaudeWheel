'use client';

import { motion } from 'framer-motion';

interface LoadingStateProps {
  title?: string;
  message?: string;
  variant?: 'fullscreen' | 'inline' | 'card';
  showProgress?: boolean;
  progress?: number;
  steps?: {
    label: string;
    status: 'pending' | 'loading' | 'complete' | 'error';
  }[];
}

export function LoadingState({
  title = 'Loading...',
  message,
  variant = 'fullscreen',
  showProgress = false,
  progress = 0,
  steps,
}: LoadingStateProps) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 py-4">
        <div className="animate-spin w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full" />
        <div>
          <p className="text-sm text-text-primary">{title}</p>
          {message && <p className="text-xs text-text-muted">{message}</p>}
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="bg-bg-card border border-border-subtle rounded-xl p-6 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-text-primary font-medium">{title}</p>
        {message && <p className="text-xs text-text-muted mt-1">{message}</p>}
        {showProgress && (
          <div className="mt-4">
            <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-xs text-text-muted mt-1">{progress}%</p>
          </div>
        )}
      </div>
    );
  }

  // Fullscreen variant
  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      {/* Animated logo/spinner */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-16 h-16 border-4 border-accent-primary/30 border-t-accent-primary rounded-full mb-6"
      />

      <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
      {message && (
        <p className="text-text-muted text-center max-w-xs mb-6">{message}</p>
      )}

      {/* Steps progress */}
      {steps && steps.length > 0 && (
        <div className="w-full max-w-xs space-y-2">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step.status === 'complete'
                  ? 'bg-success text-white'
                  : step.status === 'loading'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : step.status === 'error'
                  ? 'bg-error text-white'
                  : 'bg-bg-secondary text-text-muted'
              }`}>
                {step.status === 'complete' ? '✓' :
                 step.status === 'loading' ? (
                   <div className="w-3 h-3 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                 ) :
                 step.status === 'error' ? '✗' :
                 index + 1}
              </div>
              <span className={`text-sm ${
                step.status === 'complete' ? 'text-success' :
                step.status === 'loading' ? 'text-text-primary' :
                step.status === 'error' ? 'text-error' :
                'text-text-muted'
              }`}>
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Progress bar (if no steps) */}
      {showProgress && !steps && (
        <div className="w-full max-w-xs">
          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-text-muted text-center mt-2">{progress}%</p>
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loading placeholder for content
 */
export function LoadingSkeleton({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-bg-secondary rounded animate-pulse"
          style={{ width: `${Math.random() * 30 + 70}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Page-level loading wrapper
 */
export function PageLoading({
  page,
}: {
  page: 'dashboard' | 'token' | 'launch' | 'mm' | 'onboarding' | 'general';
}) {
  const messages = {
    dashboard: {
      title: 'Loading Dashboard',
      message: 'Fetching your tokens and balances...',
    },
    token: {
      title: 'Loading Token',
      message: 'Fetching token details and history...',
    },
    launch: {
      title: 'Preparing Launch',
      message: 'Setting up token creation...',
    },
    mm: {
      title: 'Loading MM Mode',
      message: 'Checking for pending activations...',
    },
    onboarding: {
      title: 'Setting Up',
      message: 'Preparing your wallets...',
    },
    general: {
      title: 'Loading',
      message: 'Please wait...',
    },
  };

  const config = messages[page];

  return <LoadingState title={config.title} message={config.message} />;
}
