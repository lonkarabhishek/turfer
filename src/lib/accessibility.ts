/**
 * Accessibility utilities and ARIA helpers for inclusive design
 */

// WCAG AA contrast ratios
export const CONTRAST_RATIOS = {
  normal: 4.5,
  large: 3.0,
  nonText: 3.0
};

// Standard ARIA roles and states
export const ARIA_ROLES = {
  button: 'button',
  link: 'link',
  heading: 'heading',
  list: 'list',
  listitem: 'listitem',
  navigation: 'navigation',
  main: 'main',
  complementary: 'complementary',
  banner: 'banner',
  contentinfo: 'contentinfo',
  search: 'search',
  form: 'form',
  dialog: 'dialog',
  tablist: 'tablist',
  tab: 'tab',
  tabpanel: 'tabpanel',
  alert: 'alert',
  alertdialog: 'alertdialog',
  status: 'status',
  progressbar: 'progressbar'
};

// Live region politeness levels
export const ARIA_LIVE = {
  off: 'off',
  polite: 'polite',
  assertive: 'assertive'
};

/**
 * Generate accessible button props
 */
export const createAccessibleButton = (options: {
  label: string;
  description?: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
}) => {
  const { label, description, pressed, expanded, controls, disabled } = options;

  return {
    'aria-label': label,
    'aria-describedby': description ? `desc-${Math.random().toString(36).slice(2)}` : undefined,
    'aria-pressed': pressed !== undefined ? pressed : undefined,
    'aria-expanded': expanded !== undefined ? expanded : undefined,
    'aria-controls': controls,
    'aria-disabled': disabled,
    role: 'button',
    tabIndex: disabled ? -1 : 0
  };
};

/**
 * Generate accessible form field props
 */
export const createAccessibleFormField = (options: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  invalid?: boolean;
}) => {
  const { id, label, description, error, required, invalid } = options;
  const describedBy = [];

  if (description) describedBy.push(`${id}-desc`);
  if (error) describedBy.push(`${id}-error`);

  return {
    field: {
      id,
      'aria-labelledby': `${id}-label`,
      'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
      'aria-required': required,
      'aria-invalid': invalid
    },
    label: {
      id: `${id}-label`,
      htmlFor: id
    },
    description: description ? {
      id: `${id}-desc`,
      'aria-live': 'polite' as const
    } : null,
    error: error ? {
      id: `${id}-error`,
      'aria-live': 'assertive' as const,
      role: 'alert'
    } : null
  };
};

/**
 * Generate accessible modal/dialog props
 */
export const createAccessibleModal = (options: {
  id: string;
  title: string;
  description?: string;
  closeLabel?: string;
}) => {
  const { id, title, description, closeLabel = 'Close dialog' } = options;

  return {
    overlay: {
      'aria-hidden': true,
      onClick: (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
          // Handle backdrop click
        }
      }
    },
    dialog: {
      id,
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': `${id}-title`,
      'aria-describedby': description ? `${id}-desc` : undefined,
      tabIndex: -1
    },
    title: {
      id: `${id}-title`
    },
    description: description ? {
      id: `${id}-desc`
    } : null,
    closeButton: {
      'aria-label': closeLabel,
      onClick: () => {
        // Handle close
      }
    }
  };
};

/**
 * Generate accessible tabs props
 */
export const createAccessibleTabs = (options: {
  id: string;
  tabs: Array<{ id: string; label: string; panelId: string }>;
  activeTab: string;
}) => {
  const { id, tabs, activeTab } = options;

  return {
    tablist: {
      role: 'tablist',
      'aria-label': 'Navigation tabs'
    },
    tabs: tabs.map(tab => ({
      id: tab.id,
      role: 'tab',
      'aria-selected': tab.id === activeTab,
      'aria-controls': tab.panelId,
      tabIndex: tab.id === activeTab ? 0 : -1
    })),
    panels: tabs.map(tab => ({
      id: tab.panelId,
      role: 'tabpanel',
      'aria-labelledby': tab.id,
      tabIndex: 0,
      hidden: tab.id !== activeTab
    }))
  };
};

/**
 * Keyboard navigation utilities
 */
export const KEYBOARD_KEYS = {
  Enter: 'Enter',
  Space: ' ',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Escape: 'Escape',
  Tab: 'Tab'
};

/**
 * Create keyboard event handler
 */
export const createKeyboardHandler = (handlers: Record<string, (e: KeyboardEvent) => void>) => {
  return (e: KeyboardEvent) => {
    const handler = handlers[e.key];
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  };
};

/**
 * Focus management utilities
 */
export class FocusManager {
  private focusableElements: HTMLElement[] = [];
  private container: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.updateFocusableElements();
  }

  private updateFocusableElements() {
    if (!this.container) return;

    const selector = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    this.focusableElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(selector)
    ).filter(el => !el.disabled && !el.hidden);
  }

  focusFirst() {
    this.focusableElements[0]?.focus();
  }

  focusLast() {
    this.focusableElements[this.focusableElements.length - 1]?.focus();
  }

  focusNext(currentElement: HTMLElement) {
    const currentIndex = this.focusableElements.indexOf(currentElement);
    const nextIndex = (currentIndex + 1) % this.focusableElements.length;
    this.focusableElements[nextIndex]?.focus();
  }

  focusPrevious(currentElement: HTMLElement) {
    const currentIndex = this.focusableElements.indexOf(currentElement);
    const prevIndex = currentIndex === 0 ? this.focusableElements.length - 1 : currentIndex - 1;
    this.focusableElements[prevIndex]?.focus();
  }

  trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    this.updateFocusableElements();

    if (this.focusableElements.length === 0) return;

    const firstElement = this.focusableElements[0];
    const lastElement = this.focusableElements[this.focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }
}

/**
 * Screen reader utilities
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', priority);
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;

  document.body.appendChild(announcer);

  setTimeout(() => {
    document.body.removeChild(announcer);
  }, 1000);
};

/**
 * Color contrast utilities
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

export const getContrastRatio = (color1: string, color2: string): number => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 0;

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
};

/**
 * Reduced motion utilities
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const getAnimationClass = (normalAnimation: string, reducedAnimation?: string): string => {
  return prefersReducedMotion() ? (reducedAnimation || '') : normalAnimation;
};