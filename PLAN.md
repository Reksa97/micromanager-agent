# Micromanager Agent Implementation Plan

## Already Implemented ✅
- Basic tool system with Zod validation
- User context management (MongoDB collection)
- Context tools (read, set, delete)
- Tool calling in chat endpoint
- Tool integration in realtime agent
- Context API endpoint

---

# Async Audio + AI-Generated UI Stack Plan

## Core Architecture
- **TypeScript + Next.js 14 with App Router**
- **AI → UI Flow**: AI generates JSON instructions → React renderer interprets → DOM updates
- **Audio Pipeline**: Browser Speech API (input) → AI processing → Browser TTS or Cartesia (output)

## 1. AI-to-DOM Communication Format

**JSON Schema**: Compact object describing UI elements (~200-500 bytes)
- **Structure**: `{type, style, content, children, actions}`
- **Safety**: No raw HTML, no eval, just data
- **Editability**: AI can modify previous instructions by ID reference

## 2. Dynamic Renderer Component

- **Input**: JSON instructions from AI
- **Output**: React elements with motion animations
- **Component mapping**: type string → React component
- **Action handling**: Maps UI events back to AI system
- **State preservation**: Maintains UI between updates

## 3. Audio Processing Pipeline

### Input (3 options):
- Web Speech API (immediate, browser-based)
- MediaRecorder → Whisper API (higher accuracy)
- Continuous streaming (WebRTC)

### Output (progressive enhancement):
- **Start**: Browser speechSynthesis
- **Better**: OpenAI TTS ($0.015/1k chars)
- **Best**: Cartesia (95ms latency) or ElevenLabs

## 4. AI Instruction Generation

### System Prompt Engineering:
- Define allowed UI components
- Set style constraints (flexbox-first)
- Establish action naming conventions
- Include size budget (500 bytes max)

### Response Structure:
- Parallel tracks: UI generation + text response
- Function calling for structured output
- Streaming text with deferred UI updates

## 5. State Management

### UI Learning Store:
- User interaction patterns
- Successful UI configurations
- Response time metrics
- Component preference scoring

### Session State:
- Current UI instruction set
- Audio queue management
- Pending actions buffer
- Message history with UI snapshots

## 6. Safety & Validation

### Input Sanitization:
- JSON schema validation (Zod)
- Style property allowlist
- Action name validation
- Size limits enforcement

### Rendering Constraints:
- No dynamic imports
- No innerHTML
- Sandboxed event handlers
- Component whitelist

## 7. Optimization Points

### Performance:
- Memoize rendered components
- Debounce UI updates
- Preload audio chunks
- Cache common UI patterns

### Bundle Size:
- Dynamic import for audio libs
- Tree-shake UI components
- Compress instruction history
- CDN for voice models

## 8. Development Phases

### Phase 1: Core Loop
- JSON → React renderer
- Basic component set (div, button, text, input)
- Browser TTS only
- Simple action handling

### Phase 2: Audio Enhancement
- Add Cartesia/OpenAI TTS
- Implement speech input
- Audio queue management
- Volume/rate controls

### Phase 3: Intelligence Layer
- UI preference learning
- A/B testing framework
- Pattern recognition
- Adaptive complexity

## 9. File Structure

```
/components/ai-renderer/
  - types.ts (UI instruction interfaces)
  - renderer.tsx (main component)
  - validators.ts (schema validation)

/lib/audio/
  - manager.ts (queue & playback)
  - providers/ (tts implementations)

/lib/ai/
  - ui-generator.ts (prompts & parsing)
  - learning.ts (preference tracking)
```

## 10. Key Decisions

### Decided:
- **Max UI instruction size**: 500 bytes
- **Allowed CSS properties**: Use styled shadcn defaults, abstract them with short descriptive words
- **Audio provider priority**: Lowest priority right now, but integrating with browser realtime agent session needed quickly
- **State persistence layer**: The user context MongoDB object - store JSON as object to allow all MongoDB features
- **Error recovery strategy**: Never render broken UI, always store previous state for revert on errors

### For Further Discussion:

**How does AI reference previous UI elements?**
- Option A: Assign IDs to all elements, reference by ID
- Option B: Use path-based references (e.g., "button in header")
- Option C: Semantic references (e.g., "the submit button")

**Should UI updates be diffed or replaced?**
- Option A: Full replacement (simpler, less state)
- Option B: Diff and patch (more efficient, complex)
- Option C: Hybrid - replace sections, diff within

**Can users override AI styling?**
- Option A: No overrides, AI maintains full control
- Option B: User preferences stored and respected
- Option C: Theme system with AI working within constraints

**How to handle audio interruptions?**
- Option A: Queue all audio, play sequentially
- Option B: Cancel previous on new audio
- Option C: Priority system with interruption rules

**What metrics to track for learning?**
- Interaction success rate (did user achieve goal?)
- Time to completion for tasks
- UI elements most interacted with
- Abandoned flows and their patterns
- User corrections and preference signals

---

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