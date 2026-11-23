import * as vote from "../_handlers/vote/[token]";

type Handler = {
  GET?: (request: Request) => Response | Promise<Response>;
  POST?: (request: Request) => Response | Promise<Response>;
};

const handler: Handler = vote;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function dispatch(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (!/^\/api\/vote\/[^/]+\/?$/.test(pathname)) return json({ error: "not_found" }, 404);
  const method = request.method.toUpperCase();
  if (method === "GET" && handler.GET) return handler.GET(request);
  if (method === "POST" && handler.POST) return handler.POST(request);
  const allowed = ["GET", "POST"].filter((m) => handler[m as "GET" | "POST"]);
  return new Response(null, { status: 405, headers: { allow: allowed.join(", ") } });
}

export function GET(request: Request) { return dispatch(request); }
export function POST(request: Request) { return dispatch(request); }
