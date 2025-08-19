import { type ReactNode, type HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
  className?: string;
}

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

export function Card({ className = '', children, ...props }: CardProps) {
  return <div className={`bg-white border rounded-xl shadow-sm ${className}`} {...props}>{children}</div>;
}

export function CardHeader({ className = '', children, ...props }: CardHeaderProps) {
  return <div className={`px-4 pt-4 ${className}`} {...props}>{children}</div>;
}

export function CardTitle({ className = '', children, ...props }: CardTitleProps) {
  return <h3 className={`text-lg font-semibold ${className}`} {...props}>{children}</h3>;
}

export function CardContent({ className = '', children, ...props }: CardContentProps) {
  return <div className={`px-4 pb-4 ${className}`} {...props}>{children}</div>;
}