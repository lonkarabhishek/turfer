import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Upload, Plus, Edit, AlertCircle, CheckCircle, Search } from 'lucide-react';

interface TurfData {
  id?: string;
  owner_id?: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  description?: string;
  height_feet?: number;
  length_feet?: number;
  width_feet?: number;
  start_time?: string;
  end_time?: string;
  price_per_hour: number;
  price_per_hour_weekend?: number;
  equipment_provided?: boolean;
  'Gmap Embed link'?: string;
  parking_available?: boolean;
  washroom_available?: boolean;
  changing_room_available?: boolean;
  sitting_area_available?: boolean;
  number_of_grounds?: number;
  sports?: string[];
  net_condition?: string;
  grass_condition?: string;
  owner_name?: string;
  owner_phone?: string;
  preferred_booking_channel?: string;
  signboard_image?: string;
  entry_parking_image?: string;
  nearby_landmark?: string;
  unique_features?: string;
  images?: string[];
}

export function TurfAdminPanel() {
  const [activeTab, setActiveTab] = useState('bulk');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<TurfData[]>([]);

  // Single turf form
  const [selectedTurfId, setSelectedTurfId] = useState<string>('');
  const [allTurfs, setAllTurfs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewTurf, setIsNewTurf] = useState(true);
  const [formData, setFormData] = useState<TurfData>({
    name: '',
    address: '',
    price_per_hour: 0,
    sports: [],
    images: []
  });

  useEffect(() => {
    loadAllTurfs();
  }, []);

  const loadAllTurfs = async () => {
    const { data, error } = await supabase
      .from('turfs')
      .select('id, name, address, owner_id')
      .order('name');

    if (data) setAllTurfs(data);
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
      parseCSV(file);
    }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
      const headers = rows[0];

      const parsed: TurfData[] = [];
      const errors: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        if (rows[i].length < 2) continue; // Skip empty rows

        const row = rows[i];
        const turf: any = {};

        headers.forEach((header, index) => {
          const value = row[index]?.replace(/^"|"$/g, ''); // Remove quotes

          switch (header.toLowerCase()) {
            case 'id':
              if (value) turf.id = value;
              break;
            case 'owner_id':
              if (value) turf.owner_id = value;
              break;
            case 'turf name':
              turf.name = value;
              break;
            case 'upload photos of the turf':
              turf.images = value ? value.split('|').map(url => url.trim()) : [];
              break;
            case 'height (in feet)':
              turf.height_feet = value ? parseInt(value) : null;
              break;
            case 'length (in feet)':
              turf.length_feet = value ? parseInt(value) : null;
              break;
            case 'width (in feet)':
              turf.width_feet = value ? parseInt(value) : null;
              break;
            case 'start time':
              turf.start_time = value;
              break;
            case 'end time':
              turf.end_time = value;
              break;
            case 'price on weekdays (₹)':
              turf.price_per_hour = value ? parseFloat(value) : 0;
              break;
            case 'price on weekends (₹)':
              turf.price_per_hour_weekend = value ? parseFloat(value) : null;
              break;
            case 'equipment provided?':
              turf.equipment_provided = value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';
              break;
            case 'exact location (google maps link or coordinates)':
              turf['Gmap Embed link'] = value;
              // Try to extract lat/lng from the link if possible
              break;
            case 'parking available?':
              turf.parking_available = value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';
              break;
            case 'washroom / changing room available?':
              const hasWashroom = value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';
              turf.washroom_available = hasWashroom;
              turf.changing_room_available = hasWashroom;
              break;
            case 'sitting area / shade for viewers?':
              turf.sitting_area_available = value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true';
              break;
            case 'number of grounds / boxes':
              turf.number_of_grounds = value ? parseInt(value) : 1;
              break;
            case 'sports allowed':
              turf.sports = value ? value.split('|').map(s => s.trim()) : [];
              break;
            case 'net condition':
              turf.net_condition = value?.toLowerCase();
              break;
            case 'grass condition':
              turf.grass_condition = value?.toLowerCase();
              break;
            case 'owner name':
              turf.owner_name = value;
              break;
            case 'owner number':
              turf.owner_phone = value;
              break;
            case 'preferred booking channel':
              turf.preferred_booking_channel = value?.toLowerCase();
              break;
            case 'photo of the turf signboard / nameboard':
              turf.signboard_image = value;
              break;
            case 'photo of entry area + parking zone':
              turf.entry_parking_image = value;
              break;
            case 'nearby landmark':
              turf.nearby_landmark = value;
              break;
            case 'any unique feature':
              turf.unique_features = value;
              break;
          }
        });

        // Validation
        if (!turf.name) {
          errors.push(`Row ${i + 1}: Turf name is required`);
        }
        if (!turf.price_per_hour || turf.price_per_hour <= 0) {
          errors.push(`Row ${i + 1}: Valid weekday price is required`);
        }

        parsed.push(turf);
      }

      setPreviewData(parsed);
      setValidationErrors(errors);
      setUploadStatus(`Parsed ${parsed.length} turfs. ${errors.length} errors found.`);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (validationErrors.length > 0) {
      alert('Please fix validation errors before uploading');
      return;
    }

    if (!confirm(`Upload ${previewData.length} turfs to database?`)) {
      return;
    }

    setUploadStatus('Uploading...');
    let successCount = 0;
    let errorCount = 0;

    for (const turf of previewData) {
      try {
        if (turf.id && turf.owner_id) {
          // Update existing turf
          const { error } = await supabase
            .from('turfs')
            .update(turf)
            .eq('id', turf.id);

          if (error) throw error;
        } else {
          // Insert new turf (need owner_id from user)
          if (!turf.owner_id) {
            errorCount++;
            console.error(`Skipping ${turf.name}: No owner_id provided`);
            continue;
          }

          const { error } = await supabase
            .from('turfs')
            .insert([turf]);

          if (error) throw error;
        }
        successCount++;
      } catch (error) {
        console.error(`Error uploading ${turf.name}:`, error);
        errorCount++;
      }
    }

    setUploadStatus(`✅ Uploaded ${successCount} turfs successfully. ❌ ${errorCount} errors.`);
    loadAllTurfs();
  };

  const loadTurfDetails = async (turfId: string) => {
    const { data, error } = await supabase
      .from('turfs')
      .select('*')
      .eq('id', turfId)
      .single();

    if (data) {
      setFormData(data);
      setIsNewTurf(false);
    }
  };

  const handleSingleSubmit = async () => {
    if (!formData.name || !formData.address) {
      alert('Please fill in required fields: Name and Address');
      return;
    }

    try {
      if (isNewTurf) {
        // Insert new turf
        const { error } = await supabase
          .from('turfs')
          .insert([formData]);

        if (error) throw error;
        alert('✅ Turf created successfully!');
      } else {
        // Update existing turf
        const { error } = await supabase
          .from('turfs')
          .update(formData)
          .eq('id', selectedTurfId);

        if (error) throw error;
        alert('✅ Turf updated successfully!');
      }

      loadAllTurfs();
      resetForm();
    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error saving turf');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      price_per_hour: 0,
      sports: [],
      images: []
    });
    setSelectedTurfId('');
    setIsNewTurf(true);
  };

  const filteredTurfs = allTurfs.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Turf Admin Panel</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="bulk">Bulk CSV Upload</TabsTrigger>
          <TabsTrigger value="single">Single Turf Upload/Edit</TabsTrigger>
        </TabsList>

        {/* Bulk Upload Tab */}
        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Upload Turfs from CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block mb-2 font-medium">Upload CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>

              {uploadStatus && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  {uploadStatus}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded">
                  <p className="font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Validation Errors:
                  </p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewData.length > 0 && (
                <>
                  <div className="overflow-x-auto max-h-96 border rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Action</th>
                          <th className="p-2 text-left">Name</th>
                          <th className="p-2 text-left">Address</th>
                          <th className="p-2 text-left">Weekday Price</th>
                          <th className="p-2 text-left">Weekend Price</th>
                          <th className="p-2 text-left">Sports</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((turf, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">
                              {turf.id ? <Edit className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-green-600" />}
                            </td>
                            <td className="p-2 font-medium">{turf.name}</td>
                            <td className="p-2 text-gray-600">{turf.address || 'N/A'}</td>
                            <td className="p-2">₹{turf.price_per_hour}</td>
                            <td className="p-2">₹{turf.price_per_hour_weekend || 'N/A'}</td>
                            <td className="p-2">{turf.sports?.join(', ') || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    onClick={handleBulkUpload}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={validationErrors.length > 0}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {previewData.length} Turfs to Database
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Single Upload/Edit Tab */}
        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>
                {isNewTurf ? 'Create New Turf' : 'Edit Existing Turf'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Turf Selection */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block mb-2 font-medium">Search & Select Turf to Edit</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search turf by name..."
                      className="w-full pl-10 pr-4 py-2 border rounded-lg"
                    />
                  </div>
                  {searchQuery && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredTurfs.map(turf => (
                        <div
                          key={turf.id}
                          onClick={() => {
                            setSelectedTurfId(turf.id);
                            loadTurfDetails(turf.id);
                            setSearchQuery('');
                          }}
                          className="p-3 hover:bg-gray-50 cursor-pointer border-b"
                        >
                          <p className="font-medium">{turf.name}</p>
                          <p className="text-sm text-gray-600">{turf.address}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={resetForm} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  New Turf
                </Button>
              </div>

              {/* Form Fields */}
              <div className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Basic Information</h3>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Turf Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter turf name"
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Address *</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Enter full address"
                      className="w-full px-4 py-2 border rounded-lg"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the turf"
                      className="w-full px-4 py-2 border rounded-lg"
                      rows={3}
                    />
                  </div>
                </div>

                {/* Dimensions */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Dimensions</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Height (feet)</label>
                      <input
                        type="number"
                        value={formData.height_feet || ''}
                        onChange={(e) => setFormData({ ...formData, height_feet: parseInt(e.target.value) || undefined })}
                        placeholder="20"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Length (feet)</label>
                      <input
                        type="number"
                        value={formData.length_feet || ''}
                        onChange={(e) => setFormData({ ...formData, length_feet: parseInt(e.target.value) || undefined })}
                        placeholder="60"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Width (feet)</label>
                      <input
                        type="number"
                        value={formData.width_feet || ''}
                        onChange={(e) => setFormData({ ...formData, width_feet: parseInt(e.target.value) || undefined })}
                        placeholder="40"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Number of Grounds/Boxes</label>
                    <input
                      type="number"
                      value={formData.number_of_grounds || 1}
                      onChange={(e) => setFormData({ ...formData, number_of_grounds: parseInt(e.target.value) || 1 })}
                      placeholder="1"
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Timing */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Operating Hours</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Start Time</label>
                      <input
                        type="time"
                        value={formData.start_time || ''}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">End Time</label>
                      <input
                        type="time"
                        value={formData.end_time || ''}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Pricing</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Weekday Price (₹/hour) *</label>
                      <input
                        type="number"
                        value={formData.price_per_hour}
                        onChange={(e) => setFormData({ ...formData, price_per_hour: parseFloat(e.target.value) || 0 })}
                        placeholder="600"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Weekend Price (₹/hour)</label>
                      <input
                        type="number"
                        value={formData.price_per_hour_weekend || ''}
                        onChange={(e) => setFormData({ ...formData, price_per_hour_weekend: parseFloat(e.target.value) || undefined })}
                        placeholder="800"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Location Details</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.lat || ''}
                        onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || undefined })}
                        placeholder="19.955833"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.lng || ''}
                        onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || undefined })}
                        placeholder="73.790278"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Google Maps Embed Link</label>
                    <input
                      type="text"
                      value={formData['Gmap Embed link'] || ''}
                      onChange={(e) => setFormData({ ...formData, 'Gmap Embed link': e.target.value })}
                      placeholder="https://www.google.com/maps/embed?..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Nearby Landmark</label>
                    <input
                      type="text"
                      value={formData.nearby_landmark || ''}
                      onChange={(e) => setFormData({ ...formData, nearby_landmark: e.target.value })}
                      placeholder="Near Deolali Railway Station"
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Facilities */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Facilities</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.equipment_provided || false}
                        onChange={(e) => setFormData({ ...formData, equipment_provided: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Equipment Provided</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.parking_available || false}
                        onChange={(e) => setFormData({ ...formData, parking_available: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Parking Available</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.washroom_available || false}
                        onChange={(e) => setFormData({ ...formData, washroom_available: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Washroom Available</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.changing_room_available || false}
                        onChange={(e) => setFormData({ ...formData, changing_room_available: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Changing Room Available</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sitting_area_available || false}
                        onChange={(e) => setFormData({ ...formData, sitting_area_available: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Sitting Area Available</span>
                    </label>
                  </div>
                </div>

                {/* Condition */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Condition Assessment</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Net Condition</label>
                      <select
                        value={formData.net_condition || ''}
                        onChange={(e) => setFormData({ ...formData, net_condition: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg"
                      >
                        <option value="">Select condition</option>
                        <option value="excellent">Excellent</option>
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="needs_replacement">Needs Replacement</option>
                      </select>
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Grass Condition</label>
                      <select
                        value={formData.grass_condition || ''}
                        onChange={(e) => setFormData({ ...formData, grass_condition: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg"
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

                {/* Sports */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Sports Allowed</h3>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Sports (pipe-separated: Football|Cricket|Basketball)</label>
                    <input
                      type="text"
                      value={formData.sports?.join('|') || ''}
                      onChange={(e) => setFormData({ ...formData, sports: e.target.value.split('|').map(s => s.trim()).filter(s => s) })}
                      placeholder="Football|Cricket|Basketball"
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Owner Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Owner Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-medium text-sm">Owner Name</label>
                      <input
                        type="text"
                        value={formData.owner_name || ''}
                        onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                        placeholder="Rajesh Kumar"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 font-medium text-sm">Owner Phone</label>
                      <input
                        type="text"
                        value={formData.owner_phone || ''}
                        onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
                        placeholder="+919876543210"
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Preferred Booking Channel</label>
                    <select
                      value={formData.preferred_booking_channel || ''}
                      onChange={(e) => setFormData({ ...formData, preferred_booking_channel: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Select channel</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="call">Call</option>
                      <option value="both">Both</option>
                      <option value="online">Online</option>
                    </select>
                  </div>
                </div>

                {/* Images */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Images</h3>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Turf Images (pipe-separated URLs)</label>
                    <textarea
                      value={formData.images?.join('|') || ''}
                      onChange={(e) => setFormData({ ...formData, images: e.target.value.split('|').map(s => s.trim()).filter(s => s) })}
                      placeholder="https://drive.google.com/...|https://drive.google.com/..."
                      className="w-full px-4 py-2 border rounded-lg"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Signboard Image URL</label>
                    <input
                      type="text"
                      value={formData.signboard_image || ''}
                      onChange={(e) => setFormData({ ...formData, signboard_image: e.target.value })}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Entry/Parking Image URL</label>
                    <input
                      type="text"
                      value={formData.entry_parking_image || ''}
                      onChange={(e) => setFormData({ ...formData, entry_parking_image: e.target.value })}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                {/* Unique Features */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Additional Information</h3>

                  <div>
                    <label className="block mb-2 font-medium text-sm">Unique Features</label>
                    <textarea
                      value={formData.unique_features || ''}
                      onChange={(e) => setFormData({ ...formData, unique_features: e.target.value })}
                      placeholder="Indoor/outdoor hybrid turf with retractable roof"
                      className="w-full px-4 py-2 border rounded-lg"
                      rows={3}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={handleSingleSubmit}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isNewTurf ? (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Turf
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Update Turf
                      </>
                    )}
                  </Button>

                  {!isNewTurf && (
                    <Button onClick={resetForm} variant="outline">
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
