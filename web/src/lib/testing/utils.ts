import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import type { Session } from 'next-auth';

let mongoServer: MongoMemoryServer | null = null;
let mongoClient: MongoClient | null = null;

export async function setupTestDatabase(): Promise<MongoClient> {
  if (mongoClient) return mongoClient;

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  
  return mongoClient;
}

export async function teardownTestDatabase(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
  
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

export async function clearDatabase(): Promise<void> {
  if (!mongoClient) return;
  
  const db = mongoClient.db();
  const collections = await db.collections();
  
  await Promise.all(
    collections.map(collection => collection.deleteMany({}))
  );
}

export function mockAuth(session: Partial<Session> | null = null) {
  const mockSession: Session | null = session ? {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      ...session.user,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...session,
  } : null;

  // Mock the auth function
  jest.mock('@/auth', () => ({
    auth: jest.fn().mockResolvedValue(mockSession),
  }));

  return mockSession;
}

export function mockEnvironment(overrides: Record<string, string> = {}) {
  const original = { ...process.env };
  
  Object.assign(process.env, {
    MONGODB_URI: 'mongodb://localhost:27017/test',
    NEXTAUTH_SECRET: 'test-secret',
    NEXTAUTH_URL: 'http://localhost:3000',
    OPENAI_API_KEY: 'test-key',
    ...overrides,
  });

  return () => {
    process.env = original;
  };
}

export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Condition not met within timeout');
}

export function captureConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
  
  const captured = {
    logs: [] as unknown[][],
    errors: [] as unknown[][],
    warnings: [] as unknown[][],
  };
  
  console.log = (...args) => captured.logs.push(args);
  console.error = (...args) => captured.errors.push(args);
  console.warn = (...args) => captured.warnings.push(args);
  
  return {
    captured,
    restore: () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    },
  };
}

export async function measurePerformance<T>(
  fn: () => Promise<T>,
  label: string = 'Operation'
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  console.log(`${label} took ${duration.toFixed(2)}ms`);
  
  return { result, duration };
}

// Helper to create a test context with all necessary mocks
export interface TestContext {
  db: MongoClient;
  session: Session | null;
  restoreEnv: () => void;
}

export async function createTestContext(
  options: {
    authenticated?: boolean;
    session?: Partial<Session>;
    env?: Record<string, string>;
  } = {}
): Promise<TestContext> {
  const db = await setupTestDatabase();
  const session = options.authenticated !== false 
    ? mockAuth(options.session) 
    : null;
  const restoreEnv = mockEnvironment(options.env);
  
  return {
    db,
    session,
    restoreEnv,
  };
}

export async function cleanupTestContext(context: TestContext): Promise<void> {
  context.restoreEnv();
  await teardownTestDatabase();
}