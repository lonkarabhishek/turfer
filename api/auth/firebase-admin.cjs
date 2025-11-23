// Firebase Admin SDK initialization
const admin = require('firebase-admin');

// Initialize Firebase Admin with your project config
// You can either use a service account JSON file or initialize with defaults
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'tapturf'
    });
    console.log('✅ Firebase Admin initialized successfully');
  }
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error);
  console.log('⚠️  You may need to set GOOGLE_APPLICATION_CREDENTIALS environment variable');
  console.log('   or initialize with a service account key file');
}

module.exports = admin;
