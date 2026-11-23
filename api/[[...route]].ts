/*
  Single Vercel Function entrypoint.

  The Hobby plan limits deployments to 12 Serverless Functions. This project
  has more API routes than that, so every request to /api/* is routed through
  this optional catch-all and dispatched to the real handler modules.
*/

import * as auditIndex from "../api-handlers/audit/index";
import * as googleCallback from "../api-handlers/auth/google/callback";
import * as googleConfig from "../api-handlers/auth/google/config";
import * as googleIndex from "../api-handlers/auth/google/index";
import * as authLogin from "../api-handlers/auth/login";
import * as authLogout from "../api-handlers/auth/logout";
import * as authMe from "../api-handlers/auth/me";
import * as electionsIndex from "../api-handlers/elections/index";
import * as electionsMotions from "../api-handlers/elections/motions";
import * as electionsResults from "../api-handlers/elections/results";
import * as electionsStatus from "../api-handlers/elections/status";
import * as electionsVoters from "../api-handlers/elections/voters";
import * as emailsConfig from "../api-handlers/emails/config";
import * as emailsSend from "../api-handlers/emails/send";
import * as questionnairesIndex from "../api-handlers/questionnaires/index";
import * as questionnaireDetail from "../api-handlers/questionnaires/[id]";
import * as questionnaireDelegate from "../api-handlers/questionnaire/[token]/delegate";
import * as questionnaireToken from "../api-handlers/questionnaire/[token]";
import * as voteToken from "../api-handlers/vote/[token]";

type Handler = {
  GET?: (request: Request) => Response | Promise<Response>;
  POST?: (request: Request) => Response | Promise<Response>;
};

type Route = {
  pattern: RegExp;
  handler: Handler;
};

/* Most specific routes first so /questionnaire/:token/delegate wins. */
const routes: Route[] = [
  { pattern: /^\/api\/audit\/?$/, handler: auditIndex },
  { pattern: /^\/api\/auth\/google\/callback\/?$/, handler: googleCallback },
  { pattern: /^\/api\/auth\/google\/config\/?$/, handler: googleConfig },
  { pattern: /^\/api\/auth\/google\/?$/, handler: googleIndex },
  { pattern: /^\/api\/auth\/login\/?$/, handler: authLogin },
  { pattern: /^\/api\/auth\/logout\/?$/, handler: authLogout },
  { pattern: /^\/api\/auth\/me\/?$/, handler: authMe },
  { pattern: /^\/api\/elections\/motions\/?$/, handler: electionsMotions },
  { pattern: /^\/api\/elections\/results\/?$/, handler: electionsResults },
  { pattern: /^\/api\/elections\/status\/?$/, handler: electionsStatus },
  { pattern: /^\/api\/elections\/voters\/?$/, handler: electionsVoters },
  { pattern: /^\/api\/elections\/?$/, handler: electionsIndex },
  { pattern: /^\/api\/emails\/config\/?$/, handler: emailsConfig },
  { pattern: /^\/api\/emails\/send\/?$/, handler: emailsSend },
  { pattern: /^\/api\/questionnaires\/[^/]+\/?$/, handler: questionnaireDetail },
  { pattern: /^\/api\/questionnaires\/?$/, handler: questionnairesIndex },
  { pattern: /^\/api\/questionnaire\/[^/]+\/delegate\/?$/, handler: questionnaireDelegate },
  { pattern: /^\/api\/questionnaire\/[^/]+\/?$/, handler: questionnaireToken },
  { pattern: /^\/api\/vote\/[^/]+\/?$/, handler: voteToken },
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
  if (route === undefined) return json({ error: "not_found" }, 404);

  const method = request.method.toUpperCase();
  if (method === "GET" && route.handler.GET) return route.handler.GET(request);
  if (method === "POST" && route.handler.POST) return route.handler.POST(request);

  const allowed = ["GET", "POST"].filter(
    (name) => route.handler[name as "GET" | "POST"] !== undefined,
  );
  return new Response(null, {
    status: 405,
    headers: { allow: allowed.join(", ") },
  });
}

export function GET(request: Request): Response | Promise<Response> {
  return dispatch(request);
}

export function POST(request: Request): Response | Promise<Response> {
  return dispatch(request);
}
