import { useState } from 'react';
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
  price_per_hour: number;
  price_per_hour_weekend: number;
  phone: string;
  email: string;
  website: string;
  playing_hours: string;
  rating: number;
  total_reviews: number;
  gmap_embed: string;
  review_url: string;
  images: string[];
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

  // Single turf form state
  const [formData, setFormData] = useState<TurfFormData>({
    name: '',
    address: '',
    description: '',
    sports: ['Football'],
    amenities: [],
    price_per_hour: 0,
    price_per_hour_weekend: 0,
    phone: '',
    email: '',
    website: '',
    playing_hours: '',
    rating: 0,
    total_reviews: 0,
    gmap_embed: '',
    review_url: '',
    images: ['', '', '', '', '']
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

  const handleSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      showError('Please login to upload turfs');
      return;
    }

    if (!formData.name || !formData.address || formData.price_per_hour <= 0) {
      showError('Please fill in all required fields');
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

      const turfData = {
        owner_id: user.id,
        name: formData.name,
        address: formData.address,
        description: formData.description || null,
        sports: formData.sports,
        amenities: formData.amenities,
        price_per_hour: formData.price_per_hour,
        price_per_hour_weekend: formData.price_per_hour_weekend || formData.price_per_hour,
        operating_hours: operatingHours,
        contact_info: Object.keys(contactInfo).length > 0 ? contactInfo : null,
        rating: formData.rating || 0,
        total_reviews: formData.total_reviews || 0,
        'Gmap Embed link': formData.gmap_embed || null,
        external_review_url: formData.review_url || null,
        images: validImages,
        cover_image: validImages[0] || null,
        is_active: true
      };

      const { error: insertError } = await supabase
        .from('turfs')
        .insert([turfData]);

      if (insertError) {
        console.error('Insert error:', insertError);
        showError(`Failed to upload turf: ${insertError.message}`);
      } else {
        success('Turf uploaded successfully!');
        // Reset form
        setFormData({
          name: '',
          address: '',
          description: '',
          sports: ['Football'],
          amenities: [],
          price_per_hour: 0,
          price_per_hour_weekend: 0,
          phone: '',
          email: '',
          website: '',
          playing_hours: '',
          rating: 0,
          total_reviews: 0,
          gmap_embed: '',
          review_url: '',
          images: ['', '', '', '', '']
        });
      }
    } catch (err) {
      console.error('Upload error:', err);
      showError('Failed to upload turf');
    } finally {
      setUploading(false);
    }
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
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      const results: BulkUploadResult = {
        success: 0,
        failed: 0,
        errors: []
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
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

          const turfData = {
            owner_id: user.id,
            name: row['Turf Name'],
            address: row['Address'] || '',
            description: row['Description'] || null,
            sports: sports,
            amenities: amenities,
            price_per_hour: parseFloat(row['Price Per Hour']) || 0,
            price_per_hour_weekend: parseFloat(row['Weekend Price']) || parseFloat(row['Price Per Hour']) || 0,
            operating_hours: operatingHours,
            contact_info: Object.keys(contactInfo).length > 0 ? contactInfo : null,
            rating: parseFloat(row['Ratings']) || 0,
            total_reviews: parseInt(row['No. of reviews']) || 0,
            'Gmap Embed link': row['Google Maps Embed Html Link'] || null,
            external_review_url: row['Link to reviews'] || null,
            images: images,
            cover_image: images[0] || null,
            is_active: true
          };

          const { error: insertError } = await supabase
            .from('turfs')
            .insert([turfData]);

          if (insertError) {
            results.failed++;
            results.errors.push(`Row ${i}: ${row['Turf Name']} - ${insertError.message}`);
          } else {
            results.success++;
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
                <CardTitle>Add New Turf</CardTitle>
              </CardHeader>
              <CardContent>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Price Per Hour (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.price_per_hour}
                        onChange={(e) => setFormData({ ...formData, price_per_hour: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        min="0"
                        step="50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Weekend Price (₹)</label>
                      <input
                        type="number"
                        value={formData.price_per_hour_weekend}
                        onChange={(e) => setFormData({ ...formData, price_per_hour_weekend: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                        min="0"
                        step="50"
                        placeholder="Same as weekday if empty"
                      />
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
                      <label className="block text-sm font-medium mb-2">Google Maps Embed Link</label>
                      <input
                        type="text"
                        value={formData.gmap_embed}
                        onChange={(e) => setFormData({ ...formData, gmap_embed: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-600"
                      />
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

                  {/* Submit */}
                  <Button
                    type="submit"
                    disabled={uploading}
                    className="w-full"
                  >
                    {uploading ? 'Uploading...' : 'Upload Turf'}
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
