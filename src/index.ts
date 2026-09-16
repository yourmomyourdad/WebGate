import { DurableObject } from "cloudflare:workers";

export interface Env {
  GATEWAY: DurableObjectNamespace<Gateway>;
}

export class Gateway extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebGate is alive :D", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({
      type: "gateway-connected",
    }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ) {
    console.log("received message", typeof message);
    ws.send(message);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    console.log("WebSocket closed", code, reason, wasClean);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebGate online :D", {
        status: 200,
      });
    }

    const id = env.GATEWAY.idFromName("main");
    const gateway = env.GATEWAY.get(id);

    return gateway.fetch(request);
  },
};
