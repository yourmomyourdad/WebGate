import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 10000);
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;

if (!GATEWAY_TOKEN) {
  throw new Error("GATEWAY_TOKEN is required");
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("WebGate is alive\n");
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  noServer: true,
});

let agent: WebSocket | null = null;

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === "/agent") {
      ws.once("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (
            msg.type !== "auth" ||
            typeof msg.token !== "string" ||
            !crypto.timingSafeEqual(
              Buffer.from(msg.token),
              Buffer.from(GATEWAY_TOKEN),
            )
          ) {
            ws.close(1008, "Unauthorized");
            return;
          }

          agent = ws;
          console.log("Codespace agent connected");

          ws.on("close", () => {
            if (agent === ws) agent = null;
            console.log("Codespace agent disconnected");
          });

          ws.send(JSON.stringify({ type: "auth-ok" }));
        } catch {
          ws.close(1008, "Bad authentication");
        }
      });

      return;
    }

    ws.close(1008, "Wrong endpoint");
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`WebGate listening on ${PORT}`);
});
