// Payment gateway integration for TapTurf
// Supports Razorpay and Stripe

import { authManager } from './api';

export interface PaymentConfig {
  razorpayKey?: string;
  stripePublishableKey?: string;
  currency: 'INR' | 'USD';
  enabledGateways: ('razorpay' | 'stripe')[];
}

export interface PaymentRequest {
  amount: number; // Amount in smallest currency unit (paise for INR, cents for USD)
  currency: string;
  orderId: string;
  description: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  error?: string;
  gateway: 'razorpay' | 'stripe';
  data?: unknown;
}

// Payment configuration
const paymentConfig: PaymentConfig = {
  razorpayKey: import.meta.env.VITE_RAZORPAY_KEY,
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  currency: 'INR',
  enabledGateways: ['razorpay', 'stripe'].filter(gateway => {
    if (gateway === 'razorpay') return !!import.meta.env.VITE_RAZORPAY_KEY;
    if (gateway === 'stripe') return !!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    return false;
  }) as ('razorpay' | 'stripe')[]
};

// Razorpay Integration
class RazorpayPayments {
  private isLoaded = false;

  async loadScript(): Promise<boolean> {
    if (this.isLoaded) return true;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        this.isLoaded = true;
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const loaded = await this.loadScript();
      if (!loaded || !window.Razorpay) {
        throw new Error('Razorpay SDK failed to load');
      }

      const user = authManager.getUser();

      return new Promise((resolve) => {
        const options = {
          key: paymentConfig.razorpayKey,
          amount: request.amount,
          currency: request.currency,
          name: 'TapTurf',
          description: request.description,
          order_id: request.orderId,
          prefill: {
            name: user?.name || '',
            email: user?.email || request.customerEmail || '',
            contact: user?.phone || request.customerPhone || ''
          },
          theme: {
            color: '#3B82F6'
          },
          modal: {
            ondismiss: () => {
              resolve({
                success: false,
                error: 'Payment cancelled by user',
                gateway: 'razorpay'
              });
            }
          },
          handler: (response: unknown) => {
            resolve({
              success: true,
              paymentId: response.razorpay_payment_id,
              gateway: 'razorpay',
              data: response
            });
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (response: unknown) => {
          resolve({
            success: false,
            error: response.error.description || 'Payment failed',
            gateway: 'razorpay',
            data: response.error
          });
        });

        rzp.open();
      });
    } catch (error: unknown) {
      return {
        success: false,
        error: error.message || 'Payment initialization failed',
        gateway: 'razorpay'
      };
    }
  }
}

// Stripe Integration
class StripePayments {
  private stripe: unknown = null;
  private isLoaded = false;

  async loadScript(): Promise<boolean> {
    if (this.isLoaded && this.stripe) return true;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = () => {
        if (window.Stripe && paymentConfig.stripePublishableKey) {
          this.stripe = window.Stripe(paymentConfig.stripePublishableKey);
          this.isLoaded = true;
          resolve(true);
        } else {
          resolve(false);
        }
      };
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const loaded = await this.loadScript();
      if (!loaded || !this.stripe) {
        throw new Error('Stripe SDK failed to load');
      }

      // Create payment intent on backend (this would be an API call)
      const paymentIntent = await this.createPaymentIntent(request);

      const result = await this.stripe.confirmCardPayment(paymentIntent.clientSecret, {
        payment_method: {
          card: {
            // Card details would be collected via Stripe Elements
          }
        }
      });

      if (result.error) {
        return {
          success: false,
          error: result.error.message,
          gateway: 'stripe'
        };
      }

      return {
        success: true,
        paymentId: result.paymentIntent.id,
        gateway: 'stripe',
        data: result.paymentIntent
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error.message || 'Payment failed',
        gateway: 'stripe'
      };
    }
  }

  private async createPaymentIntent(_request: PaymentRequest) {
    // This would be an API call to your backend to create a Stripe PaymentIntent
    // For now, returning a mock response
    return {
      clientSecret: 'mock_client_secret',
      id: 'mock_payment_intent_id'
    };
  }
}

// Payment Manager - Main payment interface
export class PaymentManager {
  private razorpay = new RazorpayPayments();
  private stripe = new StripePayments();

  getAvailableGateways(): ('razorpay' | 'stripe')[] {
    return paymentConfig.enabledGateways;
  }

  getPreferredGateway(): 'razorpay' | 'stripe' | null {
    // Prefer Razorpay for INR, Stripe for other currencies
    if (paymentConfig.currency === 'INR' && paymentConfig.enabledGateways.includes('razorpay')) {
      return 'razorpay';
    }
    if (paymentConfig.enabledGateways.includes('stripe')) {
      return 'stripe';
    }
    return paymentConfig.enabledGateways[0] || null;
  }

  async processPayment(
    request: PaymentRequest,
    gateway?: 'razorpay' | 'stripe'
  ): Promise<PaymentResponse> {
    const selectedGateway = gateway || this.getPreferredGateway();

    if (!selectedGateway) {
      return {
        success: false,
        error: 'No payment gateway available',
        gateway: 'razorpay' // fallback
      };
    }

    try {
      switch (selectedGateway) {
        case 'razorpay':
          return await this.razorpay.processPayment(request);
        case 'stripe':
          return await this.stripe.processPayment(request);
        default:
          return {
            success: false,
            error: 'Unsupported payment gateway',
            gateway: selectedGateway
          };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: error.message || 'Payment processing failed',
        gateway: selectedGateway
      };
    }
  }

  // Utility methods
  formatAmount(amount: number, currency: string = paymentConfig.currency): string {
    const formatters: Record<string, Intl.NumberFormat> = {
      INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
      USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    };

    const formatter = formatters[currency] || formatters.INR;
    return formatter.format(amount / (currency === 'INR' ? 100 : 100)); // Convert from smallest unit
  }

  convertToSmallestUnit(amount: number, currency: string = paymentConfig.currency): number {
    // Convert to paise for INR, cents for USD
    return Math.round(amount * 100);
  }

  isPaymentEnabled(): boolean {
    return paymentConfig.enabledGateways.length > 0;
  }
}

// Global payment manager instance
export const paymentManager = new PaymentManager();

// Type declarations for external libraries
declare global {
  interface Window {
    Razorpay: unknown;
    Stripe: unknown;
  }
}

// Wallet management
export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'failed';
  paymentMethod?: string;
  referenceId?: string;
}

export class WalletManager {
  async getBalance(): Promise<number> {
    // This would fetch from your backend API
    try {
      const response = await fetch('/api/wallet/balance', {
        headers: {
          'Authorization': `Bearer ${authManager.getToken()}`
        }
      });
      const data = await response.json();
      return data.balance || 0;
    } catch {
      return 0;
    }
  }

  async getTransactions(limit: number = 50): Promise<WalletTransaction[]> {
    // This would fetch from your backend API
    try {
      const response = await fetch(`/api/wallet/transactions?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${authManager.getToken()}`
        }
      });
      const data = await response.json();
      return data.transactions || [];
    } catch {
      return [];
    }
  }

  async addMoney(amount: number): Promise<PaymentResponse> {
    const request: PaymentRequest = {
      amount: paymentManager.convertToSmallestUnit(amount),
      currency: paymentConfig.currency,
      orderId: `wallet_${Date.now()}`,
      description: `Add ₹${amount} to wallet`,
      metadata: {
        type: 'wallet_topup'
      }
    };

    return await paymentManager.processPayment(request);
  }
}

export const walletManager = new WalletManager();