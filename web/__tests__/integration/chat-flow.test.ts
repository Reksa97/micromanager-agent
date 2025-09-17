import { 
  createTestContext, 
  cleanupTestContext, 
  clearDatabase,
  waitForCondition,
  measurePerformance,
  type TestContext 
} from '@/lib/testing/utils';
import { TestFactory, createMockRequest } from '@/lib/testing/factories';
import { createMockOpenAI } from '@/lib/testing/openai-mock';
import { isIntegrationTest, testConfig } from '@/lib/testing/config';
import { insertMessage, getRecentMessages } from '@/lib/conversations';
import { setUserContextValue } from '@/lib/user-context';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Mock OpenAI if not in integration mode
let mockOpenAI: ReturnType<typeof createMockOpenAI>;

jest.mock('@/lib/openai', () => {
  const actual = jest.requireActual('@/lib/openai');
  if (isIntegrationTest()) {
    return actual;
  }
  
  // Return mock in unit test mode
  mockOpenAI = createMockOpenAI();
  return {
    ...actual,
    openai: mockOpenAI,
  };
});

describe('Chat Flow Integration', () => {
  let context: TestContext;
  const userId = 'test-user-123';

  beforeAll(async () => {
    context = await createTestContext({ 
      authenticated: true,
      session: { user: { id: userId } },
    });
    
    if (!isIntegrationTest() && mockOpenAI?._mock) {
      await mockOpenAI._mock.loadRecordings('chat-flow');
    }
  });

  afterAll(async () => {
    if (testConfig.recordResponses && mockOpenAI?._mock) {
      await mockOpenAI._mock.saveRecordings('chat-flow');
    }
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    await clearDatabase();
    TestFactory.resetCounters();
    mockOpenAI?._mock?.reset();
  });

  describe('Simple Chat Completion', () => {
    it('should handle basic user message and assistant response', async () => {
      // This test runs against mock OR real API based on USE_REAL_API env
      const { POST } = await import('@/app/api/chat/route');
      
      const request = createMockRequest({
        message: 'What is the capital of France?',
        temperature: 0.5,
      });

      const response = await measurePerformance(
        () => POST(request),
        'Chat completion'
      );

      expect(response.result.status).toBe(200);
      
      const data = await response.result.json();
      expect(data.messageId).toBeDefined();
      expect(data.content).toBeDefined();
      
      if (!isIntegrationTest()) {
        expect(data.content).toContain('Mock response');
      } else {
        // Real API should mention Paris
        expect(data.content.toLowerCase()).toContain('paris');
      }

      // Verify messages were stored
      const messages = await getRecentMessages(userId, 10);
      expect(messages).toHaveLength(2); // user + assistant
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      
      console.log(`Response time: ${response.duration}ms`);
    });
  });

  describe('Context-Aware Conversations', () => {
    it('should use user context in responses', async () => {
      // Set up user context
      await setUserContextValue(userId, ['preferences', 'name'], 'Alice');
      await setUserContextValue(userId, ['current_project'], 'Micromanager');
      await setUserContextValue(userId, ['tasks'], ['Write tests', 'Review code']);

      const { POST } = await import('@/app/api/chat/route');
      
      const request = createMockRequest({
        message: 'What am I working on?',
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      
      if (isIntegrationTest()) {
        // Real API should reference the context
        expect(data.content).toMatch(/Micromanager|tests|review/i);
      }
    });

    it('should handle tool calls for context manipulation', async () => {
      const { POST } = await import('@/app/api/chat/route');
      
      // Create a conversation that triggers tool use
      const request = createMockRequest({
        message: 'Add "Deploy to production" to my tasks list',
      });

      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      
      // Check that tool was called (in messages)
      const messages = await getRecentMessages(userId, 10);
      const toolMessages = messages.filter(m => m.type === 'tool');
      
      if (isIntegrationTest()) {
        // Real API might actually call the tool
        console.log('Tool messages found:', toolMessages.length);
      }
    });
  });

  describe('Multi-turn Conversations', () => {
    it('should maintain conversation context across turns', async () => {
      const { POST } = await import('@/app/api/chat/route');
      
      // First turn
      const request1 = createMockRequest({
        message: 'My name is Bob and I work on Project Zeus',
      });
      
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);
      
      // Second turn - should remember context
      const request2 = createMockRequest({
        message: 'What project am I working on?',
      });
      
      const response2 = await POST(request2);
      const data2 = await response2.json();
      
      expect(response2.status).toBe(200);
      
      if (isIntegrationTest()) {
        // Real API should remember Project Zeus
        expect(data2.content).toMatch(/Zeus/i);
      }
      
      // Verify conversation history
      const messages = await getRecentMessages(userId, 10);
      expect(messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant minimum
    });

    it('should handle context window limits gracefully', async () => {
      // Create a long conversation history
      const longHistory = TestFactory.createConversation(50);
      
      for (const msg of longHistory) {
        await insertMessage({ ...msg, userId });
      }
      
      const { POST } = await import('@/app/api/chat/route');
      
      const request = createMockRequest({
        message: 'Summarize our conversation',
      });
      
      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.content).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid requests gracefully', async () => {
      const { POST } = await import('@/app/api/chat/route');
      
      const request = createMockRequest({
        // Missing required 'message' field
        temperature: 0.5,
      });
      
      const response = await POST(request);
      expect(response.status).toBe(422);
      
      const error = await response.json();
      expect(error.error).toBe('Invalid payload');
      expect(error.details).toBeDefined();
    });

    it('should handle authentication errors', async () => {
      // Override auth for this test
      jest.doMock('@/auth', () => ({
        auth: jest.fn().mockResolvedValue(null),
      }));
      
      const { POST } = await import('@/app/api/chat/route');
      
      const request = createMockRequest({
        message: 'Hello',
      });
      
      const response = await POST(request);
      expect(response.status).toBe(401);
      
      const error = await response.json();
      expect(error.error).toBe('Unauthorized');
    });
  });

  describe('Streaming Responses', () => {
    it('should simulate streaming in mock mode', async () => {
      if (isIntegrationTest()) {
        console.log('Skipping streaming test in integration mode');
        return;
      }

      // Direct test of streaming mock
      const chunks: any[] = [];
      const stream = await mockOpenAI.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });

      for await (const chunk of stream as any) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe('stop');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete simple queries quickly', async () => {
      const { POST } = await import('@/app/api/chat/route');
      
      const timings: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        const request = createMockRequest({
          message: `Test message ${i}`,
        });
        
        const { duration } = await measurePerformance(
          () => POST(request),
          `Request ${i + 1}`
        );
        
        timings.push(duration);
      }
      
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      console.log(`Average response time: ${avgTime.toFixed(2)}ms`);
      
      if (!isIntegrationTest()) {
        // Mock responses should be very fast
        expect(avgTime).toBeLessThan(500);
      } else {
        // Real API calls should complete within reasonable time
        expect(avgTime).toBeLessThan(5000);
      }
    });
  });
});