/**
 * Mobile-first utilities for responsive design and touch-friendly UI
 */

// Standard touch target sizes (iOS HIG and Material Design)
export const TOUCH_TARGETS = {
  minimum: '44px', // iOS minimum
  comfortable: '48px', // Material Design
  large: '56px', // For primary actions
  extraLarge: '64px' // For critical actions
};

// Mobile breakpoints
export const BREAKPOINTS = {
  xs: '320px', // Small phones
  sm: '375px', // Standard phones
  md: '768px', // Tablets
  lg: '1024px', // Small laptops
  xl: '1280px', // Desktop
  '2xl': '1536px' // Large desktop
};

// Mobile-first spacing system
export const MOBILE_SPACING = {
  xs: '0.25rem', // 4px
  sm: '0.5rem',  // 8px
  md: '1rem',    // 16px
  lg: '1.5rem',  // 24px
  xl: '2rem',    // 32px
  '2xl': '3rem', // 48px
  '3xl': '4rem'  // 64px
};

/**
 * Mobile navigation utilities
 */
export const MOBILE_NAV = {
  height: '60px',
  safeAreaInsetTop: 'env(safe-area-inset-top)',
  safeAreaInsetBottom: 'env(safe-area-inset-bottom)',
  tabBarHeight: '80px'
};

/**
 * Responsive classes for common components
 */
export const RESPONSIVE_CLASSES = {
  // Button sizes
  button: {
    primary: 'h-12 px-6 text-base font-medium rounded-xl sm:h-10 sm:px-4 sm:text-sm',
    secondary: 'h-10 px-4 text-sm font-medium rounded-lg sm:h-8 sm:px-3 sm:text-xs',
    icon: 'w-12 h-12 p-3 rounded-xl sm:w-10 sm:h-10 sm:p-2',
  },

  // Card layouts
  card: {
    base: 'p-4 rounded-2xl shadow-sm sm:p-6 sm:rounded-xl',
    compact: 'p-3 rounded-xl shadow-sm sm:p-4 sm:rounded-lg',
    list: 'p-4 rounded-xl shadow-sm border sm:p-3'
  },

  // Grid layouts
  grid: {
    autoFit: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    twoColumns: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
    threeColumns: 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
  },

  // Input fields
  input: {
    base: 'h-12 px-4 text-base rounded-xl border-2 sm:h-10 sm:px-3 sm:text-sm sm:rounded-lg',
    search: 'h-12 pl-12 pr-4 text-base rounded-xl border-2 sm:h-10 sm:pl-10 sm:pr-3 sm:text-sm'
  },

  // Modal and overlay
  modal: {
    overlay: 'fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4',
    content: 'w-full max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-md sm:max-h-[85vh]'
  }
};

/**
 * Touch gesture utilities
 */
export const TOUCH_CONFIG = {
  // Swipe thresholds
  swipeThreshold: 50,
  velocityThreshold: 0.3,

  // Touch delay for preventing accidental taps
  touchDelay: 100,

  // Scroll behavior
  scrollBehavior: 'smooth' as ScrollBehavior
};

/**
 * Mobile-specific CSS classes
 */
export const MOBILE_STYLES = {
  // Hide scrollbars on mobile
  hideScrollbar: 'scrollbar-hide -webkit-overflow-scrolling-touch',

  // Touch-friendly interactions
  touchFriendly: 'touch-manipulation select-none',

  // Safe area handling
  safeArea: {
    paddingTop: 'pt-safe-top',
    paddingBottom: 'pb-safe-bottom',
    marginTop: 'mt-safe-top',
    marginBottom: 'mb-safe-bottom'
  },

  // Mobile-optimized animations
  animations: {
    slideUp: 'animate-slide-up',
    slideDown: 'animate-slide-down',
    fadeIn: 'animate-fade-in',
    bounce: 'animate-bounce-gentle'
  }
};

/**
 * Utility functions
 */
export const isMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

export const isTablet = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 768 && window.innerWidth < 1024;
};

export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

/**
 * Generate responsive image sizes
 */
export const generateResponsiveImageSizes = (baseWidth: number) => {
  return {
    mobile: Math.round(baseWidth * 0.5),
    tablet: Math.round(baseWidth * 0.7),
    desktop: baseWidth,
    sizes: `(max-width: 768px) ${Math.round(baseWidth * 0.5)}px, (max-width: 1024px) ${Math.round(baseWidth * 0.7)}px, ${baseWidth}px`
  };
};

/**
 * Mobile navigation helper
 */
export const getViewportHeight = (): string => {
  if (typeof window === 'undefined') return '100vh';

  // Use window height on mobile to account for address bar
  if (isMobile()) {
    return `${window.innerHeight}px`;
  }

  return '100vh';
};

/**
 * Focus management for mobile
 */
export const scrollToElement = (
  element: HTMLElement,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' }
) => {
  if (isMobile()) {
    // Add small delay for mobile keyboards
    setTimeout(() => {
      element.scrollIntoView(options);
    }, 300);
  } else {
    element.scrollIntoView(options);
  }
};

/**
 * Mobile-optimized click handler
 */
export const createMobileClickHandler = (
  onClick: () => void,
  options: { preventDoubleClick?: boolean; delay?: number } = {}
) => {
  let isProcessing = false;
  const { preventDoubleClick = true, delay = 100 } = options;

  return () => {
    if (preventDoubleClick && isProcessing) return;

    isProcessing = true;

    setTimeout(() => {
      onClick();
      isProcessing = false;
    }, delay);
  };
};