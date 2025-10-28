import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as XIcon, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';

interface TossCoinProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TossCoin({ isOpen, onClose }: TossCoinProps) {
  const [isTossing, setIsTossing] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Play toss sound using Web Audio API
  const playTossSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  // Play result sound
  const playResultSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 600;
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const handleToss = () => {
    setIsTossing(true);
    setShowResult(false);
    setResult(null);
    playTossSound();

    // Randomly decide result
    const randomResult = Math.random() > 0.5 ? 'heads' : 'tails';

    // Show result after animation
    setTimeout(() => {
      setResult(randomResult);
      setIsTossing(false);
      playResultSound();
      setTimeout(() => {
        setShowResult(true);
      }, 500);
    }, 3000); // 3 seconds of tossing
  };

  const handleTossAgain = () => {
    setResult(null);
    setShowResult(false);
    handleToss();
  };

  const handleClose = () => {
    setResult(null);
    setShowResult(false);
    setIsTossing(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Content */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="relative z-10 w-full max-w-md mx-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl p-8 relative">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <XIcon className="w-5 h-5 text-gray-600" />
              </button>

              {/* Header */}
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Toss the Coin</h2>
                <p className="text-gray-600">Let fate decide!</p>
              </div>

              {/* Coin Container */}
              <div className="flex items-center justify-center mb-8 h-64">
                <div className="relative">
                  {/* Coin */}
                  <motion.div
                    className="relative w-48 h-48"
                    animate={
                      isTossing
                        ? {
                            rotateY: [0, 1800], // Multiple flips
                            y: [-50, -100, -50, -100, -50, 0],
                          }
                        : result
                        ? {
                            rotateY: result === 'heads' ? 0 : 180,
                          }
                        : {}
                    }
                    transition={
                      isTossing
                        ? {
                            duration: 3,
                            ease: 'easeInOut',
                            times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                          }
                        : { duration: 0.6, ease: 'easeOut' }
                    }
                    style={{
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Heads side */}
                    <div
                      className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 shadow-2xl flex items-center justify-center border-8 border-yellow-300"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)',
                      }}
                    >
                      <div className="text-center">
                        <div className="text-6xl font-bold text-white mb-2">H</div>
                        <div className="text-sm font-semibold text-yellow-100">HEADS</div>
                      </div>
                    </div>

                    {/* Tails side */}
                    <div
                      className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600 shadow-2xl flex items-center justify-center border-8 border-gray-300"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                      }}
                    >
                      <div className="text-center">
                        <div className="text-6xl font-bold text-white mb-2">T</div>
                        <div className="text-sm font-semibold text-gray-100">TAILS</div>
                      </div>
                    </div>

                    {/* Coin edge glow */}
                    {isTossing && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        animate={{
                          boxShadow: [
                            '0 0 20px rgba(234, 179, 8, 0.6)',
                            '0 0 40px rgba(234, 179, 8, 0.8)',
                            '0 0 20px rgba(234, 179, 8, 0.6)',
                          ],
                        }}
                        transition={{
                          duration: 0.5,
                          repeat: Infinity,
                        }}
                      />
                    )}
                  </motion.div>
                </div>
              </div>

              {/* Result announcement */}
              <AnimatePresence>
                {showResult && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center mb-6"
                  >
                    <div className={`text-4xl font-bold mb-2 ${
                      result === 'heads' ? 'text-yellow-600' : 'text-gray-600'
                    }`}>
                      {result === 'heads' ? '👑 HEADS!' : '🎯 TAILS!'}
                    </div>
                    <p className="text-gray-600">
                      {result === 'heads' ? 'Heads wins the toss!' : 'Tails wins the toss!'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div className="flex gap-3">
                {!isTossing && !result && (
                  <Button
                    onClick={handleToss}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-semibold py-6 text-lg rounded-2xl shadow-lg"
                  >
                    Toss Coin 🪙
                  </Button>
                )}

                {!isTossing && result && (
                  <>
                    <Button
                      onClick={handleTossAgain}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-6 rounded-2xl shadow-lg"
                    >
                      <RotateCcw className="w-5 h-5 mr-2" />
                      Toss Again
                    </Button>
                    <Button
                      onClick={handleClose}
                      variant="outline"
                      className="flex-1 border-2 border-gray-300 hover:bg-gray-50 font-semibold py-6 rounded-2xl"
                    >
                      Close
                    </Button>
                  </>
                )}

                {isTossing && (
                  <div className="flex-1 text-center py-6">
                    <div className="text-gray-600 font-medium animate-pulse">
                      Tossing...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
