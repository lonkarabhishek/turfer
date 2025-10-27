export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  persistent?: boolean;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  context?: 'booking' | 'payment' | 'profile' | 'game' | 'turf' | 'general';
}

export interface ErrorContext {
  action: string;
  userMessage: string;
  technicalMessage?: string;
  suggestions?: string[];
  retryAction?: () => void;
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

  // Contextual error handlers
  bookingError(error: string, context?: Partial<ErrorContext>) {
    const suggestions = context?.suggestions || [
      'Check if the time slot is still available',
      'Try selecting a different time slot',
      'Refresh the page and try again'
    ];

    return this.toast({
      type: 'error',
      title: 'Booking Failed',
      description: context?.userMessage || error,
      context: 'booking',
      persistent: true,
      action: context?.retryAction ? {
        label: 'Retry',
        onClick: context.retryAction
      } : undefined
    });
  }

  paymentError(error: string, context?: Partial<ErrorContext>) {
    return this.toast({
      type: 'error',
      title: 'Payment Failed',
      description: context?.userMessage || 'Payment could not be processed. No amount has been charged.',
      context: 'payment',
      persistent: true,
      action: context?.retryAction ? {
        label: 'Retry Payment',
        onClick: context.retryAction
      } : undefined
    });
  }

  networkError(action?: string, retryAction?: () => void) {
    return this.toast({
      type: 'error',
      title: 'Connection Error',
      description: `Unable to ${action || 'complete request'}. Please check your internet connection.`,
      context: 'general',
      persistent: true,
      action: retryAction ? {
        label: 'Retry',
        onClick: retryAction
      } : undefined
    });
  }

  validationError(field: string, message: string) {
    return this.toast({
      type: 'warning',
      title: `Invalid ${field}`,
      description: message,
      context: 'profile',
      duration: 6000
    });
  }

  successWithAction(title: string, description?: string, actionLabel = 'View', actionFn?: () => void) {
    return this.toast({
      type: 'success',
      title,
      description,
      duration: 8000,
      action: actionFn ? {
        label: actionLabel,
        onClick: actionFn
      } : undefined
    });
  }

  // Enhanced booking-specific notifications
  bookingConfirmed(turfName: string, date: string, time: string, viewBookingFn?: () => void) {
    return this.toast({
      type: 'success',
      title: 'Booking Confirmed! 🎉',
      description: `Your booking at ${turfName} for ${date} at ${time} has been confirmed by the owner.`,
      context: 'booking',
      duration: 10000,
      icon: '✅',
      action: viewBookingFn ? {
        label: 'View Booking',
        onClick: viewBookingFn
      } : undefined
    });
  }

  bookingPending(turfName: string, date: string, time: string) {
    return this.toast({
      type: 'info',
      title: 'Booking Submitted',
      description: `Your booking request for ${turfName} on ${date} at ${time} is pending owner approval.`,
      context: 'booking',
      duration: 8000,
      icon: '⏳'
    });
  }

  bookingRejected(turfName: string, date: string, time: string, reason?: string) {
    return this.toast({
      type: 'warning',
      title: 'Booking Declined',
      description: `Your booking request for ${turfName} on ${date} at ${time} was declined. ${reason ? `Reason: ${reason}` : 'Please try booking a different slot.'}`,
      context: 'booking',
      duration: 10000,
      icon: '❌',
      persistent: true
    });
  }

  paymentSuccess(amount: number, bookingId?: string) {
    return this.toast({
      type: 'success',
      title: 'Payment Successful! 💳',
      description: `₹${amount.toLocaleString()} has been charged. ${bookingId ? `Booking ID: ${bookingId.slice(0, 8)}...` : 'Your booking is being processed.'}`,
      context: 'payment',
      duration: 8000,
      icon: '💳'
    });
  }

  ownerBookingRequest(playerName: string, turfName: string, date: string, time: string, approveFn?: () => void, rejectFn?: () => void) {
    return this.toast({
      type: 'info',
      title: 'New Booking Request 📩',
      description: `${playerName} wants to book ${turfName} on ${date} at ${time}.`,
      context: 'booking',
      persistent: true,
      icon: '📩',
      action: approveFn ? {
        label: 'Review',
        onClick: approveFn
      } : undefined
    });
  }

  reminderUpcomingBooking(turfName: string, date: string, time: string, minutesUntil: number) {
    return this.toast({
      type: 'info',
      title: 'Upcoming Booking Reminder 🔔',
      description: `Your booking at ${turfName} starts in ${minutesUntil} minutes (${time}).`,
      context: 'booking',
      duration: 0, // persistent
      icon: '🔔'
    });
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
    dismissAll: toastManager.dismissAll.bind(toastManager),
    // Enhanced booking notifications
    bookingConfirmed: toastManager.bookingConfirmed.bind(toastManager),
    bookingPending: toastManager.bookingPending.bind(toastManager),
    bookingRejected: toastManager.bookingRejected.bind(toastManager),
    paymentSuccess: toastManager.paymentSuccess.bind(toastManager),
    ownerBookingRequest: toastManager.ownerBookingRequest.bind(toastManager),
    reminderUpcomingBooking: toastManager.reminderUpcomingBooking.bind(toastManager)
  };
}