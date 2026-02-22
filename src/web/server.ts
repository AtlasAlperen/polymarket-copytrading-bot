import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { getState } from "./state";

const PUBLIC = path.join(__dirname, "public");

export function startWebServer(port: number): void {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/state") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(getState()));
      return;
    }
    const file = req.url === "/" ? "index.html" : req.url!.replace(/^\//, "");
    const filePath = path.join(PUBLIC, file);
    if (!filePath.startsWith(PUBLIC)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const ext = path.extname(file);
      const types: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
      };
      res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
      res.end(data);
    });
  });
  server.listen(port, () => console.log(`UI http://localhost:${port}`));
}
