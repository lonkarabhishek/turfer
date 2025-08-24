import { useState } from 'react';
import { Copy, MessageCircle, Phone, Check } from 'lucide-react';
import { Modal } from './ui/modal';
import { Button } from './ui/button';

interface WhatsAppFallbackProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
  message: string;
  context?: string;
}

export function WhatsAppFallback({ isOpen, onClose, phone, message, context }: WhatsAppFallbackProps) {
  const [copied, setCopied] = useState<'phone' | 'message' | null>(null);

  const copyToClipboard = async (text: string, type: 'phone' | 'message') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const formatPhoneForDisplay = (phone: string) => {
    // Format Indian phone numbers for better readability
    if (phone.startsWith('+91')) {
      const digits = phone.substring(3);
      return `+91 ${digits.substring(0, 5)}-${digits.substring(5)}`;
    }
    if (phone.length === 10) {
      return `${phone.substring(0, 5)}-${phone.substring(5)}`;
    }
    return phone;
  };

  const tryWhatsApp = () => {
    const whatsappUrl = `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(message)}`;
    const whatsappMobile = `whatsapp://send?phone=${phone.replace(/[^\d]/g, '')}&text=${encodeURIComponent(message)}`;
    
    // Try to open WhatsApp app first (mobile), then web version
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Try mobile app first
      window.location.href = whatsappMobile;
      // Fallback to web version after a delay
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, 500);
    } else {
      // Desktop: try web WhatsApp
      window.open(whatsappUrl, '_blank');
    }
    
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Options"
      size="md"
    >
      <div className="space-y-6">
        {/* WhatsApp Option */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">Try WhatsApp</h4>
              <p className="text-sm text-gray-600 mb-3">
                Send your booking request directly through WhatsApp
              </p>
              <Button 
                onClick={tryWhatsApp}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Open WhatsApp
              </Button>
            </div>
          </div>
        </div>

        {/* Phone Option */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">Call Direct</h4>
              <p className="text-sm text-gray-600 mb-3">
                Speak directly with the turf owner
              </p>
              <div className="flex items-center gap-2">
                <div className="bg-white px-3 py-2 rounded-md border flex-1 font-mono text-sm">
                  {formatPhoneForDisplay(phone)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(phone, 'phone')}
                >
                  {copied === 'phone' ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <a href={`tel:${phone}`} className="contents">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    Call Now
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Message Copy */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-500 rounded-lg flex items-center justify-center">
              <Copy className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">Copy Message</h4>
              <p className="text-sm text-gray-600 mb-3">
                Copy the pre-written message and paste it manually
              </p>
              <div className="bg-white p-3 rounded-md border mb-3 text-sm max-h-32 overflow-y-auto">
                <div className="whitespace-pre-wrap font-mono text-xs">
                  {message}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => copyToClipboard(message, 'message')}
                className="w-full"
              >
                {copied === 'message' ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Message
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-gray-500">
          Having trouble? Try calling directly or copying the message to send manually.
        </div>
      </div>
    </Modal>
  );
}