/*
  Permanent API tests.

  Handlers are imported directly and called with Web Requests, so no dev server
  is needed. They write only to the isolated database from helpers.mjs.
  Run with: npm run test:api
*/

import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMITS,
  adminRequest,
  listAuditEvents,
  postJson,
  seedBallot,
  seedPerson,
  seedQuestionnaire,
} from "./helpers.mjs";

const { POST: login } = await import("../api/auth/login.ts");
const { POST: logout } = await import("../api/auth/logout.ts");
const { POST: createElection } = await import("../api/elections/index.ts");
const { GET: getAudit } = await import("../api/audit/index.ts");
const { POST: castVote } = await import("../api/vote/[token].ts");
const { POST: answerQuestion } = await import("../api/questionnaire/[token].ts");
const { POST: delegateQuestions } = await import("../api/questionnaire/[token]/delegate.ts");

/** POST with the demo administrator's signed cookie. */
function adminPost(url, body) {
  return adminRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("login succeeds, audits failures and rate limits one email", async () => {
  const success = await login(
    postJson(
      "http://localhost/api/auth/login",
      { email: "admin@demo.com", password: "demo1234" },
      { "x-forwarded-for": "198.51.100.10" },
    ),
  );
  assert.equal(success.status, 200);
  assert.match(success.headers.get("set-cookie") ?? "", /vote_session=/);

  const failed = await login(
    postJson(
      "http://localhost/api/auth/login",
      { email: "admin@demo.com", password: "wrong-password" },
      { "x-forwarded-for": "198.51.100.10" },
    ),
  );
  assert.equal(failed.status, 401);

  const email = `brute-${Date.now()}@example.test`;
  const attempts = RATE_LIMITS.loginEmail.limit;
  for (let index = 0; index < attempts; index += 1) {
    const response = await login(
      postJson(
        "http://localhost/api/auth/login",
        { email, password: "wrong-password" },
        { "x-forwarded-for": "198.51.100.11" },
      ),
    );
    assert.equal(response.status, 401);
  }

  const limited = await login(
    postJson(
      "http://localhost/api/auth/login",
      { email, password: "wrong-password" },
      { "x-forwarded-for": "198.51.100.11" },
    ),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("x-ratelimit-remaining"), "0");

  const events = await listAuditEvents(200);
  assert.ok(events.some((event) => event.action === "auth.login" && event.actorId === "admin-1"));
  assert.ok(events.some((event) => event.action === "auth.login_failed"));
  assert.equal(JSON.stringify(events).includes(email), false);
  assert.equal(JSON.stringify(events).includes("wrong-password"), false);
});

test("logout clears the cookie and writes an audit row", async () => {
  const response = await logout(adminRequest("http://localhost/api/auth/logout", { method: "POST" }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("set-cookie") ?? "", /vote_session=/);

  const events = await listAuditEvents(1);
  assert.equal(events[0].action, "auth.logout");
  assert.equal(events[0].actorId, "admin-1");
});

test("creating an election records who did it without storing the title", async () => {
  const response = await createElection(
    adminPost("http://localhost/api/elections", {
      title: "Elección de prueba de auditoría",
      opensAt: null,
      closesAt: null,
    }),
  );
  assert.equal(response.status, 201);
  const { election } = await response.json();

  const events = await listAuditEvents(1);
  assert.equal(events[0].action, "election.create");
  assert.equal(events[0].actorId, "admin-1");
  assert.equal(events[0].targetId, String(election.id));
  assert.equal(JSON.stringify(events).includes(election.title), false);
});

test("a vote is counted once, audited by person id and rate limited by token", async () => {
  const ballot = await seedBallot("vote-audit");
  const url = `http://localhost/api/vote/${ballot.token}`;
  const body = { votes: [{ motionId: ballot.motionId, optionId: ballot.optionId }] };

  const first = await castVote(postJson(url, body));
  assert.equal(first.status, 201);
  const { receipt } = await first.json();
  assert.equal(receipt.answers.length, 1);

  const duplicate = await castVote(postJson(url, body));
  assert.equal(duplicate.status, 409);

  const events = await listAuditEvents(10);
  const recorded = events.find((event) => event.action === "vote.cast");
  assert.equal(recorded?.actorId, String(ballot.personId));
  assert.equal(recorded?.targetId, String(ballot.electionId));
  assert.deepEqual(recorded?.metadata, { answers: 1 });
  assert.equal(JSON.stringify(events).includes(ballot.token), false);

  const limitedBallot = await seedBallot("vote-limit");
  const limitedUrl = `http://localhost/api/vote/${limitedBallot.token}`;
  for (let index = 0; index < RATE_LIMITS.vote.limit; index += 1) {
    const response = await castVote(postJson(limitedUrl, {}));
    assert.equal(response.status, 400);
  }
  const over = await castVote(postJson(limitedUrl, {}));
  assert.equal(over.status, 429);
});

test("answers and delegations are audited without tokens or answer text", async () => {
  const questionnaire = await seedQuestionnaire("q-audit");
  const answerUrl = `http://localhost/api/questionnaire/${questionnaire.token}`;

  const answered = await answerQuestion(
    postJson(answerUrl, { questionId: questionnaire.questionId, body: "Respuesta confidencial" }),
  );
  assert.equal(answered.status, 200);

  const delegateId = await seedPerson("q-delegate", "Delegate");
  const delegated = await delegateQuestions(
    postJson(`${answerUrl}/delegate`, {
      questionIds: [questionnaire.questionId],
      toPersonId: delegateId,
    }),
  );
  assert.equal(delegated.status, 200);
  const { delegateToken } = await delegated.json();
  assert.match(delegateToken, /^[A-Za-z0-9_-]{32}$/);

  const events = await listAuditEvents(10);
  const answerEvent = events.find((event) => event.action === "questionnaire.answer");
  const delegateEvent = events.find((event) => event.action === "questionnaire.delegate");
  assert.equal(answerEvent?.actorId, String(questionnaire.holder.personId));
  assert.equal(delegateEvent?.metadata.questionCount, 1);

  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(questionnaire.token), false);
  assert.equal(serialized.includes(delegateToken), false);
  assert.equal(serialized.includes("Respuesta confidencial"), false);

  const limited = await seedQuestionnaire("q-limit");
  const limitedUrl = `http://localhost/api/questionnaire/${limited.token}`;
  for (let index = 0; index < RATE_LIMITS.questionnaire.limit; index += 1) {
    const response = await answerQuestion(postJson(limitedUrl, {}));
    assert.equal(response.status, 400);
  }
  const over = await answerQuestion(postJson(limitedUrl, {}));
  assert.equal(over.status, 429);
});

test("the audit API requires a session and exposes only redacted rows", async () => {
  const anonymous = await getAudit(new Request("http://localhost/api/audit?limit=5"));
  assert.equal(anonymous.status, 401);

  const response = await getAudit(adminRequest("http://localhost/api/audit?limit=5"));
  assert.equal(response.status, 200);
  const { events } = await response.json();
  assert.ok(Array.isArray(events));
  assert.equal(JSON.stringify(events).includes("password"), false);
});
