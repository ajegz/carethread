import test from "node:test";
import assert from "node:assert/strict";
import { appendTurn, applyTool, createSession, getReplaySteps, replayStep, summarize, toolDefinitions, type Session } from "../lib/handoff";

const sender = { id: "s1", role: "sender" as const, text: "The result is pending. Dr. Lee will review it when available.", time: "2026-09-30T06:00:00.000Z" };
const receiver = { id: "r1", role: "receiver" as const, text: "I am Morgan. I acknowledge Dr. Lee's pending review when the result is available.", time: "2026-09-30T06:01:00.000Z" };

function fixture(fields: Record<string, unknown> = {}): Session {
  let session = appendTurn(createSession(), sender);
  session = appendTurn(session, receiver);
  const captured = applyTool(session, "capture_pending_item", { task: "Review the result", owner: "Dr. Lee", due: "When the result is available", uncertainty: "Result pending", sourceTurnIds: ["s1"], ...fields }, "capture");
  assert.equal(captured.result.ok, true);
  return captured.session;
}

function reviewed(session: Session): Session {
  session = appendTurn(session, { id: "confirm", role: "sender", text: "I confirm the captured plan.", time: "2026-09-30T06:02:00.000Z" });
  const result = applyTool(session, "record_clarification", { itemId: "item_1", expectedRevision: session.items[0].revision, sourceTurnIds: ["confirm"], clarification: "The sender confirms the captured plan.", reviewed: true }, "review");
  assert.equal(result.result.ok, true);
  return result.session;
}

function acknowledged(session: Session): Session {
  const result = applyTool(session, "acknowledge_handoff", { itemId: "item_1", expectedRevision: session.items[0].revision, sourceTurnIds: ["r1"], by: "Morgan" }, "ack");
  assert.equal(result.result.ok, true);
  return result.session;
}

test("missing owner/timing stay unknown and prevent acknowledgment", () => {
  const session = reviewed(fixture({ owner: null, due: "unknown" }));
  assert.equal(session.items[0].owner, null);
  assert.equal(session.items[0].due, null);
  assert.deepEqual(session.issues.filter((issue) => issue.status === "open").map((issue) => issue.kind), ["missing_owner", "missing_timing"]);
  const attempted = applyTool(session, "acknowledge_handoff", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], by: "Morgan" }, "ack-missing");
  assert.equal(attempted.result.code, "MISSING_OWNER");
  assert.equal(attempted.session.items[0].acceptance, null);
});

test("a named owner without timing cannot be acknowledged", () => {
  const result = applyTool(reviewed(fixture({ due: null })), "acknowledge_handoff", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], by: "Morgan" }, "ack-no-time");
  assert.equal(result.result.code, "MISSING_TIMING");
});

test("every mutation requires existing human evidence", () => {
  const base = appendTurn(createSession(), { id: "a1", role: "agent", text: "I think the scan is clear." });
  for (const [sourceTurnIds, code] of [[[], "SOURCE_REQUIRED"], [["missing"], "SOURCE_NOT_FOUND"], [["a1"], "HUMAN_SOURCE_REQUIRED"]] as const) {
    const result = applyTool(base, "capture_pending_item", { task: "Review result", sourceTurnIds }, `bad-${code}`);
    assert.equal(result.result.code, code);
    assert.equal(result.session.items.length, 0);
  }
});

test("acknowledgment requires receiver evidence and review of the captured proposal", () => {
  const unreviewed = fixture();
  const withoutReview = applyTool(unreviewed, "acknowledge_handoff", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], by: "Morgan" }, "unreviewed-ack");
  assert.equal(withoutReview.result.code, "REVIEW_REQUIRED");
  const withSender = applyTool(reviewed(unreviewed), "acknowledge_handoff", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["s1"], by: "Morgan" }, "sender-ack");
  assert.equal(withSender.result.code, "RECEIVER_SOURCE_REQUIRED");
});

test("acknowledged is not completed; no clinical fact is inferred", () => {
  const session = acknowledged(reviewed(fixture()));
  assert.equal(session.items[0].taskStatus, "pending");
  assert.equal(session.items[0].completion, null);
  assert.equal(session.items[0].uncertainty, "Result pending");
  assert.equal(summarize(session).handoffComplete, true);
  assert.equal(summarize(session).pending, 1);
  assert.equal(summarize(session).reportedComplete, 0);
});

test("substantive corrections invalidate acknowledgment and retain previous versions", () => {
  const before = acknowledged(reviewed(fixture()));
  const withCorrection = appendTurn(before, { id: "correction", role: "sender", text: "Correction: Dr. Patel owns the review." });
  const result = applyTool(withCorrection, "revise_item", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["correction"], changes: { owner: "Dr. Patel" } }, "change-owner");
  assert.equal(result.result.ok, true);
  assert.equal(result.session.items[0].revision, 2);
  assert.equal(result.session.items[0].acceptance, null);
  assert.equal(result.session.items[0].reviewed, false);
  assert.equal(before.items[0].owner, "Dr. Lee");
  assert.equal(before.items[0].acceptance?.revision, 1);
  assert.equal(result.session.history.at(-1)?.previous?.owner, "Dr. Lee");
  assert.equal(summarize(result.session).handoffComplete, false);
});

test("a repeated unchanged fact does not create a version or erase valid acknowledgment", () => {
  const session = acknowledged(reviewed(fixture()));
  const result = applyTool(session, "revise_item", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["s1"], changes: { owner: "Dr. Lee" } }, "same-owner");
  assert.equal(result.session.items[0].revision, 1);
  assert.equal(result.session.items[0].acceptance?.by, "Morgan");
});

test("stale revisions cannot overwrite or acknowledge newer instructions", () => {
  let session = reviewed(fixture());
  session = applyTool(session, "revise_item", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["s1"], changes: { due: "By 4 p.m." } }, "new-time").session;
  for (const tool of ["revise_item", "acknowledge_handoff"]) {
    const result = applyTool(session, tool, { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], changes: { due: "By 5 p.m." }, by: "Morgan" }, `stale-${tool}`);
    assert.equal(result.result.code, "REVISION_CONFLICT");
    assert.equal(result.session.items[0].due, "By 4 p.m.");
  }
});

test("a duplicate call is idempotent, including reordered argument keys", () => {
  const base = appendTurn(createSession(), sender);
  const first = applyTool(base, "capture_pending_item", { task: "Review result", sourceTurnIds: ["s1"] }, "same-call");
  const retry = applyTool(first.session, "capture_pending_item", { sourceTurnIds: ["s1"], task: "Review result" }, "same-call");
  assert.deepEqual(retry.result, first.result);
  assert.equal(retry.session.items.length, 1);
  assert.equal(retry.session.history.length, 1);
  const collision = applyTool(retry.session, "capture_pending_item", { task: "Another task", sourceTurnIds: ["s1"] }, "same-call");
  assert.equal(collision.result.code, "CALL_ID_CONFLICT");
  assert.equal(collision.session.items.length, 1);
});

test("opaque call IDs cannot pollute the cache prototype", () => {
  const session = fixture();
  const first = applyTool(session, "get_open_items", {}, "__proto__");
  assert.equal(first.result.ok, true);
  const retry = applyTool(first.session, "get_open_items", {}, "__proto__");
  assert.deepEqual(retry.result, first.result);
  assert.equal(Object.getPrototypeOf(first.session.processedCalls), Object.prototype);
});

test("a possible mismatch reopens acknowledgment but cannot change clinical facts", () => {
  let session = acknowledged(reviewed(fixture()));
  session = appendTurn(session, { id: "mismatch", role: "receiver", text: "The result was normal." });
  const result = applyTool(session, "compare_receiver_summary", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["mismatch"], receiverSummary: "The result was normal.", concerns: [{ field: "uncertainty", description: "Has new information replaced the pending result?" }] }, "compare");
  assert.equal(result.session.items[0].uncertainty, "Result pending");
  assert.equal(result.session.items[0].taskStatus, "pending");
  assert.equal(result.session.items[0].acceptance, null);
  const ack = applyTool(result.session, "acknowledge_handoff", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], by: "Morgan" }, "ack-open-question");
  assert.equal(ack.result.code, "RECONCILIATION_REQUIRED");
});

test("a participant can legitimately reconcile changed information with provenance", () => {
  let session = reviewed(fixture());
  session = applyTool(session, "compare_receiver_summary", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["r1"], receiverSummary: "The report is now available.", concerns: [{ field: "uncertainty", description: "Has the report arrived since the sender spoke?" }] }, "question").session;
  session = appendTurn(session, { id: "new-evidence", role: "sender", text: "Yes, the report just arrived. It still needs Dr. Lee's review." });
  const result = applyTool(session, "record_clarification", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["new-evidence"], clarification: "Sender reports the result has arrived; review is still pending.", changes: { uncertainty: "Report available, review pending" }, resolveAllReconciliation: true }, "clarify-update");
  assert.equal(result.result.ok, true);
  assert.equal(result.session.items[0].revision, 2);
  assert.equal(result.session.items[0].taskStatus, "pending");
  const question = result.session.issues.find((issue) => issue.kind === "reconciliation");
  assert.equal(question?.status, "resolved");
  assert.deepEqual(question?.resolutionSourceTurnIds, ["new-evidence"]);
});

test("failed clarification is atomic, even after a requested item change", () => {
  const before = fixture();
  const result = applyTool(before, "record_clarification", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["s1"], clarification: "Change owner and resolve question.", changes: { owner: "Dr. Patel" }, resolveIssueIds: ["does-not-exist"] }, "invalid-resolution");
  assert.equal(result.result.code, "ISSUE_NOT_FOUND");
  assert.deepEqual(result.session.items, before.items);
  assert.deepEqual(result.session.history, before.history);
  assert.deepEqual(result.session.issues, before.issues);
});

test("completion is only a sourced human report and preserves prior pending history", () => {
  let session = acknowledged(reviewed(fixture()));
  session = appendTurn(session, { id: "completed", role: "sender", text: "I am Dr. Lee; I report that I completed the review." });
  const result = applyTool(session, "record_clarification", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["completed"], clarification: "Dr. Lee reports the review completed.", changes: { taskStatus: "reported_complete", reportedBy: "Dr. Lee" } }, "report-completion");
  assert.equal(result.session.items[0].taskStatus, "reported_complete");
  assert.equal(result.session.items[0].completion?.reportedBy, "Dr. Lee");
  assert.deepEqual(result.session.items[0].completion?.sourceTurnIds, ["completed"]);
  assert.equal(result.session.items[0].acceptance, null);
  assert.equal(result.session.history.at(-1)?.previous?.taskStatus, "pending");
  assert.equal(summarize(result.session).reportedComplete, 1);
});

test("cancellation retains the item and its evidence without pretending completion", () => {
  const result = applyTool(fixture(), "revise_item", { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["s1"], changes: { taskStatus: "cancelled" } }, "cancel");
  assert.equal(result.session.items.length, 1);
  assert.equal(result.session.items[0].taskStatus, "cancelled");
  assert.equal(summarize(result.session).reportedComplete, 0);
  assert.equal(summarize(result.session).cancelled, 1);
  assert.equal(summarize(result.session).handoffComplete, false);
});

test("clean replay produces no mismatch questions and ends acknowledged but pending", () => {
  let session = createSession("clean");
  getReplaySteps(session).forEach((_, index) => { session = replayStep(session, index); });
  assert.equal(session.issues.filter((issue) => issue.kind === "reconciliation").length, 0);
  assert.equal(summarize(session).handoffComplete, true);
  assert.equal(summarize(session).pending, 1);
  const retry = replayStep(session, 2);
  assert.deepEqual(retry, session);
});

test("mismatch replay preserves source evidence, resolves questions, and never clears the scan", () => {
  let session = createSession();
  session = replayStep(session, 0);
  assert.equal(summarize(session).missingOwners, 1);
  session = replayStep(session, 1);
  assert.equal(session.issues.filter((issue) => issue.kind === "reconciliation" && issue.status === "open").length, 2);
  session = replayStep(session, 2);
  assert.equal(summarize(session).openIssues, 0);
  assert.equal(summarize(session).readyToAcknowledge, true);
  session = replayStep(session, 3);
  assert.equal(summarize(session).handoffComplete, true);
  assert.equal(session.items[0].uncertainty, "Scan result is pending.");
  assert.equal(session.items[0].revision, 2);
  assert.equal(session.items[0].sourceTurnIds.includes("replay-mismatch-1"), true);
});

test("turn retry is idempotent but conflicting reuse is rejected", () => {
  const session = appendTurn(createSession(), sender);
  assert.equal(appendTurn(session, sender), session);
  assert.throws(() => appendTurn(session, { ...sender, text: "Different statement" }), /different statement/);
  assert.equal(session.turns.length, 1);
});

test("function schemas are serializable, uniquely named, and require versioned evidence", () => {
  assert.equal(new Set(toolDefinitions.map((tool) => tool.name)).size, 6);
  assert.doesNotThrow(() => JSON.stringify(toolDefinitions));
  for (const tool of toolDefinitions.filter((tool) => !["capture_pending_item", "get_open_items"].includes(tool.name))) {
    const required = tool.parameters.required ?? [];
    assert.equal(required.includes("expectedRevision"), true);
    assert.equal(required.includes("sourceTurnIds"), true);
  }
});

test("the read tool returns actual source IDs and the latest 30 transcript turns", () => {
  let session = createSession();
  for (let index = 0; index < 35; index++) {
    session = appendTurn(session, { id: `aai-${index}`, role: index % 2 ? "receiver" : "sender", text: `Statement ${index}`, time: "2026-09-30T06:00:00.000Z" });
  }
  const result = applyTool(session, "get_open_items", {}, "read-sources");
  assert.equal(result.result.turns?.length, 30);
  assert.deepEqual(result.result.turns?.[0], session.turns[5]);
  assert.deepEqual(result.result.turns?.at(-1), session.turns[34]);
  assert.equal(session.processedCalls["read-sources"], undefined);
});
