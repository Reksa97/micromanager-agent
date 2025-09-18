import { testConfig, isIntegrationTest } from "./config";
import type {
  ChatCompletionChunk,
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const model = "gpt-5-mini";

interface MockResponse {
  type: "completion" | "stream" | "tool_call";
  response: unknown;
  delay?: number;
}

interface RecordedInteraction {
  request: {
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    model: string;
  };
  response: MockResponse;
  timestamp: string;
}

export class OpenAIMock {
  private recordings: Map<string, RecordedInteraction[]> = new Map();
  private currentRecording: RecordedInteraction[] = [];
  private responseIndex = 0;

  constructor(
    private realClient?: {
      chat: { completions: { create: (params: unknown) => Promise<unknown> } };
    }
  ) {}

  async chatCompletion(
    params: Record<string, unknown>
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    if (isIntegrationTest() && this.realClient) {
      const response = await this.realClient.chat.completions.create(params);
      if (testConfig.recordResponses) {
        this.recordInteraction(params, response);
      }
      return response as ChatCompletion | AsyncIterable<ChatCompletionChunk>;
    }

    // Mock response
    const mockResponse = this.getMockResponse(params);

    if (params.stream) {
      return this.createMockStream(mockResponse);
    }

    await this.simulateDelay(mockResponse.delay || 0);
    return mockResponse.response as ChatCompletion;
  }

  private getMockResponse(params: Record<string, unknown>): MockResponse {
    const hasTools =
      params.tools && (params.tools as ChatCompletionTool[]).length > 0;
    const messages = params.messages as ChatCompletionMessageParam[];
    const lastMessage = messages[messages.length - 1];

    // Check for specific patterns to return appropriate responses
    if (
      hasTools &&
      (lastMessage as { content?: string }).content?.includes("context")
    ) {
      return this.createToolCallResponse();
    }

    if (params.stream) {
      return this.createStreamResponse(
        (lastMessage as { content?: string }).content || "Hello"
      );
    }

    return this.createCompletionResponse(
      (lastMessage as { content?: string }).content || "Hello"
    );
  }

  private createCompletionResponse(userMessage: string): MockResponse {
    return {
      type: "completion",
      response: {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `Mock response to: "${userMessage}". This is a test response.`,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      },
      delay: testConfig.mockDelay,
    };
  }

  private createToolCallResponse(): MockResponse {
    return {
      type: "tool_call",
      response: {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: `call_${Date.now()}`,
                  type: "function",
                  function: {
                    name: "read_user_context",
                    arguments: JSON.stringify({ format: "json" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      },
      delay: testConfig.mockDelay,
    };
  }

  private createStreamResponse(userMessage: string): MockResponse {
    const responseText = `Stream response to: "${userMessage}". This is streaming.`;
    const chunks = responseText.split(" ").map(
      (word, index) =>
        ({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk" as const,
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: {
                content: index === 0 ? word : ` ${word}`,
              },
              finish_reason: null,
            },
          ],
        } as ChatCompletionChunk)
    );

    // Add final chunk
    chunks.push({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk" as const,
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop" as const,
        },
      ],
    } as ChatCompletionChunk);

    return {
      type: "stream",
      response: chunks,
      delay: testConfig.mockDelay,
    };
  }

  private async *createMockStream(
    mockResponse: MockResponse
  ): AsyncIterable<ChatCompletionChunk> {
    const chunks = mockResponse.response as ChatCompletionChunk[];

    for (const chunk of chunks) {
      await this.simulateDelay(mockResponse.delay || 10);
      yield chunk;
    }
  }

  private async simulateDelay(
    ms: number = testConfig.mockDelay
  ): Promise<void> {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private recordInteraction(
    request: Record<string, unknown>,
    response: unknown
  ): void {
    const interaction: RecordedInteraction = {
      request: {
        messages: request.messages as ChatCompletionMessageParam[],
        tools: request.tools as ChatCompletionTool[] | undefined,
        model: request.model as string,
      },
      response: {
        type: request.stream
          ? "stream"
          : (response as ChatCompletion).choices[0]?.finish_reason ===
            "tool_calls"
          ? "tool_call"
          : "completion",
        response: response,
      },
      timestamp: new Date().toISOString(),
    };

    this.currentRecording.push(interaction);
  }

  async saveRecordings(testName: string): Promise<void> {
    if (this.currentRecording.length === 0) return;

    const fs = await import("fs/promises");
    const path = await import("path");

    const fileName = `${testName.replace(/\s+/g, "-").toLowerCase()}.json`;
    const filePath = path.join(
      testConfig.fixturesPath,
      "openai-responses",
      fileName
    );

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify(this.currentRecording, null, 2)
    );

    this.currentRecording = [];
  }

  async loadRecordings(testName: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const fileName = `${testName.replace(/\s+/g, "-").toLowerCase()}.json`;
    const filePath = path.join(
      testConfig.fixturesPath,
      "openai-responses",
      fileName
    );

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const recordings = JSON.parse(content) as RecordedInteraction[];
      this.recordings.set(testName, recordings);
      this.responseIndex = 0;
    } catch {
      // No recordings found, will use generated mocks
    }
  }

  reset(): void {
    this.responseIndex = 0;
    this.currentRecording = [];
  }
}

// Factory function to create mock OpenAI client
export function createMockOpenAI(realClient?: {
  chat: { completions: { create: (params: unknown) => Promise<unknown> } };
}) {
  const mock = new OpenAIMock(realClient);

  return {
    chat: {
      completions: {
        create: (params: Record<string, unknown>) =>
          mock.chatCompletion(params),
      },
    },
    _mock: mock, // Expose mock for testing utilities
  };
}
