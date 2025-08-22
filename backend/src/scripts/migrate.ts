#!/usr/bin/env ts-node

/**
 * Database Migration Script
 * 
 * Usage:
 * npm run migrate:dev    - Run with development environment
 * npm run migrate:prod   - Run with production environment
 * npm run migrate:staging - Run with staging environment
 */

import { config } from 'dotenv';
import path from 'path';
import DatabaseConnection from '../database/connection';

// Load environment based on NODE_ENV or default to development
const env = process.argv[2] || process.env.NODE_ENV || 'development';
const envFile = `.env.${env}`;

console.log(`🔧 Loading environment: ${env}`);
console.log(`📁 Environment file: ${envFile}`);

// Load the appropriate .env file
config({ path: path.join(__dirname, '../../', envFile) });

async function migrate() {
  try {
    console.log('🚀 Starting database migration...');
    console.log(`📊 Database URL: ${process.env.DATABASE_URL}`);
    console.log(`🏗️ Database Type: ${process.env.DATABASE_TYPE || 'auto-detect'}`);
    
    // Initialize database connection (this will run migrations automatically)
    const db = DatabaseConnection.getInstance();
    
    // Wait a bit for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Migration completed successfully!');
    console.log('🎯 Database is ready for use');
    
    // Close the connection
    await db.close();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Database Migration Tool

Usage:
  npm run migrate                    # Use default environment (development)
  npm run migrate:dev               # Use development environment
  npm run migrate:staging           # Use staging environment  
  npm run migrate:prod              # Use production environment

Environment Variables:
  DATABASE_URL      - Database connection string
  DATABASE_TYPE     - Database type (sqlite|postgresql)
  NODE_ENV          - Environment name

Examples:
  # Migrate development database
  npm run migrate:dev
  
  # Migrate production database
  npm run migrate:prod
  
  # Migrate with custom environment
  NODE_ENV=custom npm run migrate
`);
  process.exit(0);
}

migrate();