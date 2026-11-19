/*
  Permanent unit tests for the hardening helpers.

  Run with: npm run test:unit
  No server is started; each run uses the isolated database from helpers.mjs.
*/

import test from "node:test";
import assert from "node:assert/strict";
import {
  categorizeQuestion,
  listAuditEvents,
  rateLimitGuard,
  recordAudit,
  withRateLimitHeaders,
} from "./helpers.mjs";

test("fixed-window limiter denies attempts over the limit", async () => {
  const identifier = `unit-${Date.now()}`;
  const limit = 3;
  const allowed = [];

  for (let attempt = 0; attempt < limit; attempt += 1) {
    allowed.push(await rateLimitGuard("test:unit", identifier, limit, 60_000));
  }
  assert.ok(allowed.every((guard) => guard.denied === null));

  const denied = await rateLimitGuard("test:unit", identifier, limit, 60_000);
  assert.equal(denied.denied?.status, 429);
  assert.equal(denied.denied?.headers.get("x-ratelimit-remaining"), "0");
  assert.ok(Number(denied.denied?.headers.get("retry-after")) > 0);

  const response = withRateLimitHeaders(new Response("ok"), allowed[0].result, limit);
  assert.equal(response.headers.get("x-ratelimit-limit"), "3");
  assert.equal(response.headers.get("x-ratelimit-remaining"), "2");
});

test("audit log stores redacted facts and returns newest first", async () => {
  await recordAudit({
    actorType: "system",
    action: "auth.login_failed",
    metadata: { reason: "invalid_credentials" },
  });
  await recordAudit({
    actorType: "admin",
    actorId: "admin-1",
    action: "election.create",
    targetType: "election",
    targetId: 7,
    metadata: { count: 3 },
  });

  const events = await listAuditEvents(2);
  assert.equal(events[0].action, "election.create");
  assert.equal(events[0].actorId, "admin-1");
  assert.equal(events[0].targetId, "7");
  assert.deepEqual(events[0].metadata, { count: 3 });
  assert.equal(events[1].action, "auth.login_failed");

  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("token"), false);
});

test("questions are categorized in Spanish, English and Russian", () => {
  assert.equal(categorizeQuestion("Presupuesto anual"), "finance");
  assert.equal(categorizeQuestion("Annual budget and invoices"), "finance");
  assert.equal(categorizeQuestion("Бюджет и налоги"), "finance");
  assert.equal(categorizeQuestion("¿Cómo estamos?"), "general");
});
