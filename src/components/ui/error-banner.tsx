import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: 'error' | 'warning';
}

export function ErrorBanner({ 
  message, 
  onRetry, 
  onDismiss, 
  variant = 'error' 
}: ErrorBannerProps) {
  const isError = variant === 'error';

  return (
    <div className={`
      rounded-lg border p-4 
      ${isError 
        ? 'bg-red-50 border-red-200 text-red-800' 
        : 'bg-amber-50 border-amber-200 text-amber-800'
      }
    `}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`
          w-5 h-5 mt-0.5 flex-shrink-0
          ${isError ? 'text-red-600' : 'text-amber-600'}
        `} />
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {isError ? 'Error' : 'Warning'}
          </p>
          <p className="text-sm mt-1">
            {message}
          </p>
          
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className={
                  isError 
                    ? 'border-red-300 text-red-700 hover:bg-red-100' 
                    : 'border-amber-300 text-amber-700 hover:bg-amber-100'
                }
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}
        </div>
        
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className={`
              -mr-2 -mt-2 hover:bg-transparent
              ${isError ? 'text-red-600 hover:text-red-800' : 'text-amber-600 hover:text-amber-800'}
            `}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}