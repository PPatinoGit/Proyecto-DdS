import * as electionsIndex from "../_handlers/elections/index";
import * as motions from "../_handlers/elections/motions";
import * as results from "../_handlers/elections/results";
import * as status from "../_handlers/elections/status";
import * as voters from "../_handlers/elections/voters";

type Handler = {
  GET?: (request: Request) => Response | Promise<Response>;
  POST?: (request: Request) => Response | Promise<Response>;
};

const routes: Array<{ pattern: RegExp; handler: Handler }> = [
  { pattern: /^\/api\/elections\/motions\/?$/, handler: motions },
  { pattern: /^\/api\/elections\/results\/?$/, handler: results },
  { pattern: /^\/api\/elections\/status\/?$/, handler: status },
  { pattern: /^\/api\/elections\/voters\/?$/, handler: voters },
  { pattern: /^\/api\/elections\/?$/, handler: electionsIndex },
];

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function dispatch(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const route = routes.find((entry) => entry.pattern.test(pathname));
  if (!route) return json({ error: "not_found" }, 404);
  const method = request.method.toUpperCase();
  if (method === "GET" && route.handler.GET) return route.handler.GET(request);
  if (method === "POST" && route.handler.POST) return route.handler.POST(request);
  const allowed = ["GET", "POST"].filter((m) => route.handler[m as "GET" | "POST"]);
  return new Response(null, { status: 405, headers: { allow: allowed.join(", ") } });
}

export function GET(request: Request) { return dispatch(request); }
export function POST(request: Request) { return dispatch(request); }
