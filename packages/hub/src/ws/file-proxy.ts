import WebSocket from "ws";
import { encode } from "@remote-code/protocol";
import { agentRegistry } from "./agent-registry.js";

// requestId -> browser WebSocket that initiated the request
const pendingRequests = new Map<string, WebSocket>();

/**
 * Proxy a file request from a browser to the appropriate agent.
 */
export function proxyRequest(
  browserWs: WebSocket,
  opts: {
    nodeId: string;
    requestId: string;
    action: "list" | "read" | "write" | "stat" | "mkdir" | "delete";
    path: string;
    data?: string;
  }
): void {
  const { nodeId, requestId, action, path, data } = opts;

  pendingRequests.set(requestId, browserWs);

  const sent = agentRegistry.sendToAgent(
    nodeId,
    encode({ type: "fs-request", requestId, action, path, data })
  );

  if (!sent) {
    // Agent not reachable, respond immediately with error
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(
        encode({
          type: "browser-fs-response",
          requestId,
          error: `Node ${nodeId} is not connected`,
        })
      );
    }
    pendingRequests.delete(requestId);
  }
}

/**
 * Handle an fs-response coming back from an agent and forward it to the browser.
 */
export function handleResponse(
  requestId: string,
  data: unknown,
  error?: string
): void {
  const browserWs = pendingRequests.get(requestId);
  if (!browserWs) return;

  pendingRequests.delete(requestId);

  if (browserWs.readyState === WebSocket.OPEN) {
    browserWs.send(
      encode({ type: "browser-fs-response", requestId, data, error })
    );
  }
}
