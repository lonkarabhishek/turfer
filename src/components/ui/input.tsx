import * as React from 'react';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="w-full h-10 px-3 rounded-md border focus:ring-2 focus:ring-emerald-600 outline-none" {...props} />;
}
