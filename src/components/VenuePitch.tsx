import { motion } from 'framer-motion';
import { MessageCircle, TrendingUp, Users, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { buildWhatsAppLink, generateVenueInquiryMessage } from '../lib/whatsapp';
import { track } from '../lib/analytics';

interface VenuePitchProps {
  turfName?: string;
  onClose?: () => void;
}

export function VenuePitch({ turfName = "your venue", onClose }: VenuePitchProps) {
  const handleWhatsAppClick = () => {
    const message = generateVenueInquiryMessage({ venueName: turfName });
    const whatsappUrl = buildWhatsAppLink({
      phone: "9876543200", // Replace with actual business number
      text: message
    });

    track('whatsapp_cta_clicked', { 
      action: 'venue_inquiry', 
      venue_name: turfName 
    });

    window.open(whatsappUrl, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200 overflow-hidden">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-primary-600 text-white">
                  For Venues
                </Badge>
                <Badge variant="outline" className="text-primary-700 border-primary-300">
                  Partnership
                </Badge>
              </div>
              <h3 className="text-xl font-semibold text-primary-900">
                We fill your off-peak slots
              </h3>
              <p className="text-sm text-primary-700 mt-1">
                Community &gt; listing. Join 50+ venues already partnered with Turfer.
              </p>
            </div>
            {onClose && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onClose}
                className="text-primary-600 hover:text-primary-700"
              >
                ✕
              </Button>
            )}
          </div>

          {/* Benefits */}
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-medium text-primary-900 text-sm">Fill Empty Slots</div>
                <div className="text-xs text-primary-700">Community players book your off-peak hours</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-medium text-primary-900 text-sm">Build Community</div>
                <div className="text-xs text-primary-700">Regular players who become loyal customers</div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-medium text-primary-900 text-sm">Smart Matching</div>
                <div className="text-xs text-primary-700">AI connects players to your available slots</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white/60 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-primary-900">+40%</div>
                <div className="text-xs text-primary-700">Avg. booking increase</div>
              </div>
              <div>
                <div className="text-lg font-bold text-primary-900">50+</div>
                <div className="text-xs text-primary-700">Partner venues</div>
              </div>
              <div>
                <div className="text-lg font-bold text-primary-900">₹0</div>
                <div className="text-xs text-primary-700">Setup cost</div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleWhatsAppClick}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Partner with us
            </Button>
            <div className="text-xs text-primary-600">
              5-min setup
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Compact version for display within turf details
export function VenuePitchRibbon({ turfName }: { turfName: string }) {
  const handleClick = () => {
    const message = generateVenueInquiryMessage({ venueName: turfName });
    const whatsappUrl = buildWhatsAppLink({
      phone: "9876543200", // Replace with actual business number
      text: message
    });

    track('whatsapp_cta_clicked', { 
      action: 'venue_inquiry_ribbon', 
      venue_name: turfName 
    });

    window.open(whatsappUrl, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div 
        onClick={handleClick}
        className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-3 rounded-lg cursor-pointer hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">We fill your off-peak slots</div>
            <div className="text-xs text-primary-100">Community &gt; listing • Free to join</div>
          </div>
          <div className="flex items-center text-xs font-medium bg-white/20 px-2 py-1 rounded-full">
            Partner <MessageCircle className="w-3 h-3 ml-1" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}