import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ChipProps {
  children: ReactNode;
  onRemove?: () => void;
  variant?: 'default' | 'primary' | 'secondary';
  size?: 'sm' | 'md';
}

export function Chip({ children, onRemove, variant = 'default', size = 'md' }: ChipProps) {
  const baseClasses = 'inline-flex items-center gap-1 rounded-full font-medium transition-colors';
  
  const variants = {
    default: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    primary: 'bg-primary-100 text-primary-800 hover:bg-primary-200',
    secondary: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  };

  return (
    <span className={`${baseClasses} ${variants[variant]} ${sizes[size]}`}>
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:bg-black hover:bg-opacity-20 rounded-full p-0.5 transition-colors"
          aria-label="Remove filter"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}