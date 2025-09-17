# Micromanager Agent Implementation Plan

## Already Implemented ✅
- Basic tool system with Zod validation
- User context management (MongoDB collection)
- Context tools (read, set, delete)
- Tool calling in chat endpoint
- Tool integration in realtime agent
- Context API endpoint

## Build Order

### Phase 1: Extend Tool System
1. **Create tool registry** (`lib/tools/registry.ts`)
   - Central tool registration
   - Tool categories and permissions
   - Dynamic tool loading

2. **Add memory tools** (`lib/tools/memory.tools.ts`)
   - Short-term memory storage
   - Memory search/retrieval
   - Auto-tagging with embeddings (LLM shortcut)

3. **Add quick search tools** (`lib/tools/search.tools.ts`)
   - Web search wrapper
   - Conversation history search
   - LLM shortcut: Generate search queries from context

### Phase 2: Task Queue & Scheduler
4. **Create task model** (`lib/tasks/models.ts`)
   - Task interface and types
   - Priority levels
   - Task status management

5. **Build task queue** (`lib/tasks/queue.ts`)
   - In-memory queue (upgrade to Redis later)
   - Priority sorting
   - Dependency handling

6. **Create task scheduler** (`lib/tasks/scheduler.ts`)
   - Task execution worker
   - Retry logic
   - Status updates

### Phase 3: Normal Agent & Delegation
7. **Create Normal Agent service** (`lib/agents/normal.agent.ts`)
   - Standalone background processor
   - Connect to task queue
   - Heavy tool execution

8. **Add analysis tools** (`lib/tools/analysis.tools.ts`)
   - Data analysis functions
   - Report generation
   - LLM shortcut: Agent writes own analysis functions

9. **Create delegation tool** (`lib/tools/delegation.tools.ts`)
   - Realtime → Normal handoff
   - Task creation from delegation
   - Status tracking

10. **Build agent bridge** (`lib/agents/bridge.ts`)
    - Inter-agent messaging
    - Task result callbacks
    - Error handling

### Phase 4: Calendar Integration
11. **Calendar events collection** (`lib/calendar/model.ts`)
    - Event schema
    - Recurring events
    - Task linking

12. **Calendar service** (`lib/calendar/service.ts`)
    - Availability checking
    - Event creation/update
    - LLM shortcut: Parse natural language → events

13. **Agent modes** (`lib/agents/modes.ts`)
    - Focus/Active/Idle states
    - Mode transitions
    - Calendar-based switching

14. **Calendar-aware scheduler** (`lib/tasks/calendar-scheduler.ts`)
    - Schedule around events
    - Focus time protection
    - Smart rescheduling

### Phase 5: Advanced Memory
15. **Memory service** (`lib/memory/service.ts`)
    - Short/long-term storage
    - Decay and promotion
    - Association graph

16. **Memory embeddings** (`lib/memory/embeddings.ts`)
    - Vector storage (MongoDB Atlas Search)
    - Semantic search
    - LLM shortcut: Auto-generate embeddings

17. **Memory consolidation** (`lib/memory/consolidation.ts`)
    - Pattern detection
    - Memory compression
    - Insight generation

### Phase 6: Idle Intelligence
18. **Idle mode service** (`lib/agents/idle.service.ts`)
    - Background research
    - Interest tracking
    - News aggregation

19. **Insight generator** (`lib/insights/generator.ts`)
    - Pattern analysis
    - Prediction generation
    - LLM shortcut: Generate insights from patterns

### Phase 7: API Endpoints
20. **Task management API** (`app/api/tasks/route.ts`)
    - CRUD operations
    - Queue management
    - Status tracking

21. **Calendar API** (`app/api/calendar/route.ts`)
    - Event management
    - Availability checking
    - Integration endpoints

22. **Memory API** (`app/api/memory/route.ts`)
    - Memory operations
    - Search endpoints
    - Consolidation triggers

### Phase 8: Real-time Updates
23. **WebSocket service** (`lib/realtime/websocket.ts`)
    - Socket.io setup
    - Event broadcasting
    - Connection management

24. **Task notifications** (`lib/realtime/notifications.ts`)
    - Status updates
    - Progress tracking
    - Completion alerts

### Phase 9: UI Components
25. **Context viewer** (`features/context-viewer/`)
    - Display current context
    - Inline editing
    - Field management

26. **Task dashboard** (`features/task-manager/`)
    - Task list view
    - Status indicators
    - Priority management

27. **Calendar view** (`features/calendar-view/`)
    - Event display
    - Mode indicators
    - Scheduling interface

28. **Tool execution viewer** (`features/tool-viewer/`)
    - Real-time tool calls
    - Result display
    - Error handling

## Quick Wins & Automation

### LLM Agent Shortcuts
1. **Auto-generate tool schemas** - Use GPT to create Zod schemas from descriptions
2. **Extract initial context** - Parse existing conversations for user preferences
3. **Generate test data** - Create realistic calendar events and tasks
4. **Write analysis tools** - Have Normal Agent implement its own tools
5. **Create search queries** - Generate optimized searches from user interests
6. **Tag memories** - Auto-categorize using embeddings
7. **Generate API docs** - Create documentation from TypeScript interfaces

### MVP Fast Path
If you need a working system quickly:
1. Extend existing tool system with memory tools
2. Add simple task queue (in-memory)
3. Create delegation tool
4. Add basic calendar checking
5. Implement agent mode switching

Everything else can be added incrementally.

## Dependencies

### Required Packages (not yet installed)
```json
{
  "socket.io": "^4.7.0",
  "socket.io-client": "^4.7.0",
  "bull": "^4.12.0",  // Optional: for Redis queue
  "ioredis": "^5.3.0", // Optional: for caching
  "@langchain/openai": "^0.0.10", // Optional: for embeddings
  "node-cron": "^3.0.3" // For scheduled tasks
}
```

## Notes
- Start with in-memory implementations, upgrade to Redis/persistent storage later
- Use existing MongoDB for all data storage initially
- Leverage OpenAI for embeddings instead of custom models
- Keep tool implementations simple at first, enhance with LLM generation
- Focus on core agent communication before UI