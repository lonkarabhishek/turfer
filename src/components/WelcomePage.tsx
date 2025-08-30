import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Trophy, Users, MapPin, Zap, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';

interface WelcomePageProps {
  onComplete: () => void;
  userName?: string;
}

export function WelcomePage({ onComplete, userName }: WelcomePageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const steps = [
    {
      icon: Trophy,
      title: "Welcome to TapTurf!",
      description: `Hi ${userName || 'there'}! Your account has been verified successfully.`,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100"
    },
    {
      icon: Users,
      title: "Find Your Team",
      description: "Connect with players, create games, and build your sports community.",
      color: "text-blue-600", 
      bgColor: "bg-blue-100"
    },
    {
      icon: MapPin,
      title: "Discover Venues",
      description: "Explore the best turfs and sports facilities in your city.",
      color: "text-purple-600",
      bgColor: "bg-purple-100"
    },
    {
      icon: Zap,
      title: "Play in Seconds",
      description: "Book venues, create games, and start playing instantly!",
      color: "text-orange-600",
      bgColor: "bg-orange-100"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [currentStep, steps.length]);

  const handleGetStarted = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl shadow-2xl p-8 text-center"
        >
          {/* Logo */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full mx-auto flex items-center justify-center mb-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Trophy className="w-10 h-10 text-white" />
              </motion.div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">TapTurf</h1>
          </motion.div>

          {/* Step Content */}
          <motion.div
            key={currentStep}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            {(() => {
              const IconComponent = steps[currentStep].icon;
              return (
                <>
                  <div className={`w-16 h-16 ${steps[currentStep].bgColor} rounded-full mx-auto flex items-center justify-center mb-4`}>
                    <IconComponent className={`w-8 h-8 ${steps[currentStep].color}`} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {steps[currentStep].title}
                  </h2>
                  <p className="text-gray-600 leading-relaxed">
                    {steps[currentStep].description}
                  </p>
                </>
              );
            })()}
          </motion.div>

          {/* Progress Dots */}
          <div className="flex justify-center space-x-2 mb-8">
            {steps.map((_, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index <= currentStep
                    ? 'bg-emerald-500'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Action Button */}
          {isComplete ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={handleGetStarted}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white py-3 rounded-full text-lg font-semibold shadow-lg hover:shadow-emerald-200 transition-all duration-300"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-sm text-gray-500 mt-4">
                Ready to find your next game?
              </p>
            </motion.div>
          ) : (
            <div className="h-16 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"
              />
            </div>
          )}

          {/* Skip Button */}
          {!isComplete && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              onClick={handleGetStarted}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors mt-4"
            >
              Skip intro
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}