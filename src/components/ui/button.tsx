import * as React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
};

export function Button({ variant='default', size='md', className='', ...props }: Props) {
  const base = 'inline-flex items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-emerald-600';
  const variants = {
    default: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    outline: 'border border-gray-300 hover:bg-gray-50 text-gray-800',
    ghost: 'hover:bg-gray-100 text-gray-700',
  }[variant];
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-sm' }[size];
  return <button className={`${base} ${variants} ${sizes} ${className}`} {...props} />;
}
