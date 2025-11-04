/**
 * Image utility functions for handling various image sources
 * including Google Drive links
 */

/**
 * Converts a Google Drive sharing link to a direct image URL using thumbnail API
 *
 * Supported formats:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 *
 * @param url - The Google Drive URL to convert
 * @returns Direct image URL using thumbnail API or original URL if not a Google Drive link
 */
export function convertGoogleDriveUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Check if it's a Google Drive URL
  if (!url.includes('drive.google.com')) {
    return url;
  }

  // Already converted to thumbnail format
  if (url.includes('drive.google.com/thumbnail')) {
    return url;
  }

  try {
    // Extract file ID from various Google Drive URL formats
    let fileId: string | null = null;

    // Format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    // Format: https://drive.google.com/file/d/FILE_ID/view
    const fileMatch = url.match(/\/file\/d\/([^/?]+)/);
    if (fileMatch) {
      fileId = fileMatch[1];
    }

    // Format: https://drive.google.com/open?id=FILE_ID
    // Format: https://drive.google.com/uc?id=FILE_ID
    // Format: https://drive.google.com/uc?export=view&id=FILE_ID
    if (!fileId) {
      const openMatch = url.match(/[?&]id=([^&]+)/);
      if (openMatch) {
        fileId = openMatch[1];
      }
    }

    // If we found a file ID, convert to thumbnail link (works better for embedding)
    if (fileId) {
      // Use thumbnail API with large size for best quality
      // sz=w2000 requests width of 2000px (you can adjust this)
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
    }

    // Return original URL if we couldn't extract file ID
    return url;
  } catch (error) {
    console.warn('Error converting Google Drive URL:', error);
    return url;
  }
}

/**
 * Converts an array of image URLs, handling Google Drive links
 *
 * @param urls - Array of image URLs
 * @returns Array of converted URLs
 */
export function convertImageUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls
    .filter(url => url && typeof url === 'string' && url.trim() !== '')
    .map(url => convertGoogleDriveUrl(url.trim()));
}

/**
 * Gets a valid image URL, converting Google Drive links and filtering empty values
 *
 * @param url - Image URL to process
 * @returns Processed URL or empty string if invalid
 */
export function getValidImageUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  return convertGoogleDriveUrl(url.trim());
}
