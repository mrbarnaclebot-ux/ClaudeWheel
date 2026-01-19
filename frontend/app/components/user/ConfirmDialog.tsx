'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelegram } from '@/components/WebProvider';
import { LoadingButton } from './LoadingButton';

type DialogVariant = 'default' | 'danger' | 'warning' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<DialogVariant, { icon: string; confirmClass: string }> = {
  default: {
    icon: '💡',
    confirmClass: 'bg-accent-primary hover:bg-accent-secondary text-bg-void',
  },
  danger: {
    icon: '⚠️',
    confirmClass: 'bg-error hover:bg-error/80 text-white',
  },
  warning: {
    icon: '⚡',
    confirmClass: 'bg-warning hover:bg-warning/80 text-bg-void',
  },
  success: {
    icon: '✓',
    confirmClass: 'bg-success hover:bg-success/80 text-white',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  children,
}: ConfirmDialogProps) {
  const { hapticFeedback } = useTelegram();
  const config = variantStyles[variant];

  const handleClose = useCallback(() => {
    if (!isLoading) {
      hapticFeedback('light');
      onClose();
    }
  }, [isLoading, hapticFeedback, onClose]);

  const handleConfirm = useCallback(async () => {
    hapticFeedback('medium');
    await onConfirm();
  }, [hapticFeedback, onConfirm]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, handleClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-void/80 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 bottom-4 z-50 sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <div className="bg-bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="p-6 pb-4 text-center">
                <span className="text-4xl mb-4 block">{config.icon}</span>
                <h3 className="text-xl font-bold text-text-primary mb-2">{title}</h3>
                {description && (
                  <p className="text-sm text-text-muted">{description}</p>
                )}
              </div>

              {/* Custom content */}
              {children && (
                <div className="px-6 pb-4">
                  {children}
                </div>
              )}

              {/* Actions */}
              <div className="p-4 bg-bg-secondary border-t border-border-subtle flex gap-3">
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 bg-bg-card hover:bg-bg-card-hover border border-border-subtle rounded-xl py-3 font-medium text-text-secondary transition-colors disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <LoadingButton
                  onClick={handleConfirm}
                  isLoading={isLoading}
                  loadingText="..."
                  className={`flex-1 rounded-xl py-3 font-medium transition-colors ${config.confirmClass}`}
                >
                  {confirmLabel}
                </LoadingButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Unsaved changes dialog specifically for forms
 */
interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export function UnsavedChangesDialog({
  isOpen,
  onDiscard,
  onSave,
  onCancel,
  isSaving = false,
}: UnsavedChangesDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-void/80 backdrop-blur-sm z-50"
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 bottom-4 z-50 sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <div className="bg-bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 text-center">
                <span className="text-4xl mb-4 block">💾</span>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  Unsaved Changes
                </h3>
                <p className="text-sm text-text-muted">
                  You have unsaved changes. What would you like to do?
                </p>
              </div>

              <div className="p-4 bg-bg-secondary border-t border-border-subtle space-y-2">
                <LoadingButton
                  onClick={onSave}
                  isLoading={isSaving}
                  loadingText="Saving..."
                  fullWidth
                  variant="primary"
                  className="py-3"
                >
                  Save Changes
                </LoadingButton>
                <button
                  onClick={onDiscard}
                  disabled={isSaving}
                  className="w-full bg-error/10 hover:bg-error/20 border border-error/30 rounded-xl py-3 font-medium text-error transition-colors disabled:opacity-50"
                >
                  Discard Changes
                </button>
                <button
                  onClick={onCancel}
                  disabled={isSaving}
                  className="w-full bg-bg-card hover:bg-bg-card-hover border border-border-subtle rounded-xl py-3 font-medium text-text-secondary transition-colors disabled:opacity-50"
                >
                  Keep Editing
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook for tracking unsaved changes and handling navigation
 */
interface UseUnsavedChangesOptions {
  hasChanges: boolean;
  onSave?: () => Promise<void>;
}

export function useUnsavedChanges({ hasChanges, onSave }: UseUnsavedChangesOptions) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Browser back/refresh warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const handleNavigate = useCallback((callback: () => void) => {
    if (hasChanges) {
      pendingNavigationRef.current = callback;
      setShowDialog(true);
    } else {
      callback();
    }
  }, [hasChanges]);

  const handleSave = useCallback(async () => {
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave();
        setShowDialog(false);
        pendingNavigationRef.current?.();
        pendingNavigationRef.current = null;
      } catch (error) {
        // Error handled by onSave
      } finally {
        setIsSaving(false);
      }
    }
  }, [onSave]);

  const handleDiscard = useCallback(() => {
    setShowDialog(false);
    pendingNavigationRef.current?.();
    pendingNavigationRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    pendingNavigationRef.current = null;
  }, []);

  return {
    showDialog,
    isSaving,
    handleNavigate,
    handleSave,
    handleDiscard,
    handleCancel,
    UnsavedChangesDialogProps: {
      isOpen: showDialog,
      onSave: handleSave,
      onDiscard: handleDiscard,
      onCancel: handleCancel,
      isSaving,
    },
  };
}
