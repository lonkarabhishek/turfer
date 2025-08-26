import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps extends Toast {
  onClose: (id: string) => void;
}

// Toast manager for global state
class ToastManager {
  private toasts: Toast[] = [];
  private listeners: Set<(toasts: Toast[]) => void> = new Set();

  subscribe(listener: (toasts: Toast[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.toasts));
  }

  toast(toast: Omit<Toast, 'id'>) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { 
      ...toast, 
      id,
      duration: toast.duration ?? (toast.type === 'error' ? 0 : 5000)
    };
    
    this.toasts.push(newToast);
    this.notify();

    // Auto remove after duration (if not 0)
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, newToast.duration);
    }

    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notify();
  }

  dismissAll() {
    this.toasts = [];
    this.notify();
  }

  success(title: string, description?: string, options?: Partial<Toast>) {
    return this.toast({ type: 'success', title, description, ...options });
  }

  error(title: string, description?: string, options?: Partial<Toast>) {
    return this.toast({ type: 'error', title, description, ...options });
  }

  warning(title: string, description?: string, options?: Partial<Toast>) {
    return this.toast({ type: 'warning', title, description, ...options });
  }

  info(title: string, description?: string, options?: Partial<Toast>) {
    return this.toast({ type: 'info', title, description, ...options });
  }
}

export const toastManager = new ToastManager();

// Individual toast component
function ToastItem({ id, type, title, description, action, onClose }: ToastProps) {
  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info
  };

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconStyles = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600'
  };

  const Icon = icons[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.3 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border shadow-lg ${styles[type]}`}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon className={`h-5 w-5 ${iconStyles[type]}`} />
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            {description && (
              <p className="mt-1 text-sm opacity-90">{description}</p>
            )}
            {action && (
              <div className="mt-3">
                <button
                  type="button"
                  className="rounded-md bg-white px-2 py-1.5 text-xs font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="rounded-md inline-flex opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
              onClick={() => onClose(id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Toast container component
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setToasts);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-50 flex items-end px-4 py-6 sm:items-start sm:p-6"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              {...toast}
              onClose={toastManager.dismiss.bind(toastManager)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Hook for using toast in components
export function useToast() {
  return {
    toast: toastManager.toast.bind(toastManager),
    success: toastManager.success.bind(toastManager),
    error: toastManager.error.bind(toastManager),
    warning: toastManager.warning.bind(toastManager),
    info: toastManager.info.bind(toastManager),
    dismiss: toastManager.dismiss.bind(toastManager),
    dismissAll: toastManager.dismissAll.bind(toastManager)
  };
}