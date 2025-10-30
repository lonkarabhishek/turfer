import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none disabled:pointer-events-none disabled:opacity-50 touch-manipulation';

  const variants: Record<ButtonVariant, string> = {
    default: 'neuro-button text-white',
    outline: 'neuro-button text-gray-700',
    ghost: 'neuro-button-pressed text-gray-700',
    destructive: 'neuro-button text-gray-700',
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'h-10 px-3 text-sm min-w-[44px] sm:h-8 sm:px-2 sm:text-xs', // 44px minimum touch target
    md: 'h-12 px-6 text-base min-w-[48px] sm:h-10 sm:px-4 sm:text-sm', // 48px comfortable touch target
    lg: 'h-14 px-8 text-lg min-w-[56px] sm:h-12 sm:px-6 sm:text-base', // 56px large touch target
  };

  // Apply specific styles for different variants
  const getVariantStyle = () => {
    if (variant === 'default') {
      return {
        background: 'radial-gradient(circle at 30% 30%, rgba(76, 175, 80, 0.8), rgba(56, 142, 60, 1))'
      };
    }
    return {};
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={getVariantStyle()}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
}