import { type ReactNode } from 'react';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';

interface BadgeProps {
  children?: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  onClick?: () => void;
}

export function Badge({ children, variant = 'secondary', className = '', onClick }: BadgeProps) {
  const styles: Record<BadgeVariant, string> = {
    default: 'bg-primary-600 text-white',
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-300 text-gray-700 bg-transparent',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    destructive: 'bg-red-100 text-red-800',
  };
  
  const Component = onClick ? 'button' : 'span';
  
  return (
    <Component 
      className={`inline-flex items-center px-2.5 h-7 rounded-full text-xs font-medium transition-colors ${onClick ? 'cursor-pointer hover:opacity-80' : ''} ${styles[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </Component>
  );
}