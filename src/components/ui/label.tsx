import * as React from 'react';

export function Label({ className='', ...props }: any) {
  return <label className={`block text-sm font-medium mb-1 ${className}`} {...props} />;
}
