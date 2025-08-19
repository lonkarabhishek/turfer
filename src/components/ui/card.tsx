import * as React from 'react';

export function Card({ className='', ...props }: any) {
  return <div className={`bg-white border rounded-xl ${className}`} {...props} />;
}
export function CardHeader({ className='', ...props }: any) {
  return <div className={`px-4 pt-4 ${className}`} {...props} />;
}
export function CardTitle({ className='', ...props }: any) {
  return <h3 className={`text-lg font-semibold ${className}`} {...props} />;
}
export function CardContent({ className='', ...props }: any) {
  return <div className={`px-4 pb-4 ${className}`} {...props} />;
}
