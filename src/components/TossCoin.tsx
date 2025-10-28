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

  // Play toss sound using audio file
  const playTossSound = () => {
    const audio = new Audio('/coin-flip.mp3');
    audio.volume = 0.5; // Set volume to 50%
    audio.play().catch(err => console.log('Audio play failed:', err));
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

    // Randomly decide result (pre-calculate so animation can land correctly)
    const randomResult = Math.random() > 0.5 ? 'heads' : 'tails';

    // Show result after animation
    setTimeout(() => {
      setResult(randomResult);
      setIsTossing(false);
      playResultSound();
      setTimeout(() => {
        setShowResult(true);
      }, 200);
    }, 2000); // 2 seconds of tossing
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
                            rotateY: 1800, // 5 complete rotations
                            y: [-100, 0], // Simple up and down
                          }
                        : result
                        ? {
                            rotateY: result === 'heads' ? 0 : 180, // Land on correct side
                          }
                        : {}
                    }
                    transition={
                      isTossing
                        ? {
                            rotateY: {
                              duration: 2,
                              ease: "linear", // Constant spin speed
                            },
                            y: {
                              duration: 2,
                              ease: [0.45, 0, 0.55, 1], // Natural bounce (ease-in-out)
                            },
                          }
                        : {
                            duration: 0.4,
                            ease: "easeOut"
                          }
                    }
                    style={{
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Heads side - National Emblem */}
                    <div
                      className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-200 via-gray-300 to-slate-400 shadow-2xl flex items-center justify-center border-[6px] border-slate-300"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)',
                        boxShadow: '0 10px 40px rgba(71, 85, 105, 0.4), inset 0 2px 10px rgba(255, 255, 255, 0.6)',
                      }}
                    >
                      <div className="text-center relative">
                        {/* Outer border circle */}
                        <div className="absolute inset-0 -m-16 rounded-full border-2 border-slate-400/40"></div>

                        {/* National Emblem text */}
                        <div className="relative">
                          <div className="text-sm font-bold text-slate-600 mb-2 tracking-wider">भारत</div>

                          {/* Ashoka Chakra */}
                          <div className="w-16 h-16 mx-auto rounded-full border-3 border-slate-700 flex items-center justify-center bg-slate-300 mb-2">
                            {/* Simplified 8 spokes */}
                            {[...Array(8)].map((_, i) => (
                              <div
                                key={i}
                                className="absolute w-0.5 h-6 bg-slate-700"
                                style={{
                                  transform: `rotate(${i * 45}deg)`,
                                }}
                              />
                            ))}
                            <div className="w-2 h-2 rounded-full bg-slate-700 z-10"></div>
                          </div>

                          <div className="text-[10px] font-bold text-slate-600 tracking-wide">INDIA</div>
                        </div>
                      </div>
                    </div>

                    {/* Tails side - Simple 1 Rupee */}
                    <div
                      className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-200 via-gray-300 to-slate-400 shadow-2xl flex items-center justify-center border-[6px] border-slate-300"
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        boxShadow: '0 10px 40px rgba(71, 85, 105, 0.4), inset 0 2px 10px rgba(255, 255, 255, 0.6)',
                      }}
                    >
                      <div className="text-center relative">
                        {/* Outer border circle */}
                        <div className="absolute inset-0 -m-16 rounded-full border-2 border-slate-400/40"></div>

                        {/* Large 1 */}
                        <div className="text-8xl font-bold text-slate-700 leading-none mb-2" style={{ textShadow: '2px 2px 3px rgba(0, 0, 0, 0.15)' }}>
                          1
                        </div>

                        {/* RUPEE text */}
                        <div className="text-sm font-bold text-slate-600 tracking-widest">RUPEE</div>
                      </div>
                    </div>

                    {/* Coin edge glow */}
                    {isTossing && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        animate={{
                          boxShadow: [
                            '0 0 20px rgba(148, 163, 184, 0.6)',
                            '0 0 40px rgba(148, 163, 184, 0.8)',
                            '0 0 20px rgba(148, 163, 184, 0.6)',
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
                      result === 'heads' ? 'text-slate-700' : 'text-slate-700'
                    }`}>
                      {result === 'heads' ? 'HEADS!' : 'TAILS!'}
                    </div>
                    <p className="text-gray-600">
                      {result === 'heads' ? 'Emblem side wins!' : 'Number side wins!'}
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
                    Toss Coin ₹
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
