import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Upload, X, Check, Loader, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { validateImageFile } from '../lib/validation';
import { toastManager } from '../lib/toastManager';

interface ProfilePhotoUploadProps {
  currentPhotoUrl?: string;
  onPhotoUpdated: (newPhotoUrl: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function ProfilePhotoUpload({ 
  currentPhotoUrl, 
  onPhotoUpdated, 
  size = 'md' 
}: ProfilePhotoUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    setError(null);

    try {
      // Comprehensive image validation
      const validation = await validateImageFile(file, {
        maxSizeBytes: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxWidth: 1024,
        maxHeight: 1024,
        minWidth: 100,
        minHeight: 100
      });

      if (!validation.isValid) {
        setError(validation.errors.join('. '));
        setUploading(false);
        toastManager.validationError('Profile Photo', validation.errors.join('. '));
        return;
      }

      // Show warnings if any
      if (validation.warnings.length > 0) {
        toastManager.warning('Image Upload', validation.warnings.join('. '));
      }
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/profile.${fileExt}`;

      // Delete old photo if exists
      if (currentPhotoUrl) {
        const oldFileName = currentPhotoUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage
            .from('profile-photos')
            .remove([`${user.id}/${oldFileName}`]);
        }
      }

      // Upload new photo
      const { data, error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      // Update user profile in database
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_image_url: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        console.warn('Users table update failed (may not exist):', updateError);
        // Don't throw - continue to update auth metadata
      }

      // Also update Supabase Auth user metadata for immediate availability
      try {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            profile_image_url: publicUrl
          }
        });
        
        if (metadataError) {
          console.warn('Auth metadata update failed:', metadataError);
        }
      } catch (metaErr) {
        console.warn('Auth metadata update error:', metaErr);
      }

      // Success!
      onPhotoUpdated(publicUrl);
      setUploadSuccess(true);
      
      // Reset success state after 2 seconds
      setTimeout(() => setUploadSuccess(false), 2000);

    } catch (err: any) {
      console.error('Photo upload error:', err);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Photo Preview */}
      <div className="relative group">
        <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center relative`}>
          {currentPhotoUrl ? (
            <img
              src={currentPhotoUrl}
              alt="Profile"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to initials if image fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="text-white text-lg font-semibold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          )}

          {/* Upload overlay */}
          <motion.div
            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            whileHover={{ opacity: 1 }}
          >
            {uploading ? (
              <Loader className={`${iconSizeClasses[size]} text-white animate-spin`} />
            ) : uploadSuccess ? (
              <Check className={`${iconSizeClasses[size]} text-green-400`} />
            ) : (
              <Camera className={`${iconSizeClasses[size]} text-white`} />
            )}
          </motion.div>
        </div>

        {/* Upload button */}
        <button
          onClick={handleFileSelect}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 hover:bg-emerald-700 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader className="w-4 h-4 text-white animate-spin" />
          ) : uploadSuccess ? (
            <Check className="w-4 h-4 text-white" />
          ) : (
            <Upload className="w-4 h-4 text-white" />
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Upload button for larger sizes */}
      {size === 'lg' && (
        <Button
          onClick={handleFileSelect}
          disabled={uploading}
          variant="outline"
          className="rounded-full px-6 py-2 text-sm font-medium border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
        >
          {uploading ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Change Photo
            </>
          )}
        </Button>
      )}

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-full border border-red-200"
        >
          <X className="w-4 h-4" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:text-red-800"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}

      {/* Success message */}
      {uploadSuccess && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-3 py-2 rounded-full border border-green-200"
        >
          <Check className="w-4 h-4" />
          Photo updated successfully!
        </motion.div>
      )}

      {/* File requirements */}
      {size === 'lg' && (
        <div className="text-xs text-gray-500 text-center max-w-xs">
          <p>JPG, PNG or WebP. Max 5MB.</p>
          <p>Square images work best.</p>
        </div>
      )}
    </div>
  );
}