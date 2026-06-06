import { writeFiles, collectAssets, contentType } from "./build-lib.mjs";
import { createServer } from "node:http";

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`build-server listening on ${PORT}`);
});
