import { config } from 'dotenv';
import { seedDatabase } from './utils/seedData';
import DatabaseConnection from './database/connection';

// Load environment variables
config();

async function runSeed() {
  try {
    console.log('🚀 Starting database seeding process...');
    
    // Initialize database connection
    DatabaseConnection.getInstance();
    
    // Wait a bit for database to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run seeding
    await seedDatabase();
    
    console.log('✅ Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

runSeed();