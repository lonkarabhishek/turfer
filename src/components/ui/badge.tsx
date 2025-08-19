import * as React from 'react';

export function Badge({ children, variant='secondary', className='' }: any) {
  const styles = {
    secondary: 'bg-gray-100 text-gray-800',
    outline: 'border border-gray-300 text-gray-700',
  }[variant] || '';
  return <span className={`inline-flex items-center px-2.5 h-7 rounded-full text-xs ${styles} ${className}`}>{children}</span>;
}
