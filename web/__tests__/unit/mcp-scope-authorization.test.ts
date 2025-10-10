/**
 * MCP Scope Authorization Tests
 * Tests the scope-based authorization system for MCP tools
 */

import { describe, it, expect } from '@jest/globals';

describe('MCP Scope Authorization', () => {
  const MCP_URL = process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL;
  const DEV_API_KEY = process.env.MCP_DEVELOPMENT_API_KEY;

  // Helper to parse SSE responses
  function parseSSE(text: string): any {
    const lines = text.split('\n');
    const dataLine = lines.find(line => line.startsWith('data:'));
    if (dataLine) {
      return JSON.parse(dataLine.substring(5).trim());
    }
    if (text.trim().startsWith('{')) {
      return JSON.parse(text);
    }
    return { raw: text };
  }

  // Helper to make MCP requests
  async function mcpRequest(method: string, params: any) {
    const response = await fetch(MCP_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${DEV_API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000),
        method,
        params
      })
    });
    const text = await response.text();
    return parseSSE(text);
  }

  describe('Initialization', () => {
    it('should successfully initialize with dev API key', async () => {
      const result = await mcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Jest Test', version: '1.0' }
      });

      expect(result.result).toBeDefined();
      expect(result.result.protocolVersion).toBe('2024-11-05');
      expect(result.result.capabilities.tools).toBeDefined();
    });

    it('should list all tools with scope requirements', async () => {
      const result = await mcpRequest('tools/list', {});

      expect(result.result.tools).toBeDefined();
      expect(Array.isArray(result.result.tools)).toBe(true);
      expect(result.result.tools.length).toBeGreaterThan(0);

      // Verify key tools exist
      const toolNames = result.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_user_context');
      expect(toolNames).toContain('update_user_context');
    });
  });

  describe('User Context Tools', () => {
    it('should successfully read user context with proper scope', async () => {
      const result = await mcpRequest('tools/call', {
        name: 'get_user_context',
        arguments: {}
      });

      expect(result.result).toBeDefined();
      expect(result.result.content).toBeDefined();
      expect(result.result.content[0].type).toBe('text');

      const data = JSON.parse(result.result.content[0].text);
      expect(data).toBeDefined();
    });

    it('should successfully update user context with proper scope', async () => {
      const timestamp = new Date().toISOString();
      const result = await mcpRequest('tools/call', {
        name: 'update_user_context',
        arguments: {
          contextUpdates: [{
            path: '/test/jest_scope_test',
            value: `Tested at ${timestamp}`
          }]
        }
      });

      expect(result.result).toBeDefined();
      expect(result.result.content).toBeDefined();

      const data = JSON.parse(result.result.content[0].text);
      expect(data['/test/jest_scope_test']).toContain('Tested at');
    });
  });

  describe('Scope Enforcement Documentation', () => {
    it('should document required scopes in tool descriptions', async () => {
      const capabilities = await mcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Jest Test', version: '1.0' }
      });

      const tools = capabilities.result.capabilities.tools;

      // Verify scope requirements are documented
      expect(tools.get_user_context.description).toContain('read:user-context');
      expect(tools.update_user_context.description).toContain('write:user-context');

      // Verify calendar tools have scope requirements
      if (tools.list_calendars) {
        expect(tools.list_calendars.description).toContain('calendar:read');
      }
      if (tools.create_event) {
        expect(tools.create_event.description).toContain('calendar:write');
      }
    });
  });
});
