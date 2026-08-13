from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import sys
import threading
from urllib.parse import unquote, urlsplit


EXCLUDED_PARTS = {".git", "node_modules", "playwright-report", "test-results", "__pycache__"}


class StaticHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        error = sys.exception()
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def load_assets(root):
    assets = {}
    for path in root.rglob("*"):
        if not path.is_file() or EXCLUDED_PARTS.intersection(path.relative_to(root).parts):
            continue
        assets["/" + path.relative_to(root).as_posix()] = path.read_bytes()
    return assets


def make_handler(assets):
    class StaticHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            self.send_asset(include_body=True)

        def do_HEAD(self):
            self.send_asset(include_body=False)

        def send_asset(self, include_body):
            request_path = unquote(urlsplit(self.path).path)
            if request_path.endswith("/"):
                request_path += "index.html"
            body = assets.get(request_path)
            if body is None:
                body = b"Not found\n"
                self.send_response(404)
                content_type = "text/plain; charset=utf-8"
            else:
                self.send_response(200)
                content_type = mimetypes.guess_type(request_path)[0] or "application/octet-stream"
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if include_body:
                self.wfile.write(body)

        def log_message(self, _format, *_args):
            return

    return StaticHandler


def start_server(root, port=0):
    assets = load_assets(Path(root).resolve())
    server = StaticHTTPServer(("127.0.0.1", port), make_handler(assets))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def main():
    root = Path(__file__).resolve().parents[1]
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = StaticHTTPServer(("127.0.0.1", port), make_handler(load_assets(root)))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
