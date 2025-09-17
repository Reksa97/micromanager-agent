export interface TestConfig {
  useRealAPI: boolean;
  recordResponses: boolean;
  mockDelay: number;
  fixturesPath: string;
}

export const testConfig: TestConfig = {
  useRealAPI: process.env.USE_REAL_API === 'true',
  recordResponses: process.env.RECORD_RESPONSES === 'true',
  mockDelay: parseInt(process.env.MOCK_DELAY || '50', 10),
  fixturesPath: process.env.FIXTURES_PATH || '__tests__/fixtures',
};

export function isIntegrationTest(): boolean {
  return testConfig.useRealAPI;
}

export function shouldRecord(): boolean {
  return testConfig.recordResponses && testConfig.useRealAPI;
}