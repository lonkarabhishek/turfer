import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  structuredData?: object;
}

/**
 * Custom hook for managing SEO meta tags dynamically
 * Works with React 19 without additional dependencies
 */
export function useSEO({
  title,
  description,
  keywords,
  ogImage,
  ogType = 'website',
  canonicalUrl,
  structuredData
}: SEOProps) {
  useEffect(() => {
    // Update document title
    if (title) {
      document.title = `${title} | TapTurf`;
    }

    // Helper function to update or create meta tag
    const updateMetaTag = (selector: string, content: string, attribute: string = 'content') => {
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        const attr = selector.match(/\[(.*?)="(.*?)"\]/);
        if (attr) {
          tag.setAttribute(attr[1], attr[2]);
        }
        document.head.appendChild(tag);
      }
      tag.setAttribute(attribute, content);
    };

    // Update description
    if (description) {
      updateMetaTag('meta[name="description"]', description);
      updateMetaTag('meta[property="og:description"]', description);
      updateMetaTag('meta[property="twitter:description"]', description);
    }

    // Update keywords
    if (keywords) {
      updateMetaTag('meta[name="keywords"]', keywords);
    }

    // Update Open Graph title
    if (title) {
      updateMetaTag('meta[property="og:title"]', title);
      updateMetaTag('meta[property="twitter:title"]', title);
    }

    // Update Open Graph image
    if (ogImage) {
      updateMetaTag('meta[property="og:image"]', ogImage);
      updateMetaTag('meta[property="twitter:image"]', ogImage);
    }

    // Update Open Graph type
    if (ogType) {
      updateMetaTag('meta[property="og:type"]', ogType);
    }

    // Update canonical URL
    if (canonicalUrl) {
      let linkTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (!linkTag) {
        linkTag = document.createElement('link');
        linkTag.rel = 'canonical';
        document.head.appendChild(linkTag);
      }
      linkTag.href = canonicalUrl;

      // Also update og:url
      updateMetaTag('meta[property="og:url"]', canonicalUrl);
      updateMetaTag('meta[property="twitter:url"]', canonicalUrl);
    }

    // Update structured data
    if (structuredData) {
      let script = document.querySelector('script[data-dynamic-schema]');
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        script.setAttribute('data-dynamic-schema', 'true');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }

    // Cleanup function to remove dynamic schema on unmount
    return () => {
      const dynamicSchema = document.querySelector('script[data-dynamic-schema]');
      if (dynamicSchema) {
        dynamicSchema.remove();
      }
    };
  }, [title, description, keywords, ogImage, ogType, canonicalUrl, structuredData]);
}

/**
 * Generate LocalBusiness structured data for a turf
 */
export function generateTurfSchema(turf: {
  id: string;
  name: string;
  description?: string;
  address: string;
  rating: number;
  totalReviews: number;
  pricePerHour?: number;
  images?: string[];
  coords?: { lat: number; lng: number } | null;
  owner_phone?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: turf.name,
    description: turf.description || `Book ${turf.name} for sports activities. Top-rated sports facility.`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: turf.address,
      addressCountry: 'IN'
    },
    geo: turf.coords ? {
      '@type': 'GeoCoordinates',
      latitude: turf.coords.lat,
      longitude: turf.coords.lng
    } : undefined,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: turf.rating,
      reviewCount: turf.totalReviews,
      bestRating: 5,
      worstRating: 1
    },
    priceRange: turf.pricePerHour ? `₹${turf.pricePerHour}` : '₹₹',
    image: turf.images?.[0],
    telephone: turf.owner_phone,
    url: `https://www.tapturf.in/turf/${turf.id}`,
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '06:00',
      closes: '23:00'
    }
  };
}

/**
 * Generate Event structured data for a game
 */
export function generateGameSchema(game: {
  id: string;
  format: string;
  date: string;
  timeSlot: string;
  turfName: string;
  turfAddress: string;
  maxPlayers: number;
  currentPlayers: number;
  costPerPerson: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${game.format} Game at ${game.turfName}`,
    description: `Join a ${game.format} game. ${game.maxPlayers - game.currentPlayers} spots available.`,
    startDate: game.date,
    location: {
      '@type': 'Place',
      name: game.turfName,
      address: {
        '@type': 'PostalAddress',
        streetAddress: game.turfAddress,
        addressCountry: 'IN'
      }
    },
    offers: {
      '@type': 'Offer',
      price: game.costPerPerson,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: `https://www.tapturf.in/game/${game.id}`
    },
    performer: {
      '@type': 'SportsTeam',
      name: `${game.format} Players`
    }
  };
}
