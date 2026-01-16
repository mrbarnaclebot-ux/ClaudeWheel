import { toast as sonnerToast, ExternalToast } from 'sonner';

/**
 * Toast utility wrapper for consistent mutation feedback.
 * Integrates with Telegram haptic feedback when available.
 */

export interface ToastOptions extends ExternalToast {
  haptic?: 'light' | 'medium' | 'heavy' | 'error' | 'success' | 'warning';
}

export interface MutationToastOptions {
  loading: string;
  success: string | ((data: unknown) => string);
  error: string | ((error: unknown) => string);
  loadingDescription?: string;
  successDescription?: string | ((data: unknown) => string);
  errorDescription?: string | ((error: unknown) => string);
}

// Get haptic feedback function from Telegram context if available
const triggerHaptic = (type: ToastOptions['haptic']) => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.HapticFeedback) {
    const haptic = window.Telegram.WebApp.HapticFeedback;
    switch (type) {
      case 'light':
        haptic.impactOccurred('light');
        break;
      case 'medium':
        haptic.impactOccurred('medium');
        break;
      case 'heavy':
        haptic.impactOccurred('heavy');
        break;
      case 'error':
        haptic.notificationOccurred('error');
        break;
      case 'success':
        haptic.notificationOccurred('success');
        break;
      case 'warning':
        haptic.notificationOccurred('warning');
        break;
    }
  }
};

export const toast = {
  /**
   * Show a success toast
   */
  success: (message: string, options?: ToastOptions) => {
    triggerHaptic(options?.haptic ?? 'success');
    return sonnerToast.success(message, {
      duration: 3000,
      ...options,
    });
  },

  /**
   * Show an error toast
   */
  error: (message: string, options?: ToastOptions) => {
    triggerHaptic(options?.haptic ?? 'error');
    return sonnerToast.error(message, {
      duration: 4000,
      ...options,
    });
  },

  /**
   * Show a loading toast
   */
  loading: (message: string, options?: ToastOptions) => {
    triggerHaptic(options?.haptic ?? 'light');
    return sonnerToast.loading(message, options);
  },

  /**
   * Show an info toast
   */
  info: (message: string, options?: ToastOptions) => {
    triggerHaptic(options?.haptic ?? 'light');
    return sonnerToast.info(message, {
      duration: 3000,
      ...options,
    });
  },

  /**
   * Show a warning toast
   */
  warning: (message: string, options?: ToastOptions) => {
    triggerHaptic(options?.haptic ?? 'warning');
    return sonnerToast.warning(message, {
      duration: 4000,
      ...options,
    });
  },

  /**
   * Dismiss a toast by ID
   */
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },

  /**
   * Promise-based toast for mutations
   * Automatically shows loading, success, and error states
   */
  promise: <T>(
    promise: Promise<T>,
    options: MutationToastOptions,
    hapticFeedback?: (type: 'light' | 'medium' | 'heavy') => void
  ): Promise<T> => {
    triggerHaptic('light');

    return sonnerToast.promise(promise, {
      loading: options.loading,
      success: (data: T) => {
        // Trigger success haptic
        if (hapticFeedback) {
          hapticFeedback('medium');
        } else {
          triggerHaptic('success');
        }

        const message = typeof options.success === 'function'
          ? options.success(data)
          : options.success;

        const description = typeof options.successDescription === 'function'
          ? options.successDescription(data)
          : options.successDescription;

        return description ? { message, description } : message;
      },
      error: (error: unknown) => {
        // Trigger error haptic
        if (hapticFeedback) {
          hapticFeedback('heavy');
        } else {
          triggerHaptic('error');
        }

        const message = typeof options.error === 'function'
          ? options.error(error)
          : options.error;

        const description = typeof options.errorDescription === 'function'
          ? options.errorDescription(error)
          : options.errorDescription;

        return description ? { message, description } : message;
      },
    }) as Promise<T>;
  },

  /**
   * Copy feedback toast - shows checkmark briefly
   */
  copied: (label?: string) => {
    triggerHaptic('light');
    return sonnerToast.success(label || 'Copied to clipboard', {
      duration: 1500,
    });
  },
};

// Extend Window interface for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

export default toast;
