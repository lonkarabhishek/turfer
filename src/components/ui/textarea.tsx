import * as React from 'react';

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="w-full px-3 py-2 rounded-md border focus:ring-2 focus:ring-emerald-600 outline-none" {...props} />;
}
