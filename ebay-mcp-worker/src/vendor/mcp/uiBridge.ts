import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedToolUi, ToolEntry } from '@/tools/registry.js';

/**
 * Workers port: MCP Apps interactive UI is disabled (no built UI bundle on Workers).
 * Every tool returns its plain JSON text result. The bridge keeps upstream's shape so
 * runtime.ts is unchanged apart from the options it needed for stateless operation.
 */
export interface UiBridge {
  register(entry: ToolEntry, registered: RegisteredTool): void;
  shouldRender(entry: ToolEntry): entry is ToolEntry & { ui: ResolvedToolUi };
  installCapabilityGate(): void;
}

export const buildUiToolResult = (_ui: ResolvedToolUi, result: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(result ?? { status: 'success' }, null, 2) }],
});

export const createUiBridge = (_server: McpServer, _moduleUrl?: string): UiBridge => ({
  register: () => {},
  shouldRender: (_entry): _entry is ToolEntry & { ui: ResolvedToolUi } => false,
  installCapabilityGate: () => {},
});
