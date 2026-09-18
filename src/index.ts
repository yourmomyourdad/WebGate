import { DurableObject } from "cloudflare:workers";

export interface Env {
  GATEWAY: DurableObjectNamespace<Gateway>;
}

type Role = "agent" | "client";

function testPage() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WebGate Test</title>
  <style>
    body {
      font-family: monospace;
      background: #111;
      color: #eee;
      padding: 30px;
    }

    #status {
      font-size: 22px;
      margin-bottom: 20px;
    }

    #log {
      white-space: pre-wrap;
      background: #000;
      padding: 20px;
      border-radius: 8px;
      min-height: 200px;
    }
  </style>
</head>

<body>
  <div id="status">Connecting...</div>
  <div id="log"></div>

  <script>
    const status = document.getElementById("status");
    const log = document.getElementById("log");

    function write(message) {
      log.textContent += message + "\\n";
    }

    const ws = new WebSocket(
      (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/client"
    );

    ws.onopen = () => {
      status.textContent = "🟢 Connected to WebGate";
      write("Client connected");
      ws.send("HELLO FROM CHROMEBOOK");
    };

    ws.onmessage = (event) => {
      write("Received: " + event.data);

      if (event.data === "HELLO FROM CHROMEBOOK") {
        status.textContent = "🎉 FULL TUNNEL ROUND TRIP WORKS";
      }
    };

    ws.onerror = () => {
      status.textContent = "🔴 WebSocket error";
      write("WebSocket error");
    };

    ws.onclose = (event) => {
      status.textContent = "⚫ Disconnected";
      write("Closed: " + event.code);
    };
  </script>
</body>
</html>`;
}

export class Gateway extends DurableObject {
  private getSockets(role: Role): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.deserializeAttachment()?.role === role);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const role = url.pathname.slice(1) as Role;

    if (role !== "agent" && role !== "client") {
      return new Response(testPage(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", {
        status: 426,
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      role,
    });

    if (role === "agent") {
      server.send(
        JSON.stringify({
          type: "agent-connected",
        }),
      );
    } else {
      server.send(
        JSON.stringify({
          type: "client-connected",
          agentConnected: this.getSockets("agent").length > 0,
        }),
      );
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
    const state = ws.deserializeAttachment() as {
      role: Role;
    } | null;

    if (!state) {
      ws.close(1008, "Missing state");
      return;
    }

    const targetRole: Role =
      state.role === "agent" ? "client" : "agent";

    for (const target of this.getSockets(targetRole)) {
      try {
        target.send(message);
      } catch {
        // Ignore dead sockets.
      }
    }
  }

  async webSocketClose() {
    // Nothing needed yet.
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const id = env.GATEWAY.idFromName("main");

    return env.GATEWAY
      .get(id)
      .fetch(request);
  },
};
