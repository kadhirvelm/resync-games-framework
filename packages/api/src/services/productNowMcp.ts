import type { Service, ServiceDefinition } from "../genericTypes/service";

/** A tool advertised by ProductNow's MCP server. */
export interface ProductNowMcpTool {
  description?: string;
  inputSchema: Record<string, unknown>;
  name: string;
}

/** Browser-specific ProductNow OAuth connection state. */
export interface ProductNowMcpStatus {
  connected: boolean;
}

/** ProductNow MCP operations exposed to the Resync Game Framework frontend. */
export interface ProductNowMcpServiceApi extends Service {
  callTool: {
    payload: {
      arguments?: Record<string, unknown>;
      name: string;
    };
    response: unknown;
  };
  disconnect: {
    payload: null;
    response: ProductNowMcpStatus;
  };
  getStatus: {
    payload: null;
    response: ProductNowMcpStatus;
  };
  listTools: {
    payload: null;
    response: { tools: ProductNowMcpTool[] };
  };
}

export const ProductNowMcpServiceDefinition: ServiceDefinition<ProductNowMcpServiceApi> =
  {
    controller: "productnow-mcp",
    endpoints: {
      callTool: { method: "POST", path: "call-tool" },
      disconnect: "disconnect",
      getStatus: { method: "POST", path: "status" },
      listTools: { method: "POST", path: "tools" },
    },
  };
