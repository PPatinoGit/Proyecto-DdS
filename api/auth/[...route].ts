import * as googleCallback from "../../api-handlers/auth/google/callback";
import * as googleConfig from "../../api-handlers/auth/google/config";
import * as googleIndex from "../../api-handlers/auth/google/index";
import * as login from "../../api-handlers/auth/login";
import * as logout from "../../api-handlers/auth/logout";
import * as me from "../../api-handlers/auth/me";

type Handler = {
  GET?: (request: Request) => Response | Promise<Response>;
  POST?: (request: Request) => Response | Promise<Response>;
};

const routes: Array<{ pattern: RegExp; handler: Handler }> = [
  { pattern: /^\/api\/auth\/google\/callback\/?$/, handler: googleCallback },
  { pattern: /^\/api\/auth\/google\/config\/?$/, handler: googleConfig },
  { pattern: /^\/api\/auth\/google\/?$/, handler: googleIndex },
  { pattern: /^\/api\/auth\/login\/?$/, handler: login },
  { pattern: /^\/api\/auth\/logout\/?$/, handler: logout },
  { pattern: /^\/api\/auth\/me\/?$/, handler: me },
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
