import * as handler from "../src/api-handlers/audit/index.js";

export function GET(request: Request): Response | Promise<Response> {
  return handler.GET(request);
}

export function POST(): Response {
  return new Response(null, { status: 405, headers: { allow: "GET" } });
}
