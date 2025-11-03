import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Plus, Trash2, ArrowLeft, CheckCircle, AlertCircle, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toastManager';

interface AdminTurfUploadProps {
  onBack: () => void;
}

interface TurfFormData {
  name: string;
  address: string;
  description: string;
  sports: string[];
  amenities: string[];
  // Time-based pricing (ONLY these exist in DB now)
  morning_price?: number;
  afternoon_price?: number;
  evening_price?: number;
  weekend_morning_price?: number;
  weekend_afternoon_price?: number;
  weekend_evening_price?: number;
  phone: string;
  email: string;
  website: string;
  playing_hours: string;
  rating: number;
  total_reviews: number;
  gmap_embed: string;
  review_url: string;
  images: string[];
  // NEW FIELDS
  height_feet?: number;
  length_feet?: number;
  width_feet?: number;
  start_time?: string;
  end_time?: string;
  equipment_provided: boolean;
  parking_available: boolean;
  washroom_available: boolean;
  changing_room_available: boolean;
  sitting_area_available: boolean;
  number_of_grounds: number;
  net_condition?: string;
  grass_condition?: string;
  owner_name?: string;
  owner_phone?: string;
  preferred_booking_channel?: string;
  signboard_image?: string;
  entry_parking_image?: string;
  nearby_landmark?: string;
  unique_features?: string;
}

interface BulkUploadResult {
  success: number;
  failed: number;
  errors: string[];
}

export function AdminTurfUpload({ onBack }: AdminTurfUploadProps) {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [uploading, setUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);

  // Turf selection for editing
  const [allTurfs, setAllTurfs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTurfId, setSelectedTurfId] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);

  // Single turf form state
  const [formData, setFormData] = useState<TurfFormData>({
    name: '',
    address: '',
    description: '',
    sports: ['Football'],
    amenities: [],
    phone: '',
    email: '',
    website: '',
    playing_hours: '',
    rating: 0,
    total_reviews: 0,
    gmap_embed: '',
    review_url: '',
    images: ['', '', '', '', ''],
    // NEW FIELDS
    equipment_provided: false,
    parking_available: false,
    washroom_available: false,
    changing_room_available: false,
    sitting_area_available: false,
    number_of_grounds: 1
  });

  const commonSports = ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball'];
  const commonAmenities = [
    'Parking',
    'Washroom',
    'Changing Room',
    'Water',
    'First Aid',
    'Flood Lights',
    'Seating Area',
    'Cafeteria',
    'Equipment Rental'
  ];

  // Load all turfs on mount
  useEffect(() => {
    loadAllTurfs();
  }, []);

  const loadAllTurfs = async () => {
    const { data, error } = await supabase
      .from('turfs')
      .select('id, name, address, owner_id')
      .order('name');

    if (data) {
      setAllTurfs(data);
    }
  };

  const loadTurfDetails = async (turfId: string) => {
    console.log('📥 Loading turf details for ID:', turfId);
    const { data, error } = await supabase
      .from('turfs')
      .select('*')
      .eq('id', turfId)
      .single();

    if (error) {
      console.error('❌ Error loading turf:', error);
      showError('Failed to load turf details');
      return;
    }

    if (data) {
      console.log('✅ Turf data loaded:', data.name);
      // Map database fields to form fields
      setFormData({
        name: data.name || '',
        address: data.address || '',
        description: data.description || '',
        sports: data.sports || [],
        amenities: data.amenities || [],
        // Time-based pricing
        morning_price: data.morning_price,
        afternoon_price: data.afternoon_price,
        evening_price: data.evening_price,
        weekend_morning_price: data.weekend_morning_price,
        weekend_afternoon_price: data.weekend_afternoon_price,
        weekend_evening_price: data.weekend_evening_price,
        phone: data.contact_info?.phone || '',
        email: data.contact_info?.email || '',
        website: data.contact_info?.website || '',
        playing_hours: data.operating_hours?.raw || '',
        rating: data.rating || 0,
        total_reviews: data.total_reviews || 0,
        gmap_embed: data['Gmap Embed link'] || '',
        review_url: data.external_review_url || '',
        images: data.images || ['', '', '', '', ''],
        height_feet: data.height_feet,
        length_feet: data.length_feet,
        width_feet: data.width_feet,
        start_time: data.start_time,
        end_time: data.end_time,
        equipment_provided: data.equipment_provided || false,
        parking_available: data.parking_available || false,
        washroom_available: data.washroom_available || false,
        changing_room_available: data.changing_room_available || false,
        sitting_area_available: data.sitting_area_available || false,
        number_of_grounds: data.number_of_grounds || 1,
        net_condition: data.net_condition,
        grass_condition: data.grass_condition,
        owner_name: data.owner_name,
        owner_phone: data.owner_phone,
        preferred_booking_channel: data.preferred_booking_channel,
        signboard_image: data.signboard_image,
        entry_parking_image: data.entry_parking_image,
        nearby_landmark: data.nearby_landmark,
        unique_features: data.unique_features
      });
      setIsEditMode(true);
      console.log('✏️ Edit mode activated for turf:', data.name);
    }
  };

  const resetToNewTurf = () => {
    console.log('🆕 Resetting to new turf mode');
    setFormData({
      name: '',
      address: '',
      description: '',
      sports: ['Football'],
      amenities: [],
      phone: '',
      email: '',
      website: '',
      playing_hours: '',
      rating: 0,
      total_reviews: 0,
      gmap_embed: '',
      review_url: '',
      images: ['', '', '', '', ''],
      equipment_provided: false,
      parking_available: false,
      washroom_available: false,
      changing_room_available: false,
      sitting_area_available: false,
      number_of_grounds: 1
    });
    setSelectedTurfId('');
    setIsEditMode(false);
    setSearchQuery('');
  };

  const filteredTurfs = allTurfs.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      showError('Please login to upload turfs');
      return;
    }

    if (!formData.name || !formData.address || (!formData.morning_price && !formData.afternoon_price && !formData.evening_price)) {
      showError('Please fill in all required fields (name, address, and at least one pricing)');
      return;
    }

    setUploading(true);

    try {
      const operatingHours = formData.playing_hours
        ? { raw: formData.playing_hours }
        : {
            monday: { open: '06:00', close: '23:00' },
            tuesday: { open: '06:00', close: '23:00' },
            wednesday: { open: '06:00', close: '23:00' },
            thursday: { open: '06:00', close: '23:00' },
            friday: { open: '06:00', close: '23:00' },
            saturday: { open: '06:00', close: '23:00' },
            sunday: { open: '06:00', close: '23:00' }
          };

      const contactInfo: any = {};
      if (formData.phone) contactInfo.phone = formData.phone;
      if (formData.email) contactInfo.email = formData.email;
      if (formData.website) contactInfo.website = formData.website;

      const validImages = formData.images.filter(img => img.trim() !== '');

      // Extract Google Maps src URL from iframe HTML
      const extractMapSrc = (embedHtml: string): string | null => {
        if (!embedHtml) return null;

        // If it's already a URL (starts with http), return as-is
        if (embedHtml.trim().startsWith('http')) {
          return embedHtml.trim();
        }

        // If it's an iframe, extract the src attribute
        const srcMatch = embedHtml.match(/src=["']([^"']+)["']/);
        if (srcMatch) {
          console.log('✅ Extracted map URL from iframe:', srcMatch[1].substring(0, 50) + '...');
          return srcMatch[1];
        }

        // If no src found, return null
        console.warn('⚠️ Could not extract map URL from:', embedHtml.substring(0, 100));
        return null;
      };

      // Build turfData - only include fields with values
      const turfData: any = {
        name: formData.name,
        address: formData.address,
        sports: formData.sports,
        amenities: formData.amenities,
        operating_hours: operatingHours,
        is_active: true
      };

      // Only add owner_id for new turfs
      if (!isEditMode) {
        turfData.owner_id = user.id;
      }

      // Add optional fields only if they have values
      if (formData.description) turfData.description = formData.description;

      // Time-based pricing - include if provided
      if (formData.morning_price !== undefined) turfData.morning_price = formData.morning_price;
      if (formData.afternoon_price !== undefined) turfData.afternoon_price = formData.afternoon_price;
      if (formData.evening_price !== undefined) turfData.evening_price = formData.evening_price;
      if (formData.weekend_morning_price !== undefined) turfData.weekend_morning_price = formData.weekend_morning_price;
      if (formData.weekend_afternoon_price !== undefined) turfData.weekend_afternoon_price = formData.weekend_afternoon_price;
      if (formData.weekend_evening_price !== undefined) turfData.weekend_evening_price = formData.weekend_evening_price;

      // Contact info
      if (Object.keys(contactInfo).length > 0) turfData.contact_info = contactInfo;

      // Ratings
      if (formData.rating) turfData.rating = formData.rating;
      if (formData.total_reviews) turfData.total_reviews = formData.total_reviews;

      // URLs
      const mapSrc = extractMapSrc(formData.gmap_embed);
      if (mapSrc) turfData['Gmap Embed link'] = mapSrc;
      if (formData.review_url) turfData.external_review_url = formData.review_url;

      // Images
      if (validImages.length > 0) {
        turfData.images = validImages;
        turfData.cover_image = validImages[0];
      }

      // Dimensions
      if (formData.height_feet) turfData.height_feet = formData.height_feet;
      if (formData.length_feet) turfData.length_feet = formData.length_feet;
      if (formData.width_feet) turfData.width_feet = formData.width_feet;

      // Times
      if (formData.start_time) turfData.start_time = formData.start_time;
      if (formData.end_time) turfData.end_time = formData.end_time;

      // Facilities (always include booleans)
      turfData.equipment_provided = formData.equipment_provided;
      turfData.parking_available = formData.parking_available;
      turfData.washroom_available = formData.washroom_available;
      turfData.changing_room_available = formData.changing_room_available;
      turfData.sitting_area_available = formData.sitting_area_available;
      turfData.number_of_grounds = formData.number_of_grounds;

      // Conditions
      if (formData.net_condition) turfData.net_condition = formData.net_condition;
      if (formData.grass_condition) turfData.grass_condition = formData.grass_condition;

      // Owner info
      if (formData.owner_name) turfData.owner_name = formData.owner_name;
      if (formData.owner_phone) turfData.owner_phone = formData.owner_phone;
      if (formData.preferred_booking_channel) turfData.preferred_booking_channel = formData.preferred_booking_channel;

      // Additional images
      if (formData.signboard_image) turfData.signboard_image = formData.signboard_image;
      if (formData.entry_parking_image) turfData.entry_parking_image = formData.entry_parking_image;

      // Location
      if (formData.nearby_landmark) turfData.nearby_landmark = formData.nearby_landmark;
      if (formData.unique_features) turfData.unique_features = formData.unique_features;

      // Debug logging
      console.log('🔍 Form submission state:', {
        isEditMode,
        selectedTurfId,
        turfName: formData.name,
        willUpdate: isEditMode && selectedTurfId
      });

      if (isEditMode && selectedTurfId) {
        // Update existing turf
        console.log('🔄 Updating turf with ID:', selectedTurfId);
        const { error: updateError } = await supabase
          .from('turfs')
          .update(turfData)
          .eq('id', selectedTurfId);

        if (updateError) {
          console.error('❌ Update error:', updateError);
          showError(`Failed to update turf: ${updateError.message}`);
        } else {
          console.log('✅ Turf updated successfully');
          success('Turf updated successfully!');
          loadAllTurfs(); // Refresh the list
          // Stay in edit mode but refresh the data
          loadTurfDetails(selectedTurfId);
        }
      } else {
        // Insert new turf
        console.log('➕ Creating new turf');
        const { error: insertError } = await supabase
          .from('turfs')
          .insert([turfData]);

        if (insertError) {
          console.error('Insert error:', insertError);
          showError(`Failed to upload turf: ${insertError.message}`);
        } else {
          success('Turf uploaded successfully!');
          loadAllTurfs(); // Refresh the list
        }
      }

      if (!isEditMode) {
        // Reset form
        setFormData({
          name: '',
          address: '',
          description: '',
          sports: ['Football'],
          amenities: [],
          phone: '',
          email: '',
          website: '',
          playing_hours: '',
          rating: 0,
          total_reviews: 0,
          gmap_embed: '',
          review_url: '',
          images: ['', '', '', '', ''],
          equipment_provided: false,
          parking_available: false,
          washroom_available: false,
          changing_room_available: false,
          sitting_area_available: false,
          number_of_grounds: 1
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      showError('Failed to upload turf');
    } finally {
      setUploading(false);
    }
  };

  // Proper CSV parser that handles quoted fields with commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Toggle quote state
        if (i + 1 < line.length && line[i + 1] === '"' && inQuotes) {
          // Handle escaped quotes ("")
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Found field separator outside quotes
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Push last field
    result.push(current.trim());

    // Remove surrounding quotes from each field
    return result.map(field => {
      // Remove leading/trailing quotes
      if (field.startsWith('"') && field.endsWith('"')) {
        return field.slice(1, -1);
      }
      return field;
    });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      showError('Please login to upload turfs');
      return;
    }

    setUploading(true);
    setBulkResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      if (lines.length < 2) {
        showError('CSV file is empty or has no data rows');
        setUploading(false);
        return;
      }

      // Parse headers using proper CSV parser
      const headers = parseCSVLine(lines[0]);

      console.log('📋 CSV Headers detected:', headers);

      const results: BulkUploadResult = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        try {
          // Parse values using proper CSV parser
          const values = parseCSVLine(line);
          const row: any = {};

          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          console.log(`📝 Row ${i}:`, {
            name: row['Turf Name'],
            address: row['Address'],
            fieldsCount: values.length
          });

          // Skip if no turf name
          if (!row['Turf Name']) continue;

          // Parse sports and amenities
          const sports = row['Sports']
            ? row['Sports'].split(';').map((s: string) => s.trim())
            : ['Football'];
          const amenities = row['Aminites'] || row['Amenities']
            ? (row['Aminites'] || row['Amenities']).split(';').map((a: string) => a.trim())
            : [];

          // Collect images
          const images = [];
          for (let j = 1; j <= 5; j++) {
            const img = row[`Image ${j}`];
            if (img && img.trim()) images.push(img.trim());
          }

          // Parse contact info
          const contactInfo: any = {};
          if (row['Phone number']) contactInfo.phone = row['Phone number'];
          if (row['Email']) contactInfo.email = row['Email'];
          if (row['Website']) contactInfo.website = row['Website'];

          // Operating hours
          const operatingHours = row['Playing hours']
            ? { raw: row['Playing hours'] }
            : {
                monday: { open: '06:00', close: '23:00' },
                tuesday: { open: '06:00', close: '23:00' },
                wednesday: { open: '06:00', close: '23:00' },
                thursday: { open: '06:00', close: '23:00' },
                friday: { open: '06:00', close: '23:00' },
                saturday: { open: '06:00', close: '23:00' },
                sunday: { open: '06:00', close: '23:00' }
              };

          // Extract Google Maps src URL from iframe HTML
          const extractMapSrc = (embedHtml: string): string | null => {
            if (!embedHtml) return null;

            // If it's already a URL (starts with http), return as-is
            if (embedHtml.trim().startsWith('http')) {
              return embedHtml.trim();
            }

            // If it's an iframe, extract the src attribute
            const srcMatch = embedHtml.match(/src=["']([^"']+)["']/);
            if (srcMatch) {
              console.log('✅ Extracted map URL from iframe:', srcMatch[1].substring(0, 50) + '...');
              return srcMatch[1];
            }

            // If no src found, return null
            console.warn('⚠️ Could not extract map URL from:', embedHtml.substring(0, 100));
            return null;
          };

          // Parse weekday pricing (comma-separated or single value)
          const weekdayPriceStr = row['Price Per Hour'] || row['Price on weekdays (₹)'] || '';
          const weekdayPrices = weekdayPriceStr.split(',').map((p: string) => p.trim()).filter((p: string) => p);
          let weekdayPricing: any = {};

          if (weekdayPrices.length === 3) {
            // Morning, Afternoon, Evening
            weekdayPricing = {
              morning_price: parseFloat(weekdayPrices[0]) || null,
              afternoon_price: parseFloat(weekdayPrices[1]) || null,
              evening_price: parseFloat(weekdayPrices[2]) || null
            };
          } else if (weekdayPrices.length === 2) {
            // Morning, Evening (no afternoon)
            weekdayPricing = {
              morning_price: parseFloat(weekdayPrices[0]) || null,
              afternoon_price: null,
              evening_price: parseFloat(weekdayPrices[1]) || null
            };
          } else if (weekdayPrices.length === 1) {
            // Single price for all times
            const singlePrice = parseFloat(weekdayPrices[0]) || null;
            weekdayPricing = {
              morning_price: singlePrice,
              afternoon_price: singlePrice,
              evening_price: singlePrice
            };
          } else {
            // No pricing provided
            weekdayPricing = {
              morning_price: null,
              afternoon_price: null,
              evening_price: null
            };
          }

          // Parse weekend pricing (comma-separated or single value)
          const weekendPriceStr = row['Weekend Price'] || row['Price on weekends (₹)'] || '';
          const weekendPrices = weekendPriceStr.split(',').map((p: string) => p.trim()).filter((p: string) => p);
          let weekendPricing: any = {};

          if (weekendPrices.length === 3) {
            weekendPricing = {
              weekend_morning_price: parseFloat(weekendPrices[0]) || null,
              weekend_afternoon_price: parseFloat(weekendPrices[1]) || null,
              weekend_evening_price: parseFloat(weekendPrices[2]) || null
            };
          } else if (weekendPrices.length === 2) {
            weekendPricing = {
              weekend_morning_price: parseFloat(weekendPrices[0]) || null,
              weekend_afternoon_price: null,
              weekend_evening_price: parseFloat(weekendPrices[1]) || null
            };
          } else if (weekendPrices.length === 1) {
            const singlePrice = parseFloat(weekendPrices[0]) || null;
            weekendPricing = {
              weekend_morning_price: singlePrice,
              weekend_afternoon_price: singlePrice,
              weekend_evening_price: singlePrice
            };
          } else {
            // Default to weekday pricing if no weekend pricing specified
            weekendPricing = {
              weekend_morning_price: weekdayPricing.morning_price,
              weekend_afternoon_price: weekdayPricing.afternoon_price,
              weekend_evening_price: weekdayPricing.evening_price
            };
          }

          // Build turfData with selective field inclusion for partial updates
          const turfData: any = {
            name: row['Turf Name'],
            sports: sports,
            amenities: amenities,
            is_active: true
          };

          // Add optional fields only if they have values
          if (row['Address']) turfData.address = row['Address'];
          if (row['Description']) turfData.description = row['Description'];

          // Add weekday pricing only if provided (not null)
          if (weekdayPricing.morning_price !== null && weekdayPricing.morning_price !== undefined) {
            turfData.morning_price = weekdayPricing.morning_price;
          }
          if (weekdayPricing.afternoon_price !== null && weekdayPricing.afternoon_price !== undefined) {
            turfData.afternoon_price = weekdayPricing.afternoon_price;
          }
          if (weekdayPricing.evening_price !== null && weekdayPricing.evening_price !== undefined) {
            turfData.evening_price = weekdayPricing.evening_price;
          }

          // Add weekend pricing only if provided (not null)
          if (weekendPricing.weekend_morning_price !== null && weekendPricing.weekend_morning_price !== undefined) {
            turfData.weekend_morning_price = weekendPricing.weekend_morning_price;
          }
          if (weekendPricing.weekend_afternoon_price !== null && weekendPricing.weekend_afternoon_price !== undefined) {
            turfData.weekend_afternoon_price = weekendPricing.weekend_afternoon_price;
          }
          if (weekendPricing.weekend_evening_price !== null && weekendPricing.weekend_evening_price !== undefined) {
            turfData.weekend_evening_price = weekendPricing.weekend_evening_price;
          }

          // Add operating hours if provided
          if (operatingHours) turfData.operating_hours = operatingHours;

          // Add contact info if provided
          if (Object.keys(contactInfo).length > 0) turfData.contact_info = contactInfo;

          // Add ratings if provided
          const rating = parseFloat(row['Ratings']);
          if (!isNaN(rating) && rating > 0) turfData.rating = rating;

          const totalReviews = parseInt(row['No. of reviews']);
          if (!isNaN(totalReviews) && totalReviews > 0) turfData.total_reviews = totalReviews;

          // Add map link if provided
          const mapLink = extractMapSrc(row['Google Maps Embed Html Link']);
          if (mapLink) turfData['Gmap Embed link'] = mapLink;

          // Add external review URL if provided
          if (row['Link to reviews']) turfData.external_review_url = row['Link to reviews'];

          // Add images if provided
          if (images.length > 0) {
            turfData.images = images;
            turfData.cover_image = images[0];
          }

          // Check if turf with this name already exists
          const turfName = row['Turf Name'];
          console.log(`🔍 Checking for existing turf: "${turfName}"`);

          const { data: existingTurf, error: checkError } = await supabase
            .from('turfs')
            .select('id, name')
            .eq('name', turfName)
            .maybeSingle();

          console.log(`   Result:`, existingTurf ? `Found ID: ${existingTurf.id}` : 'Not found');

          if (checkError) {
            console.error(`❌ Error checking: ${checkError.message}`);
            results.failed++;
            results.errors.push(`Row ${i}: ${turfName} - Error checking existing: ${checkError.message}`);
            continue;
          }

          if (existingTurf) {
            // Update existing turf
            console.log(`🔄 Updating turf ID: ${existingTurf.id}, Name: "${turfName}"`);
            const { error: updateError } = await supabase
              .from('turfs')
              .update(turfData)
              .eq('id', existingTurf.id);

            if (updateError) {
              console.error(`❌ Update failed: ${updateError.message}`);
              results.failed++;
              results.errors.push(`Row ${i}: ${turfName} - Update failed: ${updateError.message}`);
            } else {
              results.success++;
              console.log(`✅ Successfully updated: ${turfName}`);
            }
          } else {
            // Insert new turf - add owner_id for new turfs only
            console.log(`➕ Creating new turf: "${turfName}"`);
            const newTurfData = { ...turfData, owner_id: user.id };
            const { error: insertError } = await supabase
              .from('turfs')
              .insert([newTurfData]);

            if (insertError) {
              console.error(`❌ Insert failed: ${insertError.message}`);
              results.failed++;
              results.errors.push(`Row ${i}: ${turfName} - Insert failed: ${insertError.message}`);
            } else {
              results.success++;
              console.log(`✅ Successfully created: ${turfName}`);
            }
          }
        } catch (rowError: any) {
          results.failed++;
          results.errors.push(`Row ${i}: ${rowError.message}`);
        }
      }

      setBulkResult(results);
      if (results.success > 0) {
        success(`Successfully uploaded ${results.success} turfs!`);
      }
      if (results.failed > 0) {
        showError(`Failed to upload ${results.failed} turfs. Check details below.`);
      }
    } catch (err: any) {
      console.error('Bulk upload error:', err);
      showError(`Failed to process CSV: ${err.message}`);
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const toggleSport = (sport: string) => {
    setFormData(prev => ({
      ...prev,
      sports: prev.sports.includes(sport)
        ? prev.sports.filter(s => s !== sport)
        : [...prev.sports, sport]
    }));
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity]
    }));
  };

  const updateImage = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.map((img, i) => i === index ? value : img)
    }));
  };

  // CRITICAL: Only allow access to authorized admin email
  const AUTHORIZED_ADMIN_EMAIL = 'abhishek.lonkar@viit.ac.in';

  if (!user || user.email !== AUTHORIZED_ADMIN_EMAIL) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              {!user
                ? 'Please login to access the admin panel.'
                : 'You do not have permission to access this page.'}
            </p>
            <Button onClick={onBack}>Back to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button onClick={onBack} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Turf Admin Panel</h1>
              <p className="text-sm text-gray-600">Upload and manage turfs</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setActiveTab('single')}
            variant={activeTab === 'single' ? 'default' : 'outline'}
          >
            <Plus className="w-4 h-4 mr-2" />
            Single Upload
          </Button>
          <Button
            onClick={() => setActiveTab('bulk')}
            variant={activeTab === 'bulk' ? 'default' : 'outline'}
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload (CSV)
          </Button>
        </div>

        {/* Single Upload Form */}
        {activeTab === 'single' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>{isEditMode ? 'Edit Turf' : 'Add New Turf'}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Turf Selection / New Turf Button */}
                <div className="mb-6 pb-6 border-b">
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <label className="block text-sm font-medium mb-2">Search & Select Turf to Edit</label>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Type turf name to search..."
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
                      {searchQuery && filteredTurfs.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredTurfs.map(turf => (
                            <div
                              key={turf.id}
                              onClick={() => {
                                console.log('🎯 Selected turf:', turf.name, 'ID:', turf.id);
                                setSelectedTurfId(turf.id);
                                loadTurfDetails(turf.id);
                                setSearchQuery('');
                              }}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                            >
                              <p className="font-medium text-gray-900">{turf.name}</p>
                              <p className="text-sm text-gray-600">{turf.address}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={resetToNewTurf}
                        variant="outline"
                        className="whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        New Turf
                      </Button>
                    </div>
                  </div>
                  {isEditMode && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        ✏️ <strong>Editing:</strong> {formData.name}
                      </p>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSingleUpload} className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Turf Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        required
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      rows={3}
                    />
                  </div>

                  {/* Sports */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Sports Available</label>
                    <div className="flex flex-wrap gap-2">
                      {commonSports.map(sport => (
                        <button
                          key={sport}
                          type="button"
                          onClick={() => toggleSport(sport)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            formData.sports.includes(sport)
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {sport}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amenities */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Amenities</label>
                    <div className="flex flex-wrap gap-2">
                      {commonAmenities.map(amenity => (
                        <button
                          key={amenity}
                          type="button"
                          onClick={() => toggleAmenity(amenity)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            formData.amenities.includes(amenity)
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {amenity}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Weekday Price (₹) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={
                            formData.morning_price && formData.afternoon_price && formData.evening_price
                              ? `${formData.morning_price},${formData.afternoon_price},${formData.evening_price}`
                              : formData.morning_price && formData.evening_price && !formData.afternoon_price
                              ? `${formData.morning_price},${formData.evening_price}`
                              : formData.morning_price && formData.morning_price === formData.afternoon_price && formData.morning_price === formData.evening_price
                              ? `${formData.morning_price}`
                              : ''
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            const prices = value.split(',').map(p => p.trim()).filter(p => p);

                            if (prices.length === 3) {
                              // Morning, Afternoon, Evening
                              setFormData({
                                ...formData,
                                morning_price: parseFloat(prices[0]) || undefined,
                                afternoon_price: parseFloat(prices[1]) || undefined,
                                evening_price: parseFloat(prices[2]) || undefined
                              });
                            } else if (prices.length === 2) {
                              // Morning, Evening (no afternoon)
                              setFormData({
                                ...formData,
                                morning_price: parseFloat(prices[0]) || undefined,
                                afternoon_price: undefined,
                                evening_price: parseFloat(prices[1]) || undefined
                              });
                            } else if (prices.length === 1) {
                              // Single price for all times
                              const singlePrice = parseFloat(prices[0]) || undefined;
                              setFormData({
                                ...formData,
                                morning_price: singlePrice,
                                afternoon_price: singlePrice,
                                evening_price: singlePrice
                              });
                            } else {
                              // Empty - clear all
                              setFormData({
                                ...formData,
                                morning_price: undefined,
                                afternoon_price: undefined,
                                evening_price: undefined
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="600 or 500,600 or 500,400,800"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Single: 600 | Morning,Evening: 500,600 | Morning,Afternoon,Evening: 500,400,800
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Weekend Price (₹)</label>
                        <input
                          type="text"
                          value={
                            formData.weekend_morning_price && formData.weekend_afternoon_price && formData.weekend_evening_price
                              ? `${formData.weekend_morning_price},${formData.weekend_afternoon_price},${formData.weekend_evening_price}`
                              : formData.weekend_morning_price && formData.weekend_evening_price && !formData.weekend_afternoon_price
                              ? `${formData.weekend_morning_price},${formData.weekend_evening_price}`
                              : formData.weekend_morning_price && formData.weekend_morning_price === formData.weekend_afternoon_price && formData.weekend_morning_price === formData.weekend_evening_price
                              ? `${formData.weekend_morning_price}`
                              : ''
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            const prices = value.split(',').map(p => p.trim()).filter(p => p);

                            if (prices.length === 3) {
                              setFormData({
                                ...formData,
                                weekend_morning_price: parseFloat(prices[0]) || undefined,
                                weekend_afternoon_price: parseFloat(prices[1]) || undefined,
                                weekend_evening_price: parseFloat(prices[2]) || undefined
                              });
                            } else if (prices.length === 2) {
                              setFormData({
                                ...formData,
                                weekend_morning_price: parseFloat(prices[0]) || undefined,
                                weekend_afternoon_price: undefined,
                                weekend_evening_price: parseFloat(prices[1]) || undefined
                              });
                            } else if (prices.length === 1) {
                              const singlePrice = parseFloat(prices[0]) || undefined;
                              setFormData({
                                ...formData,
                                weekend_morning_price: singlePrice,
                                weekend_afternoon_price: singlePrice,
                                weekend_evening_price: singlePrice
                              });
                            } else {
                              // Empty - clear all
                              setFormData({
                                ...formData,
                                weekend_morning_price: undefined,
                                weekend_afternoon_price: undefined,
                                weekend_evening_price: undefined
                              });
                            }
                          }}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="700 or 600,700 or 600,500,800"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Same format as weekday (optional, defaults to weekday)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Phone Number</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Website</label>
                      <input
                        type="url"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Playing Hours</label>
                      <input
                        type="text"
                        value={formData.playing_hours}
                        onChange={(e) => setFormData({ ...formData, playing_hours: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        placeholder="e.g., 6am - 11pm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Rating</label>
                      <input
                        type="number"
                        value={formData.rating}
                        onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        min="0"
                        max="5"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Number of Reviews</label>
                      <input
                        type="number"
                        value={formData.total_reviews}
                        onChange={(e) => setFormData({ ...formData, total_reviews: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* URLs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Google Maps Embed (Full iframe or just src URL)</label>
                      <textarea
                        value={formData.gmap_embed}
                        onChange={(e) => setFormData({ ...formData, gmap_embed: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        rows={3}
                        placeholder='Paste full iframe: <iframe src="https://..." ... ></iframe>'
                      />
                      <p className="text-xs text-gray-500 mt-1">Paste the entire iframe code from Google Maps</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Link to Reviews</label>
                      <input
                        type="url"
                        value={formData.review_url}
                        onChange={(e) => setFormData({ ...formData, review_url: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
                    </div>
                  </div>

                  {/* Images */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Image URLs</label>
                    <div className="space-y-2">
                      {formData.images.map((img, index) => (
                        <input
                          key={index}
                          type="url"
                          value={img}
                          onChange={(e) => updateImage(index, e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder={`Image ${index + 1} URL`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* NEW FIELDS - Dimensions */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Turf Specifications</h3>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Height (feet)</label>
                        <input
                          type="number"
                          value={formData.height_feet || ''}
                          onChange={(e) => setFormData({ ...formData, height_feet: parseInt(e.target.value) || undefined })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Length (feet)</label>
                        <input
                          type="number"
                          value={formData.length_feet || ''}
                          onChange={(e) => setFormData({ ...formData, length_feet: parseInt(e.target.value) || undefined })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="60"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Width (feet)</label>
                        <input
                          type="number"
                          value={formData.width_feet || ''}
                          onChange={(e) => setFormData({ ...formData, width_feet: parseInt(e.target.value) || undefined })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="40"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Number of Grounds</label>
                        <input
                          type="number"
                          value={formData.number_of_grounds}
                          onChange={(e) => setFormData({ ...formData, number_of_grounds: parseInt(e.target.value) || 1 })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          min="1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Operating Hours */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Operating Hours</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Start Time</label>
                        <input
                          type="time"
                          value={formData.start_time || ''}
                          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">End Time</label>
                        <input
                          type="time"
                          value={formData.end_time || ''}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Facilities */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Facilities</h3>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.equipment_provided}
                          onChange={(e) => setFormData({ ...formData, equipment_provided: e.target.checked })}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm font-medium">Equipment Provided</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.parking_available}
                          onChange={(e) => setFormData({ ...formData, parking_available: e.target.checked })}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm font-medium">Parking</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.washroom_available}
                          onChange={(e) => setFormData({ ...formData, washroom_available: e.target.checked })}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm font-medium">Washroom</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.changing_room_available}
                          onChange={(e) => setFormData({ ...formData, changing_room_available: e.target.checked })}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm font-medium">Changing Room</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.sitting_area_available}
                          onChange={(e) => setFormData({ ...formData, sitting_area_available: e.target.checked })}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm font-medium">Sitting Area</span>
                      </label>
                    </div>
                  </div>

                  {/* Condition */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Condition Assessment</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Net Condition</label>
                        <select
                          value={formData.net_condition || ''}
                          onChange={(e) => setFormData({ ...formData, net_condition: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        >
                          <option value="">Select condition</option>
                          <option value="excellent">Excellent</option>
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="needs_replacement">Needs Replacement</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Grass Condition</label>
                        <select
                          value={formData.grass_condition || ''}
                          onChange={(e) => setFormData({ ...formData, grass_condition: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        >
                          <option value="">Select condition</option>
                          <option value="excellent">Excellent</option>
                          <option value="good">Good</option>
                          <option value="fair">Fair</option>
                          <option value="needs_maintenance">Needs Maintenance</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Owner Information */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Owner Information</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Owner Name</label>
                        <input
                          type="text"
                          value={formData.owner_name || ''}
                          onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="Rajesh Kumar"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Owner Phone</label>
                        <input
                          type="tel"
                          value={formData.owner_phone || ''}
                          onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="+919876543210"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Preferred Booking Channel</label>
                        <select
                          value={formData.preferred_booking_channel || ''}
                          onChange={(e) => setFormData({ ...formData, preferred_booking_channel: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        >
                          <option value="">Select channel</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="call">Call</option>
                          <option value="both">Both</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Additional Images & Location */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Additional Information</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Signboard Image URL</label>
                        <input
                          type="url"
                          value={formData.signboard_image || ''}
                          onChange={(e) => setFormData({ ...formData, signboard_image: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="URL of turf signboard photo"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Entry/Parking Image URL</label>
                        <input
                          type="url"
                          value={formData.entry_parking_image || ''}
                          onChange={(e) => setFormData({ ...formData, entry_parking_image: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="URL of entry and parking area photo"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Nearby Landmark</label>
                        <input
                          type="text"
                          value={formData.nearby_landmark || ''}
                          onChange={(e) => setFormData({ ...formData, nearby_landmark: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          placeholder="Near Deolali Railway Station"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Unique Features</label>
                        <textarea
                          value={formData.unique_features || ''}
                          onChange={(e) => setFormData({ ...formData, unique_features: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                          rows={3}
                          placeholder="Indoor/outdoor hybrid turf with retractable roof..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    disabled={uploading}
                    className="w-full"
                  >
                    {uploading ? (isEditMode ? 'Updating...' : 'Uploading...') : (isEditMode ? 'Update Turf' : 'Upload Turf')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Bulk Upload */}
        {activeTab === 'bulk' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload via CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">CSV Format Instructions</h3>
                  <p className="text-sm text-blue-800 mb-2">Your CSV file should have these columns (exact names):</p>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li><strong>Required:</strong> Turf Name, Address, Price Per Hour</li>
                    <li><strong>Optional:</strong> Description, Sports (semicolon-separated), Aminites (semicolon-separated)</li>
                    <li><strong>Optional:</strong> Weekend Price, Phone number, Email, Website, Playing hours</li>
                    <li><strong>Optional:</strong> Ratings, No. of reviews, Google Maps Embed Html Link, Link to reviews</li>
                    <li><strong>Optional:</strong> Image 1, Image 2, Image 3, Image 4, Image 5</li>
                  </ul>
                  <p className="text-xs text-blue-700 mt-2">
                    <strong>Important:</strong> Fields with commas (like Address, Description) must be wrapped in double quotes.
                  </p>
                  <p className="text-xs text-blue-700">
                    <strong>Example:</strong> "Green Valley","123 Main St, Nashik","Best turf",...
                  </p>
                  <p className="text-xs text-blue-700">
                    <strong>Google Maps:</strong> You can paste either the full iframe HTML OR just the src URL. We'll extract it automatically!
                  </p>
                  <p className="text-xs text-blue-700">
                    <strong>Note:</strong> Use semicolon (;) to separate multiple values in Sports and Aminites columns.
                  </p>
                </div>

                {/* File Upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <label className="cursor-pointer">
                    <span className="text-primary-600 hover:text-primary-700 font-medium">
                      Choose CSV file
                    </span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleBulkUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">or drag and drop</p>
                  {uploading && (
                    <div className="mt-4">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                      <p className="text-sm text-gray-600 mt-2">Processing CSV...</p>
                    </div>
                  )}
                </div>

                {/* Results */}
                {bulkResult && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="font-semibold text-green-900">Successful</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600 mt-2">{bulkResult.success}</p>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-red-600" />
                          <span className="font-semibold text-red-900">Failed</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600 mt-2">{bulkResult.failed}</p>
                      </div>
                    </div>

                    {bulkResult.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">Errors:</h4>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {bulkResult.errors.map((error, index) => (
                            <p key={index} className="text-xs text-red-700">{error}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
