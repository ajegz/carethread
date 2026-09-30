/**
 * CareThread's communication-state engine. All clinical content is supplied by
 * participants. This module does not infer a diagnosis, deadline, or treatment.
 */
export type Role = "sender" | "receiver" | "agent";
export type TaskStatus = "pending" | "reported_complete" | "cancelled";
export type IssueKind = "missing_owner" | "missing_timing" | "unreviewed" | "reconciliation";

export interface Turn {
  id: string;
  role: Role;
  text: string;
  time: string;
}

export interface Acceptance {
  revision: number;
  by: string;
  time: string;
  sourceTurnIds: string[];
}

export interface Item {
  id: string;
  patientId: string;
  sourceTurnIds: string[];
  revision: number;
  task: string;
  owner: string | null;
  due: string | null;
  condition: string | null;
  uncertainty: string | null;
  taskStatus: TaskStatus;
  reviewed: boolean;
  acceptance: Acceptance | null;
  completion: { reportedBy: string; time: string; sourceTurnIds: string[] } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  itemId: string;
  itemRevision: number;
  kind: IssueKind;
  field?: string;
  message: string;
  status: "open" | "resolved";
  sourceTurnIds: string[];
  resolution?: string;
  resolutionSourceTurnIds?: string[];
  createdAt: string;
  resolvedAt?: string;
}

export interface HistoryEntry {
  id: string;
  time: string;
  type: "capture" | "revision" | "clarification" | "comparison" | "acknowledgment";
  itemId: string;
  message: string;
  sourceTurnIds: string[];
  previous: Item | null;
  next: Item;
}

export interface Summary {
  total: number;
  pending: number;
  reportedComplete: number;
  cancelled: number;
  accepted: number;
  unaccepted: number;
  openIssues: number;
  missingOwners: number;
  missingTiming: number;
  unreviewed: number;
  handoffComplete: boolean;
  readyToAcknowledge: boolean;
}

export interface ToolResult {
  ok: boolean;
  code?: string;
  message: string;
  item?: Item;
  items?: Item[];
  issues?: Issue[];
  summary?: Summary;
  turns?: Turn[];
}

export interface Session {
  id: string;
  patient: { id: string; name: string };
  scenario: string;
  turns: Turn[];
  items: Item[];
  issues: Issue[];
  history: HistoryEntry[];
  processedCalls: Record<string, { fingerprint: string; result: ToolResult }>;
}

export type HandoffSession = Session;
export type HandoffItem = Item;
export type HandoffIssue = Issue;
export type ToolArguments = Record<string, unknown>;
type ItemChanges = Partial<Pick<Item, "task" | "owner" | "due" | "condition" | "uncertainty" | "taskStatus">> & {
  reportedBy?: string;
};

class ValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new ValidationError(code, message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_ARGUMENT", `${field} must be a nonempty string.`);
  if (value.length > 12_000) fail("INVALID_ARGUMENT", `${field} is too long.`);
  return value.trim();
}

function optionalText(value: unknown, field: string, unknownIsMissing = false): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = requiredText(value, field);
  if (unknownIsMissing && /^(unknown|unspecified|unassigned|not stated|not provided|tbd|to be determined|\?)$/i.test(text)) return null;
  return text;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_ARGUMENT", `${field} must be an object.`);
  return value as Record<string, unknown>;
}

function timestamp(value?: string): string {
  const result = value ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(result))) fail("INVALID_TIME", "The source time must be a valid timestamp.");
  return result;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function createSession(scenario = "mismatch"): Session {
  return {
    id: `session_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
    patient: { id: "demo-17", name: "Patient Demo-17" },
    scenario,
    turns: [],
    items: [],
    issues: [],
    history: [],
    processedCalls: {},
  };
}

/** Explicitly selected role, not authenticated identity or speaker recognition. */
export function appendTurn(session: Session, input: Omit<Turn, "id" | "time"> & Partial<Pick<Turn, "id" | "time">>): Session {
  if (!["sender", "receiver", "agent"].includes(input.role)) fail("INVALID_ROLE", "Choose sender, receiver, or agent.");
  const text = requiredText(input.text, "text");
  let id = input.id ? requiredText(input.id, "id") : `turn_${session.turns.length + 1}`;
  if (!input.id) while (session.turns.some((turn) => turn.id === id)) id = `${id}_next`;
  const existing = session.turns.find((turn) => turn.id === id);
  if (existing) {
    if (existing.role !== input.role || existing.text !== text || (input.time && existing.time !== input.time)) {
      fail("TURN_ID_CONFLICT", "This turn ID already refers to a different statement.");
    }
    return session;
  }
  const next = clone(session);
  next.turns.push({ id, role: input.role, text, time: timestamp(input.time) });
  return next;
}

function sourceTurns(session: Session, value: unknown, receiverOnly = false): Turn[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== "string")) {
    fail("SOURCE_REQUIRED", "Supply at least one existing human source turn ID.");
  }
  return [...new Set(value as string[])].map((id) => {
    const turn = session.turns.find((candidate) => candidate.id === id);
    if (!turn) fail("SOURCE_NOT_FOUND", `Source turn ${id} does not exist.`);
    if (turn.role === "agent") fail("HUMAN_SOURCE_REQUIRED", "The agent's own words cannot establish a clinical statement or acknowledgment.");
    if (receiverOnly && turn.role !== "receiver") fail("RECEIVER_SOURCE_REQUIRED", "An acknowledgment or receiver comparison needs a receiver source turn.");
    return turn;
  });
}

function findItem(session: Session, args: ToolArguments): Item {
  const id = requiredText(args.itemId, "itemId");
  const item = session.items.find((candidate) => candidate.id === id);
  if (!item) fail("ITEM_NOT_FOUND", `Item ${id} does not exist.`);
  if (!Number.isInteger(args.expectedRevision) || args.expectedRevision !== item.revision) {
    fail("REVISION_CONFLICT", `Item ${id} is at revision ${item.revision}; review that version before changing or acknowledging it.`);
  }
  return item;
}

function parseChanges(value: unknown): ItemChanges {
  const raw = object(value, "changes");
  const allowed = ["task", "owner", "due", "condition", "uncertainty", "taskStatus", "reportedBy"];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail("INVALID_ARGUMENT", `Unsupported item field: ${key}.`);
  const changes: ItemChanges = {};
  if ("task" in raw) changes.task = requiredText(raw.task, "task");
  for (const key of ["owner", "due", "condition", "uncertainty"] as const) {
    if (key in raw) changes[key] = optionalText(raw[key], key, key === "owner" || key === "due");
  }
  if ("taskStatus" in raw) {
    if (!["pending", "reported_complete", "cancelled"].includes(String(raw.taskStatus))) fail("INVALID_ARGUMENT", "Unknown task status.");
    changes.taskStatus = raw.taskStatus as TaskStatus;
  }
  if ("reportedBy" in raw) changes.reportedBy = requiredText(raw.reportedBy, "reportedBy");
  return changes;
}

function updateItem(item: Item, changes: ItemChanges, turns: Turn[]): boolean {
  const keys = ["task", "owner", "due", "condition", "uncertainty", "taskStatus"] as const;
  const substantive = keys.some((key) => key in changes && changes[key] !== item[key]);
  if (substantive) {
    for (const key of keys) if (key in changes) Object.assign(item, { [key]: changes[key] });
    item.revision += 1;
    item.acceptance = null;
    item.reviewed = false;
    if (changes.taskStatus === "reported_complete") {
      const last = turns[turns.length - 1];
      item.completion = { reportedBy: changes.reportedBy ?? `${last.role} (selected role)`, time: last.time, sourceTurnIds: turns.map((turn) => turn.id) };
    } else if ("taskStatus" in changes) {
      item.completion = null;
    }
  }
  item.sourceTurnIds = [...new Set([...item.sourceTurnIds, ...turns.map((turn) => turn.id)])];
  item.updatedAt = turns[turns.length - 1].time;
  return substantive;
}

function openIssues(session: Session, itemId?: string): Issue[] {
  return session.issues.filter((issue) => issue.status === "open" && (!itemId || issue.itemId === itemId));
}

function nextIssueId(session: Session): string {
  return `issue_${session.issues.length + 1}`;
}

/** Missing facts stay missing; this never invents a person, timing, or plan. */
function reconcileRequiredFields(session: Session, item: Item, sourceIds: string[], time: string): void {
  const requirements: [IssueKind, boolean, string][] = [
    ["missing_owner", !item.owner, "Who is the stated owner of this task?"],
    ["missing_timing", !item.due, "What due time or event trigger did the clinician state?"],
    ["unreviewed", !item.reviewed, "A participant still needs to confirm this captured revision."],
  ];
  for (const [kind, missing, message] of requirements) {
    const current = session.issues.find((issue) => issue.itemId === item.id && issue.kind === kind && issue.status === "open");
    if (missing && item.taskStatus !== "cancelled") {
      if (current) {
        current.itemRevision = item.revision;
        current.sourceTurnIds = [...new Set([...current.sourceTurnIds, ...sourceIds])];
      } else {
        session.issues.push({ id: nextIssueId(session), itemId: item.id, itemRevision: item.revision, kind, message, status: "open", sourceTurnIds: [...sourceIds], createdAt: time });
      }
    } else if (current) {
      current.status = "resolved";
      current.resolution = item.taskStatus === "cancelled" ? "A participant reported this item cancelled; it remains in history." : "The current participant-sourced revision supplies this required detail.";
      current.resolutionSourceTurnIds = [...sourceIds];
      current.resolvedAt = time;
    }
  }
}

function addHistory(session: Session, type: HistoryEntry["type"], item: Item, previous: Item | null, turns: Turn[], message: string): void {
  session.history.push({ id: `history_${session.history.length + 1}`, time: turns[turns.length - 1].time, type, itemId: item.id, message, sourceTurnIds: turns.map((turn) => turn.id), previous: clone(previous), next: clone(item) });
}

export function summarize(session: Session): Summary {
  const active = session.items.filter((item) => item.taskStatus !== "cancelled");
  const accepted = active.filter((item) => item.reviewed && item.acceptance?.revision === item.revision).length;
  const issues = openIssues(session);
  return {
    total: session.items.length,
    pending: active.filter((item) => item.taskStatus === "pending").length,
    reportedComplete: active.filter((item) => item.taskStatus === "reported_complete").length,
    cancelled: session.items.length - active.length,
    accepted,
    unaccepted: active.length - accepted,
    openIssues: issues.length,
    missingOwners: active.filter((item) => !item.owner).length,
    missingTiming: active.filter((item) => !item.due).length,
    unreviewed: active.filter((item) => !item.reviewed).length,
    handoffComplete: active.length > 0 && accepted === active.length && issues.length === 0,
    readyToAcknowledge: active.length > 0 && accepted < active.length && issues.length === 0,
  };
}

function success(session: Session, message: string, item?: Item): ToolResult {
  return { ok: true, message, ...(item ? { item: clone(item) } : {}), issues: clone(openIssues(session)), summary: summarize(session) };
}

function execute(session: Session, name: string, args: ToolArguments): ToolResult {
  if (name === "get_open_items") {
    return { ...success(session, "Use these actual transcript turn IDs as evidence. Acknowledgment and reported clinical completion are separate states."), items: clone(session.items.filter((item) => item.taskStatus !== "cancelled")), turns: clone(session.turns.slice(-30)) };
  }
  if (name === "capture_pending_item") {
    const turns = sourceTurns(session, args.sourceTurnIds);
    const time = turns[turns.length - 1].time;
    const item: Item = {
      id: `item_${session.items.length + 1}`, patientId: session.patient.id, sourceTurnIds: turns.map((turn) => turn.id), revision: 1,
      task: requiredText(args.task, "task"), owner: optionalText(args.owner, "owner", true), due: optionalText(args.due, "due", true),
      condition: optionalText(args.condition, "condition"), uncertainty: optionalText(args.uncertainty, "uncertainty"),
      taskStatus: "pending", reviewed: false, acceptance: null, completion: null, createdAt: time, updatedAt: time,
    };
    session.items.push(item);
    reconcileRequiredFields(session, item, item.sourceTurnIds, time);
    addHistory(session, "capture", item, null, turns, "Captured a participant-sourced proposal; clinical work remains pending.");
    return success(session, "Pending item captured as a proposal. Ask participants for missing facts and confirmation.", item);
  }
  if (!["revise_item", "record_clarification", "compare_receiver_summary", "acknowledge_handoff"].includes(name)) fail("UNKNOWN_TOOL", `Unknown tool: ${name}.`);

  const item = findItem(session, args);
  const receiverOnly = name === "compare_receiver_summary" || name === "acknowledge_handoff";
  const turns = sourceTurns(session, args.sourceTurnIds, receiverOnly);
  const sourceIds = turns.map((turn) => turn.id);
  const time = turns[turns.length - 1].time;
  const previous = clone(item);

  if (name === "revise_item" || name === "record_clarification") {
    let clarification = "Participant-sourced revision recorded.";
    if (name === "record_clarification") clarification = requiredText(args.clarification, "clarification");
    const changes = args.changes === undefined && name === "record_clarification" ? {} : parseChanges(args.changes);
    const changed = updateItem(item, changes, turns);
    if (name === "record_clarification") {
      if (args.reviewed !== undefined && typeof args.reviewed !== "boolean") fail("INVALID_ARGUMENT", "reviewed must be a boolean.");
      if (args.resolveAllReconciliation !== undefined && typeof args.resolveAllReconciliation !== "boolean") fail("INVALID_ARGUMENT", "resolveAllReconciliation must be a boolean.");
      item.reviewed = args.reviewed !== false;
      if (!item.reviewed) item.acceptance = null;
      const rawIds = args.resolveIssueIds ?? [];
      if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string")) fail("INVALID_ARGUMENT", "resolveIssueIds must be an array of issue IDs.");
      const ids = new Set(rawIds as string[]);
      if (args.resolveAllReconciliation === true) {
        for (const issue of openIssues(session, item.id)) if (issue.kind === "reconciliation") ids.add(issue.id);
      }
      for (const id of ids) {
        const issue = session.issues.find((candidate) => candidate.id === id);
        if (!issue || issue.itemId !== item.id || issue.kind !== "reconciliation") fail("ISSUE_NOT_FOUND", `Reconciliation issue ${id} does not belong to this item.`);
        issue.status = "resolved";
        issue.resolution = clarification;
        issue.resolutionSourceTurnIds = [...sourceIds];
        issue.resolvedAt = time;
      }
    }
    reconcileRequiredFields(session, item, sourceIds, time);
    addHistory(session, name === "revise_item" ? "revision" : "clarification", item, previous, turns, clarification);
    return success(session, changed ? "Revision saved. Earlier acknowledgment no longer applies to this changed item." : "Participant statement recorded against the current revision.", item);
  }

  if (name === "compare_receiver_summary") {
    const receiverSummary = requiredText(args.receiverSummary, "receiverSummary");
    const concerns = args.concerns ?? [];
    if (!Array.isArray(concerns)) fail("INVALID_ARGUMENT", "concerns must be an array.");
    const fields = ["task", "owner", "due", "condition", "uncertainty", "taskStatus"];
    for (const value of concerns) {
      const concern = object(value, "concern");
      const field = requiredText(concern.field, "field");
      if (!fields.includes(field)) fail("INVALID_ARGUMENT", `Unsupported comparison field: ${field}.`);
      const description = requiredText(concern.description, "description");
      const duplicate = openIssues(session, item.id).some((issue) => issue.kind === "reconciliation" && issue.field === field && issue.message === description && canonical(issue.sourceTurnIds) === canonical(sourceIds));
      if (!duplicate) session.issues.push({ id: nextIssueId(session), itemId: item.id, itemRevision: item.revision, kind: "reconciliation", field, message: description, status: "open", sourceTurnIds: [...sourceIds], createdAt: time });
    }
    // A possible change in meaning reopens the communication loop, not the diagnosis.
    if (concerns.length) item.acceptance = null;
    addHistory(session, "comparison", item, previous, turns, `Receiver comparison: ${receiverSummary}`);
    return success(session, concerns.length ? "Possible differences need participant reconciliation; no clinical fact or action was changed." : "No concern was supplied by the comparison. The item still needs explicit acknowledgment.", item);
  }

  if (item.taskStatus === "cancelled") fail("ITEM_CANCELLED", "Cancelled items remain in history and cannot be acknowledged as active work.");
  if (!item.owner) fail("MISSING_OWNER", "A clinician-stated owner is required before acknowledgment.");
  if (!item.due) fail("MISSING_TIMING", "A clinician-stated due time or event trigger is required before acknowledgment.");
  if (!item.reviewed) fail("REVIEW_REQUIRED", "A participant must confirm the captured revision before acknowledgment.");
  if (openIssues(session, item.id).length) fail("RECONCILIATION_REQUIRED", "Resolve this item's open questions before acknowledgment.");
  const by = requiredText(args.by, "by");
  item.acceptance = { revision: item.revision, by, time, sourceTurnIds: sourceIds };
  item.sourceTurnIds = [...new Set([...item.sourceTurnIds, ...sourceIds])];
  item.updatedAt = time;
  addHistory(session, "acknowledgment", item, previous, turns, `Receiver ${by} acknowledged revision ${item.revision}; task status remains ${item.taskStatus}.`);
  return success(session, "Receiver acknowledgment recorded. This does not report or verify clinical task completion.", item);
}

/** Atomic tool transition. A retry with the same ID returns its original result. */
export function applyTool(session: Session, name: string, input: unknown, callId: string): { session: Session; result: ToolResult } {
  let args: ToolArguments;
  let id: string;
  try {
    id = requiredText(callId, "callId");
    args = object(input, "arguments");
  } catch (error) {
    const failure = error as ValidationError;
    return { session, result: { ok: false, code: failure.code ?? "INVALID_ARGUMENT", message: failure.message } };
  }
  const fingerprint = canonical({ name, args });
  const previous = Object.prototype.hasOwnProperty.call(session.processedCalls, id) ? session.processedCalls[id] : undefined;
  if (previous) {
    if (previous.fingerprint !== fingerprint) return { session, result: { ok: false, code: "CALL_ID_CONFLICT", message: "This tool-call ID was already used with different arguments." } };
    return { session, result: clone(previous.result) };
  }
  let next = clone(session);
  let result: ToolResult;
  try {
    result = execute(next, name, args);
  } catch (error) {
    next = clone(session); // Roll back every partial mutation on failed validation.
    const failure = error as ValidationError;
    result = { ok: false, code: failure.code ?? "INVALID_ARGUMENT", message: failure.message, summary: summarize(session) };
  }
  // defineProperty also makes opaque call IDs such as "__proto__" safe cache keys.
  Object.defineProperty(next.processedCalls, id, { value: { fingerprint, result: clone(result) }, enumerable: true, writable: true, configurable: true });
  return { session: next, result };
}

const nullableText = { type: ["string", "null"] };
const sourcesProperty = { type: "array", items: { type: "string" }, minItems: 1, description: "Existing human transcript turn IDs containing the participant's actual statement. Never cite an agent turn." };
const itemProperties = {
  task: { type: "string", description: "Exact participant-stated action; do not propose a clinical action." },
  owner: { ...nullableText, description: "Clinician-stated owner, or null when unstated." },
  due: { ...nullableText, description: "Clinician-stated time or event trigger, or null. Do not infer a deadline." },
  condition: { ...nullableText, description: "Stated prerequisite/condition. Unknown is null, never silently 'none'." },
  uncertainty: { ...nullableText, description: "Preserve participant-stated uncertainty, e.g. result pending. Do not infer a diagnosis or normal result." },
};
const changesSchema = { type: "object", additionalProperties: false, properties: { ...itemProperties, taskStatus: { type: "string", enum: ["pending", "reported_complete", "cancelled"] }, reportedBy: { type: "string", description: "Who explicitly reported completion; not the AI." } } };
const versionProperties = { itemId: { type: "string" }, expectedRevision: { type: "integer", minimum: 1 }, sourceTurnIds: sourcesProperty };

/** AssemblyAI Voice Agent function-tool definitions (not OpenAI's nested shape). */
export const toolDefinitions = [
  { type: "function", name: "capture_pending_item", description: "Capture one participant-stated unfinished task as an unreviewed proposal. Include only facts supported by the cited human turns; leave missing fields null. Never duplicate an existing task: revise it instead.", parameters: { type: "object", additionalProperties: false, properties: { ...itemProperties, sourceTurnIds: sourcesProperty }, required: ["task", "sourceTurnIds"] } },
  { type: "function", name: "revise_item", description: "Apply an explicit human correction to an existing item. Supply its current revision and a cited human source. A substantive change invalidates prior review and acknowledgment; it does not perform the clinical action.", parameters: { type: "object", additionalProperties: false, properties: { ...versionProperties, changes: changesSchema }, required: ["itemId", "expectedRevision", "sourceTurnIds", "changes"] } },
  { type: "function", name: "record_clarification", description: "Record a participant's explicit clarification/confirmation, optionally revising the captured facts and resolving communication questions. Only use reviewed=true when a participant has confirmed the captured plan; never use the agent's own confirmation. Resolve concerns only when a human statement reconciles them. Reported completion means a human reported it, not that the system verified it.", parameters: { type: "object", additionalProperties: false, properties: { ...versionProperties, clarification: { type: "string" }, changes: changesSchema, reviewed: { type: "boolean" }, resolveIssueIds: { type: "array", items: { type: "string" } }, resolveAllReconciliation: { type: "boolean", description: "True only when the cited participant clarification explicitly resolves all current comparison questions for this item." } }, required: ["itemId", "expectedRevision", "sourceTurnIds", "clarification"] } },
  { type: "function", name: "compare_receiver_summary", description: "Record the receiver's understanding and possible communication differences as questions, not medical verdicts. Cite receiver turns. Use an empty concerns array for a faithful readback; never manufacture concerns. A legitimate new result may explain a difference: ask participants. Does not acknowledge the handoff or change clinical facts.", parameters: { type: "object", additionalProperties: false, properties: { ...versionProperties, receiverSummary: { type: "string" }, concerns: { type: "array", items: { type: "object", additionalProperties: false, properties: { field: { type: "string", enum: ["task", "owner", "due", "condition", "uncertainty", "taskStatus"] }, description: { type: "string", description: "A specific question to reconcile the cited receiver words with the captured plan." } }, required: ["field", "description"] } } }, required: ["itemId", "expectedRevision", "sourceTurnIds", "receiverSummary", "concerns"] } },
  { type: "function", name: "acknowledge_handoff", description: "Record a receiver's explicit acknowledgment of the current reviewed item. Cite receiver speech and the stated receiver name. Do not call for silence, a vague 'someone will handle it', or an agent statement. Missing owner/timing, unresolved questions, and stale revisions reject acknowledgment. Acknowledged does not mean completed.", parameters: { type: "object", additionalProperties: false, properties: { ...versionProperties, by: { type: "string" } }, required: ["itemId", "expectedRevision", "sourceTurnIds", "by"] } },
  { type: "function", name: "get_open_items", description: "Read active items, current revisions, open questions, and the latest 30 transcript turns with actual IDs, roles, text, and times. Call this to look up sourceTurnIds; never invent them. Pending work can already be acknowledged. Use current revisions before a change or acknowledgment.", parameters: { type: "object", additionalProperties: false, properties: {} } },
];

export interface ReplayStep {
  id: string;
  title: string;
  role: "sender" | "receiver";
  text: string;
  tools: { name: string; args: ToolArguments }[];
}

/** Labeled, synthetic replay. These utterances are not a clinical protocol. */
export const replaySteps: ReplayStep[] = [
  { id: "mismatch-1", title: "An unfinished review", role: "sender", text: "For Patient Demo-17, the scan result is pending. Discharge is waiting for the review.", tools: [{ name: "capture_pending_item", args: { task: "Review the scan result", owner: null, due: null, condition: "Discharge is waiting for the review, as stated by the sender.", uncertainty: "Scan result is pending.", sourceTurnIds: ["replay-mismatch-1"] } }] },
  { id: "mismatch-2", title: "A change in meaning", role: "receiver", text: "The scan was clear, so the patient is ready for discharge.", tools: [{ name: "compare_receiver_summary", args: { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["replay-mismatch-2"], receiverSummary: "The receiver described the scan as clear and the patient as ready for discharge.", concerns: [{ field: "uncertainty", description: "The sender described a pending result; the receiver described a clear result. Has new information become available?" }, { field: "condition", description: "The sender said discharge is waiting for review. Has that review now been reported?" }] } }] },
  { id: "mismatch-3", title: "The sender clarifies", role: "sender", text: "No new result and no review yet. I confirm the scan is still pending. Dr. Lee will review it by three p.m.; discharge is still waiting for that review.", tools: [{ name: "record_clarification", args: { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["replay-mismatch-3"], clarification: "The sender confirms no new result or review; Dr. Lee owns the review by 3 p.m. The prerequisite remains unchanged.", changes: { owner: "Dr. Lee", due: "By 3 p.m., as stated by the sender" }, reviewed: true, resolveAllReconciliation: true } }] },
  { id: "mismatch-4", title: "Acknowledged, still pending", role: "receiver", text: "I am Nurse Morgan. I acknowledge that Dr. Lee owns the scan review by three p.m. The result is still pending, and discharge is waiting for the review.", tools: [{ name: "acknowledge_handoff", args: { itemId: "item_1", expectedRevision: 2, sourceTurnIds: ["replay-mismatch-4"], by: "Nurse Morgan" } }] },
];

export const cleanReplaySteps: ReplayStep[] = [
  { id: "clean-1", title: "A complete stated plan", role: "sender", text: "For Patient Demo-17, the scan result is pending. Dr. Lee will review it by three p.m. Discharge is waiting for that review.", tools: [{ name: "capture_pending_item", args: { task: "Review the scan result", owner: "Dr. Lee", due: "By 3 p.m., as stated by the sender", condition: "Discharge is waiting for the review, as stated by the sender.", uncertainty: "Scan result is pending.", sourceTurnIds: ["replay-clean-1"] } }] },
  { id: "clean-2", title: "The sender confirms the capture", role: "sender", text: "I confirm the captured task: Dr. Lee reviews by three p.m., and the result remains pending with discharge waiting for review.", tools: [{ name: "record_clarification", args: { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["replay-clean-2"], clarification: "The sender confirms the captured plan without a correction.", reviewed: true } }] },
  { id: "clean-3", title: "A faithful receiver acknowledgment", role: "receiver", text: "I am Nurse Morgan. I acknowledge Dr. Lee's review by three p.m.; the result is pending and discharge is waiting for review.", tools: [{ name: "compare_receiver_summary", args: { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["replay-clean-3"], receiverSummary: "Dr. Lee reviews by 3 p.m.; the result remains pending and review is a stated prerequisite.", concerns: [] } }, { name: "acknowledge_handoff", args: { itemId: "item_1", expectedRevision: 1, sourceTurnIds: ["replay-clean-3"], by: "Nurse Morgan" } }] },
];

export function getReplaySteps(sessionOrScenario: Session | string): ReplayStep[] {
  const scenario = typeof sessionOrScenario === "string" ? sessionOrScenario : sessionOrScenario.scenario;
  return scenario === "clean" ? cleanReplaySteps : replaySteps;
}

export function replayStep(session: Session, index: number): Session {
  const step = getReplaySteps(session)[index];
  if (!Number.isInteger(index) || !step) return session;
  let next = appendTurn(session, { id: `replay-${step.id}`, role: step.role, text: step.text, time: `2026-09-30T06:${String(index).padStart(2, "0")}:00.000Z` });
  for (const [toolIndex, tool] of step.tools.entries()) {
    const transition = applyTool(next, tool.name, tool.args, `replay-${step.id}-${toolIndex}`);
    if (!transition.result.ok) fail(transition.result.code ?? "REPLAY_FAILED", transition.result.message);
    next = transition.session;
  }
  return next;
}
