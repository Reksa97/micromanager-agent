// Add custom jest matchers
require('@testing-library/jest-dom');

// Mock server-only module
jest.mock('server-only', () => ({}), { virtual: true });

// Mock MongoDB client for faster tests
const { mockMongoClient } = require('./src/lib/testing/db-mock');
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: mockMongoClient,
  getMongoClient: jest.fn(() => Promise.resolve(mockMongoClient)),
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.OPENAI_API_KEY = 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    reload: jest.fn(),
    forward: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '/',
}));

// Global test utilities
global.createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
});

global.createMockSession = (overrides = {}) => ({
  user: global.createMockUser(),
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

// Silence console during tests (unless debugging)
if (process.env.DEBUG !== 'true') {
  global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  };
}