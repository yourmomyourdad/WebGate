import { DurableObject } from "cloudflare:workers";

export interface Env {
  GATEWAY: DurableObjectNamespace<Gateway>;
}

export class Gateway extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebGate is alive :D");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    server.send(JSON.stringify({
      type: "gateway-connected"
    }));

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ) {
    ws.send(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.GATEWAY.idFromName("main");
    return env.GATEWAY.get(id).fetch(request);
  }
};
