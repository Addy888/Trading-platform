/**
 * Jest Test Setup
 * 
 * Global setup for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

// Increase timeout for slow tests
jest.setTimeout(30000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(), // Suppress console.log in tests
  debug: jest.fn(), // Suppress console.debug in tests
  info: jest.fn(), // Suppress console.info in tests
  // Keep error and warn for debugging
} as any;

// Global test utilities
export {};
