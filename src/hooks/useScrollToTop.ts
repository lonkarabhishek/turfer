import { useEffect } from 'react';

/**
 * Custom hook to scroll to top of page when dependencies change
 * Useful for page navigation to ensure users start at the top of new pages
 *
 * @param dependencies - Array of dependencies to watch for changes
 * @param behavior - Scroll behavior ('auto' | 'smooth')
 * @param enabled - Whether scrolling is enabled (default: true)
 *
 * @example
 * // Scroll to top when page changes
 * useScrollToTop([currentPage]);
 *
 * @example
 * // Smooth scroll when specific data loads
 * useScrollToTop([data], 'smooth');
 */
export function useScrollToTop(
  dependencies: any[] = [],
  behavior: ScrollBehavior = 'auto',
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    // Scroll to top of the page
    window.scrollTo({
      top: 0,
      left: 0,
      behavior
    });
  }, dependencies);
}

/**
 * Component-based scroll to top
 * Use this in individual page components
 */
export function usePageScrollToTop(behavior: ScrollBehavior = 'auto') {
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior
    });
  }, []); // Empty deps = scroll on mount only
}
