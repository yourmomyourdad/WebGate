import { DurableObject } from "cloudflare:workers";

export interface Env {
  GATEWAY: DurableObjectNamespace<Gateway>;
}

type Role = "agent" | "wisp";

export class Gateway extends DurableObject {
  private sockets(role: Role): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.deserializeAttachment()?.role === role);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const role =
      url.pathname === "/agent"
        ? "agent"
        : url.pathname === "/wisp"
          ? "wisp"
          : null;

    if (!role) {
      return new Response("WebGate online :D");
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({ role });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ) {
    const state = ws.deserializeAttachment() as {
      role: Role;
    } | null;

    if (!state) {
      ws.close(1008, "Missing connection state");
      return;
    }

    const otherRole =
      state.role === "agent" ? "wisp" : "agent";

    for (const target of this.sockets(otherRole)) {
      try {
        target.send(message);
      } catch {
        // Ignore dead sockets.
      }
    }
  }

  async webSocketClose() {}
}

export default {
  async fetch(request: Request, env: Env) {
    const id = env.GATEWAY.idFromName("main");

    return env.GATEWAY
      .get(id)
      .fetch(request);
  },
};
