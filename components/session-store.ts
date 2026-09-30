import { getReplaySteps, type HandoffSession, type Item } from '@/lib/handoff';

export type SavedWorkspace = {
  session: HandoffSession;
  role: 'sender' | 'receiver';
  mode: 'guided' | 'live';
  replayIndex: number;
};

const DATABASE = 'carethread-simulation';
const STORE = 'workspace';
let databasePromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const optionalText = (value: unknown): boolean => value === null || text(value);
const validTime = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value));

/** Reject incompatible/corrupt snapshots before they can enter the render/engine. */
export function parseSavedWorkspace(value: unknown): SavedWorkspace | null {
  if (!record(value) || !record(value.session)) return null;
  const session = value.session;
  if (!text(session.id) || !text(session.scenario) || !record(session.patient)
    || !text(session.patient.id) || !text(session.patient.name)
    || !Array.isArray(session.turns) || !Array.isArray(session.items)
    || !Array.isArray(session.issues) || !Array.isArray(session.history)
    || !record(session.processedCalls)) return null;

  const patientId = session.patient.id;
  const turns = new Map<string, Record<string, unknown>>();
  for (const turn of session.turns) {
    if (!record(turn) || !text(turn.id) || turns.has(turn.id) || !text(turn.text)
      || !['sender', 'receiver', 'agent'].includes(String(turn.role)) || !validTime(turn.time)) return null;
    turns.set(turn.id, turn);
  }
  const sources = (ids: unknown, receiverOnly = false): boolean => Array.isArray(ids) && ids.length > 0
    && ids.every((id) => typeof id === 'string' && turns.has(id) && turns.get(id)?.role !== 'agent'
      && (!receiverOnly || turns.get(id)?.role === 'receiver'));
  const validItem = (item: unknown): item is Item => {
    if (!record(item) || !text(item.id) || item.patientId !== patientId
      || !Number.isInteger(item.revision) || Number(item.revision) < 1 || !text(item.task)
      || !sources(item.sourceTurnIds) || !validTime(item.createdAt) || !validTime(item.updatedAt)
      || typeof item.reviewed !== 'boolean' || !['pending', 'reported_complete', 'cancelled'].includes(String(item.taskStatus))
      || !['owner', 'due', 'condition', 'uncertainty'].every((key) => optionalText(item[key]))) return false;
    if (item.acceptance !== null) {
      if (!record(item.acceptance) || item.acceptance.revision !== item.revision || item.reviewed !== true
        || !text(item.owner) || !text(item.due) || item.taskStatus === 'cancelled'
        || !text(item.acceptance.by) || !validTime(item.acceptance.time) || !sources(item.acceptance.sourceTurnIds, true)) return false;
    }
    if (item.taskStatus === 'reported_complete') {
      return record(item.completion) && text(item.completion.reportedBy)
        && validTime(item.completion.time) && sources(item.completion.sourceTurnIds);
    }
    return item.completion === null;
  };
  const items = new Map<string, Item>();
  for (const item of session.items) {
    if (!validItem(item) || items.has(item.id)) return null;
    items.set(item.id, item);
  }
  const issueIds = new Set<string>();
  for (const issue of session.issues) {
    if (!record(issue) || !text(issue.id) || issueIds.has(issue.id) || !text(issue.itemId) || !items.has(issue.itemId)
      || !Number.isInteger(issue.itemRevision) || Number(issue.itemRevision) < 1 || Number(issue.itemRevision) > items.get(issue.itemId)!.revision
      || !['missing_owner', 'missing_timing', 'unreviewed', 'reconciliation'].includes(String(issue.kind))
      || !['open', 'resolved'].includes(String(issue.status)) || !text(issue.message)
      || !sources(issue.sourceTurnIds) || !validTime(issue.createdAt)) return null;
    if (issue.status === 'resolved' && (!text(issue.resolution) || !validTime(issue.resolvedAt) || !sources(issue.resolutionSourceTurnIds))) return null;
    issueIds.add(issue.id);
  }
  for (const entry of session.history) {
    if (!record(entry) || !text(entry.id) || !text(entry.itemId) || !items.has(entry.itemId)
      || !['capture', 'revision', 'clarification', 'comparison', 'acknowledgment'].includes(String(entry.type))
      || !text(entry.message) || !validTime(entry.time) || !sources(entry.sourceTurnIds)
      || !validItem(entry.next) || entry.next.id !== entry.itemId
      || (entry.previous !== null && (!validItem(entry.previous) || entry.previous.id !== entry.itemId))) return null;
  }
  for (const cached of Object.values(session.processedCalls)) {
    if (!record(cached) || typeof cached.fingerprint !== 'string' || !record(cached.result)
      || typeof cached.result.ok !== 'boolean' || typeof cached.result.message !== 'string') return null;
  }
  const acceptedSession = session as unknown as HandoffSession;
  const replayIndex = Number.isInteger(value.replayIndex) ? Number(value.replayIndex) : 0;
  return {
    session: acceptedSession,
    role: value.role === 'receiver' ? 'receiver' : 'sender',
    mode: value.mode === 'live' ? 'live' : 'guided',
    replayIndex: Math.min(Math.max(0, replayIndex), getReplaySteps(acceptedSession).length),
  };
}

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is unavailable.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
    request.onblocked = () => reject(new Error('Close older CareThread tabs to enable browser storage.'));
  }).catch((error) => { databasePromise = null; throw error; });
  databasePromise = opening;
  return opening;
}

export async function loadWorkspace(): Promise<SavedWorkspace | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
    request.onsuccess = () => {
      resolve(parseSavedWorkspace(request.result));
    };
    request.onerror = () => reject(request.error);
  });
}

export function saveWorkspace(workspace: SavedWorkspace): Promise<void> {
  const snapshot = structuredClone(workspace);
  // Serialize writes so a slower old render cannot overwrite a newer correction.
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(snapshot, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving was interrupted.'));
    });
  });
  return writeQueue;
}
