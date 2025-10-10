# Micromanager Workflow System - Design Plan

## Current Issues to Fix First

### 1. First-Load Shows Every Time
**Problem**: GET `/api/auth/telegram` doesn't return `hasCompletedFirstLoad` from database
**Fix**: Query user from MongoDB and return actual `hasCompletedFirstLoad` status

### 2. Generic Step Labels
**Current**: "Checking calendar integrations..." (we're not actually doing this)
**Better**: Generic preparation steps that match what's happening

### 3. Post First-Load Greeting
After first-load completes, micromanager should send a personalized welcome message

---

## Micromanager Workflow System Architecture

### Overview
Build a flexible, workflow-based system where the micromanager agent can execute multi-step tasks through declarative workflow definitions created in an online builder.

### Core Components

```typescript
// src/lib/workflows/types.ts
export interface WorkflowInput {
  trigger: 'first_load' | 'user_message' | 'scheduled' | 'manual';
  userId: string;
  context?: {
    userName?: string;
    userMessage?: string;
    userTier?: string;
    linkedAccounts?: string[];
    conversationHistory?: Array<{role: string; content: string}>;
    [key: string]: unknown;
  };
}

export interface WorkflowOutput {
  success: boolean;
  message?: string;
  actions?: WorkflowAction[];
  error?: string;
}

export interface WorkflowAction {
  type: 'send_message' | 'schedule_task' | 'update_context' | 'call_tool' | 'wait';
  payload: unknown;
}

// Main workflow function signature
export type WorkflowFunction = (input: WorkflowInput) => Promise<WorkflowOutput>;
```

### File Structure

```
src/lib/workflows/
├── types.ts                           # Core workflow types
├── registry.ts                        # Workflow registry and loader
├── executor.ts                        # Workflow execution engine
├── main-micromanager.workflow.ts      # Main user-facing micromanager
├── first-load-greeting.workflow.ts    # First-load welcome message
└── ... (more workflows)
```

### Workflow Definitions

Each workflow file exports a `runWorkflow` function:

```typescript
// src/lib/workflows/main-micromanager.workflow.ts
export const runWorkflow = async (input: WorkflowInput): Promise<WorkflowOutput> => {
  // Workflow logic here
  // This will be generated from online workflow builder
  return {
    success: true,
    message: "Workflow completed",
    actions: []
  };
};
```

### Integration Points

#### 1. First Mini App Open (After First-Load)
**File**: `src/lib/workflows/first-load-greeting.workflow.ts`

**Workflow Purpose**:
- Welcome the user warmly
- Explain what micromanager does
- Ask about their goals/tasks for today
- Set up initial context

**Trigger**: When `hasCompletedFirstLoad` transitions from `false` → `true`

```typescript
export const runWorkflow = async (input: WorkflowInput): Promise<WorkflowOutput> => {
  const { userId, context } = input;

  // Step 1: Analyze user profile (tier, linked accounts, etc.)
  // Step 2: Generate personalized greeting with AI
  // Step 3: Send welcome message to chat
  // Step 4: Ask opening question to engage user

  return {
    success: true,
    actions: [
      {
        type: 'send_message',
        payload: {
          role: 'micromanager',
          content: `Welcome ${context?.userName}! I'm your Micromanager...`
        }
      }
    ]
  };
};
```

#### 2. User Sends Message
**File**: `src/lib/workflows/main-micromanager.workflow.ts`

**Workflow Purpose**:
- Main intelligence of the micromanager
- Analyze user intent
- Determine if tools are needed (calendar, search, etc.)
- Provide personalized, context-aware responses
- Maintain conversation flow
- Track tasks and follow up

**Trigger**: User sends a message in chat

```typescript
export const runWorkflow = async (input: WorkflowInput): Promise<WorkflowOutput> => {
  const { userId, context } = input;
  const userMessage = context?.userMessage;

  // Step 1: Load user context (past conversations, tasks, calendar)
  // Step 2: Analyze user intent (is this a task? question? request?)
  // Step 3: Determine required tools (calendar check, search, etc.)
  // Step 4: Execute tool calls if needed
  // Step 5: Generate intelligent response with AI
  // Step 6: Update user context
  // Step 7: Schedule follow-ups if needed

  return {
    success: true,
    actions: [
      {
        type: 'call_tool',
        payload: { tool: 'calendar', action: 'check_events' }
      },
      {
        type: 'send_message',
        payload: {
          role: 'micromanager',
          content: `Based on your calendar...`
        }
      },
      {
        type: 'update_context',
        payload: { lastInteraction: new Date(), taskTracking: {...} }
      }
    ]
  };
};
```

### Workflow Execution Engine

```typescript
// src/lib/workflows/executor.ts
import { WorkflowInput, WorkflowOutput } from './types';
import { getWorkflow } from './registry';

export async function executeWorkflow(
  workflowName: string,
  input: WorkflowInput
): Promise<WorkflowOutput> {
  try {
    const workflow = await getWorkflow(workflowName);
    const result = await workflow(input);

    // Execute actions from workflow output
    await processWorkflowActions(result.actions || [], input.userId);

    return result;
  } catch (error) {
    console.error(`[Workflow] Error executing ${workflowName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function processWorkflowActions(
  actions: WorkflowAction[],
  userId: string
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'send_message':
        await sendMessageToUser(userId, action.payload);
        break;
      case 'call_tool':
        await executeTool(action.payload);
        break;
      case 'update_context':
        await updateUserContext(userId, action.payload);
        break;
      case 'schedule_task':
        await scheduleTask(userId, action.payload);
        break;
      case 'wait':
        await wait(action.payload);
        break;
    }
  }
}
```

### Workflow Registry

```typescript
// src/lib/workflows/registry.ts
import { WorkflowFunction } from './types';

const workflows = new Map<string, WorkflowFunction>();

// Register workflows
import { runWorkflow as mainMicromanager } from './main-micromanager.workflow';
import { runWorkflow as firstLoadGreeting } from './first-load-greeting.workflow';

workflows.set('main-micromanager', mainMicromanager);
workflows.set('first-load-greeting', firstLoadGreeting);

export function getWorkflow(name: string): WorkflowFunction {
  const workflow = workflows.get(name);
  if (!workflow) {
    throw new Error(`Workflow '${name}' not found`);
  }
  return workflow;
}

export function registerWorkflow(name: string, workflow: WorkflowFunction): void {
  workflows.set(name, workflow);
}
```

### API Endpoints

#### Execute Workflow
```typescript
// POST /api/workflows/execute
{
  "workflowName": "main-micromanager",
  "trigger": "user_message",
  "userId": "...",
  "context": {
    "userMessage": "What's on my calendar today?"
  }
}
```

### Integration with Telegram Chat

```typescript
// src/features/telegram/components/telegram-chat-panel.tsx
const handleSendMessage = async (message: string) => {
  // Add user message to UI
  addMessage({ role: 'user', content: message });

  // Execute main micromanager workflow
  const result = await executeWorkflow('main-micromanager', {
    trigger: 'user_message',
    userId: user.id,
    context: {
      userMessage: message,
      userName: user.name,
      userTier: user.tier,
      conversationHistory: messages
    }
  });

  // Workflow actions (like sending messages) are handled by executor
};
```

### Integration with First-Load

```typescript
// src/features/telegram/components/telegram-mini-app-authenticated.tsx
const handleFirstLoadComplete = async () => {
  // Mark first load as complete in DB
  await fetch("/api/user/complete-first-load", { ... });

  // Execute first-load greeting workflow
  await executeWorkflow('first-load-greeting', {
    trigger: 'first_load',
    userId: user.id,
    context: {
      userName: user.name,
      userTier: user.tier
    }
  });

  setShowFirstLoad(false);
};
```

## Micromanager Personality & Behavior

### Core Characteristics
- **Proactive**: Anticipates needs, suggests actions
- **Contextual**: Remembers past conversations, understands user patterns
- **Efficient**: Gets to the point, respects user's time
- **Personalized**: Adapts tone and suggestions based on user tier and preferences
- **Tool-Savvy**: Seamlessly uses calendar, search, and other tools

### Example Interactions

#### First Load Greeting
```
Micromanager: Hey Alex! 👋 I'm your Micromanager - think of me as your AI
assistant who actually knows what you need before you ask.

I can help you:
• Manage your calendar and schedule
• Track your tasks and goals
• Answer questions and search for info
• Stay on top of important stuff

What's on your plate today?
```

#### Regular Message Handling
```
User: What's on my calendar today?

Micromanager: [checks calendar tool]
You've got 3 things today:
• 10am - Team standup (30 min)
• 2pm - Client review (1 hour)
• 4pm - Project planning (45 min)

Looks pretty packed. Want me to block some focus time between meetings?
```

## Implementation Steps

1. **Fix immediate bugs** (hasCompletedFirstLoad, step labels)
2. **Create workflow infrastructure** (types, registry, executor)
3. **Build first-load-greeting workflow online**
4. **Export and integrate first-load-greeting.workflow.ts**
5. **Build main-micromanager workflow online**
6. **Export and integrate main-micromanager.workflow.ts**
7. **Test end-to-end flow**
8. **Iterate and improve based on usage**

## Workflow Builder Integration

You mentioned creating workflows online and exporting code. The workflow files should:

1. Be generated from your online workflow builder
2. Export a standardized `runWorkflow` function
3. Follow the `WorkflowInput` → `WorkflowOutput` contract
4. Be drop-in replaceable (just overwrite the file)
5. Handle errors gracefully
6. Log execution steps for debugging

## Success Metrics

- First-load completion rate
- User engagement (messages sent after first-load)
- Workflow execution success rate
- Response relevance (user feedback)
- Tool usage effectiveness (calendar, search hits)
