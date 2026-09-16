import http from "node:http";

const PORT = Number(process.env.PORT ?? 10000);

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
  });

  res.end("WebGate is alive! :D\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebGate listening on port ${PORT}`);
});
