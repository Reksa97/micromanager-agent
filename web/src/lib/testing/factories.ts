import { ObjectId } from 'mongodb';
import type { StoredMessage, MessageRole, MessageSource } from '@/lib/conversations';
import type { UserContextDocument } from '@/lib/user-context';

let idCounter = 0;

export class TestFactory {
  static resetCounters(): void {
    idCounter = 0;
  }

  static createUser(overrides: Record<string, unknown> = {}) {
    return {
      id: `user-${++idCounter}`,
      email: `user${idCounter}@test.com`,
      name: `Test User ${idCounter}`,
      createdAt: new Date(),
      ...overrides,
    };
  }

  static createMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
    const now = new Date();
    return {
      _id: new ObjectId(),
      id: `msg-${++idCounter}`,
      userId: 'test-user-id',
      role: 'user' as MessageRole,
      content: 'Test message content',
      type: 'text',
      source: 'web-user' as MessageSource,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  static createConversation(messageCount: number = 5): StoredMessage[] {
    const messages: StoredMessage[] = [];
    const baseTime = new Date();

    for (let i = 0; i < messageCount; i++) {
      const isUser = i % 2 === 0;
      const createdAt = new Date(baseTime.getTime() + i * 1000);
      
      messages.push(
        TestFactory.createMessage({
          role: isUser ? 'user' : 'assistant',
          content: isUser 
            ? `User message ${i}: What about topic ${i}?`
            : `Assistant response ${i}: Here's information about topic ${i}.`,
          createdAt,
          updatedAt: createdAt,
        })
      );
    }

    return messages;
  }

  static createToolCallMessage(toolName: string, args: Record<string, unknown> = {}): StoredMessage {
    return TestFactory.createMessage({
      role: 'assistant',
      content: '',
      type: 'state',
      metadata: {
        toolCalls: [{
          id: `call_${++idCounter}`,
          name: toolName,
          arguments: JSON.stringify(args),
        }],
      },
    });
  }

  static createToolResultMessage(toolCallId: string, result: string): StoredMessage {
    return TestFactory.createMessage({
      role: 'tool',
      content: result,
      type: 'tool',
      metadata: {
        toolCallId,
        toolName: 'test_tool',
      },
    });
  }

  static createUserContext(overrides: Partial<UserContextDocument['data']> = {}): UserContextDocument {
    const now = new Date();
    return {
      _id: new ObjectId(),
      userId: 'test-user-id',
      data: {
        preferences: {
          theme: 'dark',
          notifications: true,
        },
        projects: [
          { name: 'Project Alpha', status: 'active' },
          { name: 'Project Beta', status: 'planning' },
        ],
        notes: {
          daily: 'Stand up at 9am',
          reminders: ['Review PRs', 'Update docs'],
        },
        ...overrides,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  static createChatCompletionParams(overrides: Record<string, unknown> = {}) {
    return {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
      ],
      temperature: 0.7,
      stream: false,
      ...overrides,
    };
  }

  static createToolDefinition(name: string, description: string, parameters: Record<string, unknown> = {}) {
    return {
      type: 'function' as const,
      function: {
        name,
        description,
        parameters: {
          type: 'object',
          properties: parameters,
          required: Object.keys(parameters),
        },
      },
    };
  }

  static createStreamChunk(content: string, isLast: boolean = false) {
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4',
      choices: [{
        index: 0,
        delta: isLast ? {} : { content },
        finish_reason: isLast ? 'stop' : null,
      }],
    };
  }

  static async* createStreamResponse(text: string, chunkSize: number = 5) {
    const words = text.split(' ');
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, Math.min(i + chunkSize, words.length)).join(' ');
      yield TestFactory.createStreamChunk(
        i === 0 ? chunk : ` ${chunk}`,
        false
      );
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    yield TestFactory.createStreamChunk('', true);
  }
}

// Helper function for creating mock API responses
export function createMockApiResponse(data: unknown, status: number = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  };
}

// Helper for creating mock Next.js requests
export function createMockRequest(body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: new Headers(headers),
    method: 'POST',
    url: 'http://localhost:3000/api/test',
  } as unknown as Request;
}