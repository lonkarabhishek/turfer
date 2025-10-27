/**
 * Form validation utilities with comprehensive field validation
 */

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: string) => boolean;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FieldValidation {
  value: string;
  rules: ValidationRule[];
}

// Common validation patterns
export const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$/, // Indian phone numbers
  name: /^[a-zA-Z\s]{2,50}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  indianPhone: /^[6-9]\d{9}$/,
  pincode: /^[1-9][0-9]{5}$/
};

/**
 * Validate a single field with multiple rules
 */
export const validateField = (value: string, rules: ValidationRule[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    // Required check
    if (rule.required && (!value || value.trim().length === 0)) {
      errors.push(rule.message);
      continue;
    }

    // Skip other validations if field is empty and not required
    if (!value || value.trim().length === 0) {
      continue;
    }

    // Length validations
    if (rule.minLength && value.length < rule.minLength) {
      errors.push(rule.message);
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push(rule.message);
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(rule.message);
    }

    // Custom validation
    if (rule.custom && !rule.custom(value)) {
      errors.push(rule.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validate multiple fields at once
 */
export const validateForm = (fields: Record<string, FieldValidation>): Record<string, ValidationResult> => {
  const results: Record<string, ValidationResult> = {};

  for (const [fieldName, fieldData] of Object.entries(fields)) {
    results[fieldName] = validateField(fieldData.value, fieldData.rules);
  }

  return results;
};

/**
 * Check if all validations passed
 */
export const isFormValid = (validationResults: Record<string, ValidationResult>): boolean => {
  return Object.values(validationResults).every(result => result.isValid);
};

// Pre-defined field validators
export const FIELD_VALIDATORS = {
  name: (): ValidationRule[] => [
    { required: true, message: 'Name is required' },
    { minLength: 2, message: 'Name must be at least 2 characters long' },
    { maxLength: 50, message: 'Name must be less than 50 characters' },
    { pattern: VALIDATION_PATTERNS.name, message: 'Name can only contain letters and spaces' }
  ],

  email: (): ValidationRule[] => [
    { required: true, message: 'Email is required' },
    { pattern: VALIDATION_PATTERNS.email, message: 'Please enter a valid email address' }
  ],

  phone: (): ValidationRule[] => [
    { required: true, message: 'Phone number is required' },
    { pattern: VALIDATION_PATTERNS.indianPhone, message: 'Please enter a valid 10-digit phone number' }
  ],

  password: (): ValidationRule[] => [
    { required: true, message: 'Password is required' },
    { minLength: 8, message: 'Password must be at least 8 characters long' },
    {
      pattern: VALIDATION_PATTERNS.password,
      message: 'Password must contain uppercase, lowercase, number, and special character'
    }
  ],

  confirmPassword: (originalPassword: string): ValidationRule[] => [
    { required: true, message: 'Please confirm your password' },
    {
      custom: (value: string) => value === originalPassword,
      message: 'Passwords do not match'
    }
  ]
};

/**
 * Image upload validation
 */
export interface ImageValidationOptions {
  maxSizeBytes?: number;
  allowedTypes?: string[];
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export const validateImageFile = (
  file: File,
  options: ImageValidationOptions = {}
): Promise<ValidationResult> => {
  return new Promise((resolve) => {
    const {
      maxSizeBytes = 5 * 1024 * 1024, // 5MB
      allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
      maxWidth = 2048,
      maxHeight = 2048,
      minWidth = 100,
      minHeight = 100
    } = options;

    const errors: string[] = [];

    // File type validation
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type not supported. Please use: ${allowedTypes.map(t => t.split('/')[1]).join(', ')}`);
    }

    // File size validation
    if (file.size > maxSizeBytes) {
      const maxSizeMB = maxSizeBytes / (1024 * 1024);
      errors.push(`File size too large. Maximum size: ${maxSizeMB}MB`);
    }

    // If basic validations fail, return early
    if (errors.length > 0) {
      resolve({ isValid: false, errors, warnings: [] });
      return;
    }

    // Image dimensions validation
    const img = new Image();
    img.onload = () => {
      if (img.width > maxWidth || img.height > maxHeight) {
        errors.push(`Image too large. Maximum dimensions: ${maxWidth}×${maxHeight}px`);
      }

      if (img.width < minWidth || img.height < minHeight) {
        errors.push(`Image too small. Minimum dimensions: ${minWidth}×${minHeight}px`);
      }

      resolve({ isValid: errors.length === 0, errors, warnings: [] });
    };

    img.onerror = () => {
      errors.push('Invalid image file');
      resolve({ isValid: false, errors, warnings: [] });
    };

    img.src = URL.createObjectURL(file);
  });
};

/**
 * Real-time validation hook-like function
 */
export const createFieldValidator = (rules: ValidationRule[]) => {
  return (value: string): ValidationResult => {
    return validateField(value, rules);
  };
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove basic XSS vectors
    .replace(/\s+/g, ' '); // Normalize whitespace
};

/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};