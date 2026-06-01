import type { Tool } from "@modelcontextprotocol/sdk/types.js";
/**
 * Tools that mutate Bing Ads state. These are hidden from the tool list
 * and refused at call time unless BING_ADS_MCP_WRITE=true.
 *
 * Adding a new tool? Put it in this set if it creates, modifies, pauses,
 * enables, removes, links, unlinks, or applies anything.
 */
export declare const WRITE_TOOLS: ReadonlySet<string>;
export declare function isWriteTool(name: string): boolean;
export declare function isWriteEnabled(env?: NodeJS.ProcessEnv): boolean;
export declare function filterTools(allTools: readonly Tool[], env?: NodeJS.ProcessEnv): Tool[];
export declare const WRITE_DISABLED_MESSAGE = "Write operations are disabled. Set BING_ADS_MCP_WRITE=true in the MCP server environment to enable mutating tools (create/update/pause/enable/remove/apply).";
/**
 * Assert that a tool call is allowed under the current write-mode setting.
 * Throws a clear Error if the tool mutates state and writes are disabled.
 */
export declare function assertWriteAllowed(toolName: string, env?: NodeJS.ProcessEnv): void;
