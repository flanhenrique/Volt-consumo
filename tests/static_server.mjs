import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 4173);
const excluded = new Set([".git", "node_modules", "playwright-report", "test-results", "__pycache__"]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);
const assets = new Map();

await loadAssets(root);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const pathname = decodeURIComponent(url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname);
    const asset = assets.get(pathname);
    if (!asset) throw new Error("Not found");
    send(response, 200, asset.contentType, asset.body, request.method);
  } catch {
    send(response, 404, "text/plain; charset=utf-8", Buffer.from("Not found\n"), request.method);
  }
});

server.listen(port, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));

function send(response, status, contentType, body, method) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": contentType
  });
  response.end(method === "HEAD" ? undefined : body);
}

async function loadAssets(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const nextRelative = path.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await loadAssets(absolute, nextRelative);
      continue;
    }
    if (!entry.isFile()) continue;
    const pathname = `/${nextRelative.split(path.sep).join("/")}`;
    assets.set(pathname, {
      body: await readFile(absolute),
      contentType: contentTypes.get(path.extname(entry.name).toLowerCase()) || "application/octet-stream"
    });
  }
}
