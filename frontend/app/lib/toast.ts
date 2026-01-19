import { toast as sonnerToast, ExternalToast } from 'sonner';

// Custom toast wrapper with ClaudeWheel styling
export const toast = {
    success: (message: string, options?: ExternalToast) => {
        sonnerToast.success(message, {
            ...options,
            className: 'toast-success',
        });
    },
    error: (message: string, options?: ExternalToast) => {
        sonnerToast.error(message, {
            ...options,
            className: 'toast-error',
        });
    },
    info: (message: string, options?: ExternalToast) => {
        sonnerToast.info(message, {
            ...options,
            className: 'toast-info',
        });
    },
    warning: (message: string, options?: ExternalToast) => {
        sonnerToast.warning(message, {
            ...options,
            className: 'toast-warning',
        });
    },
    loading: (message: string, options?: ExternalToast) => {
        return sonnerToast.loading(message, {
            ...options,
            className: 'toast-loading',
        });
    },
    dismiss: (toastId?: string | number) => {
        sonnerToast.dismiss(toastId);
    },
    copied: (message = 'Copied to clipboard') => {
        sonnerToast.success(message, {
            duration: 2000,
            className: 'toast-success',
        });
    },
    promise: <T>(
        promise: Promise<T>,
        options: {
            loading: string;
            success: string | ((data: T) => string);
            error: string | ((error: any) => string);
        }
    ) => {
        return sonnerToast.promise(promise, options);
    },
};
