import { 
  createTestContext, 
  cleanupTestContext, 
  clearDatabase,
  type TestContext 
} from '@/lib/testing/utils';
import { TestFactory } from '@/lib/testing/factories';
import { 
  getUserContextDocument,
  setUserContextValue,
  deleteUserContextValue,
  formatContextForPrompt,
} from '@/lib/user-context';
import { createServerContextToolset } from '@/lib/agent/context-tools.server';

describe('Context Tools', () => {
  let context: TestContext;
  const userId = 'test-user-123';

  beforeAll(async () => {
    context = await createTestContext({ authenticated: true });
  });

  afterAll(async () => {
    await cleanupTestContext(context);
  });

  beforeEach(async () => {
    await clearDatabase();
    TestFactory.resetCounters();
  });

  describe('User Context Document', () => {
    it('should create a new context document if none exists', async () => {
      const doc = await getUserContextDocument(userId);
      
      expect(doc).toBeDefined();
      expect(doc.userId).toBe(userId);
      expect(doc.data).toEqual({});
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it('should return existing context document', async () => {
      // First call creates it
      const doc1 = await getUserContextDocument(userId);
      await setUserContextValue(userId, ['test', 'value'], 'hello');
      
      // Second call returns existing
      const doc2 = await getUserContextDocument(userId);
      
      expect(doc2.data).toEqual({ test: { value: 'hello' } });
      expect(doc2._id).toEqual(doc1._id);
    });
  });

  describe('Context Value Operations', () => {
    it('should set nested values correctly', async () => {
      await setUserContextValue(userId, ['preferences', 'theme'], 'dark');
      await setUserContextValue(userId, ['preferences', 'language'], 'en');
      await setUserContextValue(userId, ['projects', '0', 'name'], 'Alpha');
      
      const doc = await getUserContextDocument(userId);
      
      expect(doc.data).toEqual({
        preferences: {
          theme: 'dark',
          language: 'en',
        },
        projects: {
          '0': { name: 'Alpha' },
        },
      });
    });

    it('should delete values correctly', async () => {
      await setUserContextValue(userId, ['a', 'b', 'c'], 'value1');
      await setUserContextValue(userId, ['a', 'b', 'd'], 'value2');
      await setUserContextValue(userId, ['a', 'e'], 'value3');
      
      await deleteUserContextValue(userId, ['a', 'b', 'c']);
      
      const doc = await getUserContextDocument(userId);
      
      expect(doc.data).toEqual({
        a: {
          b: { d: 'value2' },
          e: 'value3',
        },
      });
    });

    it('should handle arrays and complex values', async () => {
      const complexValue = {
        tasks: ['task1', 'task2'],
        metadata: { count: 2, active: true },
      };
      
      await setUserContextValue(userId, ['workspace'], complexValue);
      const doc = await getUserContextDocument(userId);
      
      expect(doc.data.workspace).toEqual(complexValue);
    });

    it('should reject invalid path segments', async () => {
      await expect(
        setUserContextValue(userId, [], 'value')
      ).rejects.toThrow('Path segments must be a non-empty array');
      
      await expect(
        setUserContextValue(userId, ['', 'test'], 'value')
      ).rejects.toThrow('Each path segment must be a non-empty string');
      
      await expect(
        setUserContextValue(userId, ['test\0'], 'value')
      ).rejects.toThrow('Path segments cannot include null bytes');
    });
  });

  describe('Context Formatting', () => {
    it('should format empty context correctly', () => {
      const doc = TestFactory.createUserContext({});
      doc.data = {};
      
      const formatted = formatContextForPrompt(doc);
      
      expect(formatted).toContain('User context snapshot');
      expect(formatted).toContain('empty');
      expect(formatted).toContain(doc.updatedAt.toISOString());
    });

    it('should format populated context correctly', () => {
      const doc = TestFactory.createUserContext({
        preferences: { theme: 'dark' },
        notes: ['Remember to review PRs'],
      });
      
      const formatted = formatContextForPrompt(doc);
      
      expect(formatted).toContain('User context snapshot');
      expect(formatted).toContain('theme');
      expect(formatted).toContain('dark');
      expect(formatted).toContain('Remember to review PRs');
    });
  });

  describe('Server Context Toolset', () => {
    let toolset: ReturnType<typeof createServerContextToolset>;

    beforeEach(() => {
      toolset = createServerContextToolset(userId);
    });

    it('should create toolset with correct tools', () => {
      expect(toolset.name).toBe('micromanager_user_context');
      expect(toolset.tools).toHaveLength(3);
      
      const toolNames = toolset.tools.map(t => t.function.name);
      expect(toolNames).toContain('read_user_context');
      expect(toolNames).toContain('set_user_context_entry');
      expect(toolNames).toContain('delete_user_context_entry');
    });

    it('should handle read_user_context tool', async () => {
      await setUserContextValue(userId, ['test'], 'value');
      
      const handler = toolset.handlers.get('read_user_context');
      const result = await handler?.({ format: 'json' });
      
      expect(result?.output).toBeDefined();
      const parsed = JSON.parse(result!.output);
      expect(parsed.test).toBe('value');
    });

    it('should handle set_user_context_entry tool', async () => {
      const handler = toolset.handlers.get('set_user_context_entry');
      const result = await handler?.({
        segments: ['preferences', 'notifications'],
        value: { email: true, push: false },
      });
      
      expect(result?.output).toContain('Stored value at path');
      expect(result?.output).toContain('preferences.notifications');
      expect(result?.metadata?.operation).toBe('set');
      
      const doc = await getUserContextDocument(userId);
      expect(doc.data.preferences?.notifications).toEqual({
        email: true,
        push: false,
      });
    });

    it('should handle delete_user_context_entry tool', async () => {
      await setUserContextValue(userId, ['temp', 'data'], 'to-delete');
      
      const handler = toolset.handlers.get('delete_user_context_entry');
      const result = await handler?.({
        segments: ['temp', 'data'],
      });
      
      expect(result?.output).toContain('Removed value at path');
      expect(result?.metadata?.operation).toBe('delete');
      
      const doc = await getUserContextDocument(userId);
      expect(doc.data.temp?.data).toBeUndefined();
    });

    it('should validate tool parameters', async () => {
      const setHandler = toolset.handlers.get('set_user_context_entry');
      
      await expect(
        setHandler?.({ segments: null, value: 'test' })
      ).rejects.toThrow('segments must be a non-empty array');
      
      await expect(
        setHandler?.({ segments: ['test'] })
      ).rejects.toThrow('value must be provided');
    });
  });

  describe('Tool Integration', () => {
    it('should handle full tool call flow', async () => {
      const toolset = createServerContextToolset(userId);
      
      // Simulate a conversation with tool calls
      const operations = [
        {
          tool: 'set_user_context_entry',
          args: {
            segments: ['current_project'],
            value: 'Micromanager Agent',
          },
        },
        {
          tool: 'set_user_context_entry',
          args: {
            segments: ['tasks', 'pending'],
            value: ['Write tests', 'Review PRs', 'Update docs'],
          },
        },
        {
          tool: 'read_user_context',
          args: { format: 'text' },
        },
      ];
      
      const results = [];
      for (const op of operations) {
        const handler = toolset.handlers.get(op.tool);
        if (handler) {
          const result = await handler(op.args);
          results.push(result);
        }
      }
      
      expect(results).toHaveLength(3);
      expect(results[2].output).toContain('Micromanager Agent');
      expect(results[2].output).toContain('Write tests');
    });
  });
});