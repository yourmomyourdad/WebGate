import { DurableObject } from "cloudflare:workers";

export interface Env {
  GATEWAY: DurableObjectNamespace<Gateway>;
}

type Role = "agent" | "client";

export class Gateway extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private getSockets(role: Role): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.deserializeAttachment()?.role === role);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.pathname.slice(1) as Role;

    if (role !== "agent" && role !== "client") {
      return new Response("Use /agent or /client", { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebGate is alive :D");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      role,
    });

    if (role === "agent") {
      server.send(JSON.stringify({
        type: "agent-connected",
      }));
    } else {
      server.send(JSON.stringify({
        type: "client-connected",
        agentConnected: this.getSockets("agent").length > 0,
      }));
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ) {
    const state = ws.deserializeAttachment() as { role: Role } | null;

    if (!state) {
      ws.close(1008, "Missing connection state");
      return;
    }

    const otherRole: Role =
      state.role === "agent" ? "client" : "agent";

    const targets = this.getSockets(otherRole);

    for (const target of targets) {
      try {
        target.send(message);
      } catch {
        // Ignore dead connections.
      }
    }
  }

  async webSocketClose() {
    // Nothing needed yet.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.GATEWAY.idFromName("main");
    return env.GATEWAY.get(id).fetch(request);
  },
};
