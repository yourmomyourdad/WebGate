import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 10000);
const TOKEN = process.env.GATEWAY_TOKEN;

if (!TOKEN) {
  throw new Error("GATEWAY_TOKEN is not configured");
}

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
    });

    res.end("WebGate is alive :D\n");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true });

let agent: WebSocket | null = null;

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname !== "/agent") {
      ws.close(1008, "Wrong endpoint");
      return;
    }

    ws.once("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type !== "auth" || message.token !== TOKEN) {
          ws.close(1008, "Unauthorized");
          return;
        }

        agent = ws;

        console.log("Codespace agent connected");

        ws.send(JSON.stringify({
          type: "auth-ok"
        }));

        ws.on("close", () => {
          if (agent === ws) {
            agent = null;
          }

          console.log("Codespace agent disconnected");
        });

      } catch {
        ws.close(1008, "Invalid authentication");
      }
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebGate listening on ${PORT}`);
});
