import * as index from "../../api-handlers/questionnaires/index";
import * as detail from "../../api-handlers/questionnaires/[id]";

type Handler = {
  GET?: (request: Request) => Response | Promise<Response>;
  POST?: (request: Request) => Response | Promise<Response>;
};

/* Detail route before index so /questionnaires/123 doesn't match index. */
const routes: Array<{ pattern: RegExp; handler: Handler }> = [
  { pattern: /^\/api\/questionnaires\/[^/]+\/?$/, handler: detail },
  { pattern: /^\/api\/questionnaires\/?$/, handler: index },
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
