import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface SignOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userName?: string;
}

export function SignOutModal({ isOpen, onClose, onConfirm, userName }: SignOutModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Enhanced Backdrop with better blur - Higher z-index to cover everything */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70 z-[9998] backdrop-blur-lg"
            style={{ 
              backdropFilter: 'blur(16px) saturate(180%)',
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9998
            }}
          />

          {/* Modal Container - Absolutely Centered */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
               style={{ 
                 position: 'fixed',
                 top: 0,
                 left: 0,
                 right: 0,
                 bottom: 0,
                 width: '100vw',
                 height: '100vh',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 zIndex: 9999
               }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 30, rotate: 2 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.16, 1, 0.3, 1],
                type: "spring",
                stiffness: 200,
                damping: 20
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md relative"
            >
              {/* Glowing background effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-red-500/20 via-pink-500/20 to-orange-500/20 rounded-[2rem] blur-xl opacity-60" />
              
              <Card className="relative border-0 shadow-2xl rounded-3xl overflow-hidden bg-white/95 backdrop-blur-xl">
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/95 to-white/90" />
                
                <div className="relative p-8">
                  {/* Header with enhanced styling */}
                  <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-4">
                      {/* Enhanced icon with gradient background */}
                      <div className="relative">
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                          className="w-16 h-16 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/25"
                        >
                          <LogOut className="w-8 h-8 text-white" />
                        </motion.div>
                        {/* Subtle sparkle effect */}
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                          className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-sm"
                        >
                          <Sparkles className="w-3 h-3 text-white" />
                        </motion.div>
                      </div>
                      
                      {/* Title with better typography */}
                      <div>
                        <motion.h2 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3, duration: 0.4 }}
                          className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                        >
                          Sign out?
                        </motion.h2>
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4, duration: 0.4 }}
                          className="text-sm text-gray-500 font-medium mt-1"
                        >
                          TapTurf Account
                        </motion.div>
                      </div>
                    </div>
                    
                    {/* Enhanced close button */}
                    <motion.button
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3, duration: 0.3 }}
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={onClose}
                      className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all duration-200 hover:shadow-md group"
                    >
                      <X className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
                    </motion.button>
                  </div>

                  {/* Content with improved styling */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.4 }}
                    className="space-y-4 mb-8"
                  >
                    <p className="text-gray-700 leading-relaxed text-base font-medium">
                      {userName ? (
                        <>
                          Are you sure you want to sign out of{' '}
                          <span className="font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-lg">
                            {userName}'s
                          </span>{' '}
                          account?
                        </>
                      ) : (
                        "Are you sure you want to sign out of your account?"
                      )}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 text-sm text-gray-600 bg-emerald-50 rounded-lg p-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1 flex-shrink-0" />
                        <span>All your data, games, and bookings will be saved securely</span>
                      </div>
                      <div className="flex items-start gap-3 text-sm text-gray-600 bg-blue-50 rounded-lg p-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />
                        <span>You can sign back in anytime to continue where you left off</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Enhanced button group */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                    className="flex gap-4"
                  >
                    <Button
                      onClick={onClose}
                      variant="outline"
                      className="flex-1 rounded-2xl py-4 border-2 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 font-semibold text-gray-700 hover:text-emerald-700 transition-all duration-200 hover:scale-105 hover:shadow-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={onConfirm}
                      className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white rounded-2xl py-4 font-semibold shadow-lg hover:shadow-xl hover:shadow-red-500/25 transition-all duration-200 transform hover:scale-105"
                    >
                      Sign Out
                    </Button>
                  </motion.div>
                </div>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}