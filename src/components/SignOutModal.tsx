import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X } from 'lucide-react';
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[120] backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card className="border-0 shadow-2xl rounded-3xl overflow-hidden bg-white">
                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                      <LogOut className="w-7 h-7 text-red-600" />
                    </div>
                    <button
                      onClick={onClose}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-4 mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">
                      Sign out of TapTurf?
                    </h2>
                    <p className="text-gray-600 leading-relaxed">
                      {userName ? (
                        <>You'll be signed out of <span className="font-semibold text-gray-900">{userName}'s</span> account. You can always sign back in anytime.</>
                      ) : (
                        "You'll be signed out of your account. You can always sign back in anytime."
                      )}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={onClose}
                      variant="outline"
                      className="flex-1 rounded-full py-3 border-2 border-gray-200 hover:border-gray-300 font-semibold"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={onConfirm}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-full py-3 font-semibold shadow-lg hover:shadow-red-200 transition-all duration-200"
                    >
                      Sign Out
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}