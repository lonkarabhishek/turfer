// Firebase Admin SDK initialization
const admin = require('firebase-admin');

// Initialize Firebase Admin with your project config
// Supports multiple initialization methods for different environments
try {
  if (!admin.apps.length) {
    let credential;

    // Method 1: Check for base64 encoded service account JSON in env variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccountJson = JSON.parse(
          Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8')
        );
        credential = admin.credential.cert(serviceAccountJson);
        console.log('✅ Firebase Admin initialized with base64 service account');
      } catch (parseError) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseError.message);
      }
    }

    // Method 2: Check for individual environment variables
    if (!credential && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
      });
      console.log('✅ Firebase Admin initialized with individual env variables');
    }

    // Method 3: Fall back to application default credentials (local development)
    if (!credential) {
      try {
        credential = admin.credential.applicationDefault();
        console.log('✅ Firebase Admin initialized with application default credentials');
      } catch (defaultError) {
        console.error('❌ Application default credentials not available');
      }
    }

    // Initialize with credentials if available
    if (credential) {
      admin.initializeApp({
        credential: credential,
        projectId: process.env.FIREBASE_PROJECT_ID || 'tapturf'
      });
      console.log('✅ Firebase Admin initialized successfully');
    } else {
      // Last resort: Initialize without credentials (limited functionality)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'tapturf'
      });
      console.log('⚠️ Firebase Admin initialized without credentials - limited functionality');
    }
  }
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error);
  console.log('⚠️  Set one of the following environment variables:');
  console.log('   - FIREBASE_SERVICE_ACCOUNT_KEY (base64 encoded JSON)');
  console.log('   - FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  console.log('   - GOOGLE_APPLICATION_CREDENTIALS (path to service account file)');
}

module.exports = admin;
