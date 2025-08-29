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