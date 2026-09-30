import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, getReplaySteps, replayStep } from '../lib/handoff';
import { parseSavedWorkspace, type SavedWorkspace } from '../components/session-store';

function workspace(scenario = 'mismatch'): SavedWorkspace {
  let session = createSession(scenario);
  getReplaySteps(session).forEach((_, index) => { session = replayStep(session, index); });
  return { session, role: 'receiver', mode: 'guided', replayIndex: getReplaySteps(session).length };
}

test('valid replay state restores with source evidence and acknowledgment intact', () => {
  for (const scenario of ['mismatch', 'clean']) {
    const saved = workspace(scenario);
    assert.deepEqual(parseSavedWorkspace(structuredClone(saved)), saved);
  }
});

test('blank but valid workspace is restorable', () => {
  const saved: SavedWorkspace = { session: createSession(), role: 'sender', mode: 'guided', replayIndex: 0 };
  assert.deepEqual(parseSavedWorkspace(saved), saved);
});

test('corrupt nested records cannot reach the renderer', () => {
  const mutations: Array<(saved: SavedWorkspace) => void> = [
    (saved) => { saved.session.patient = null as never; },
    (saved) => { saved.session.items[0] = null as never; },
    (saved) => { saved.session.items[0].sourceTurnIds = ['missing-source']; },
    (saved) => { saved.session.items[0].taskStatus = 'complete' as never; },
    (saved) => { saved.session.items[0].acceptance!.revision = 999; },
    (saved) => { saved.session.items[0].acceptance!.sourceTurnIds = [saved.session.turns[0].id]; },
    (saved) => { saved.session.turns[0].time = 'not-a-date'; },
    (saved) => { saved.session.issues[0].itemId = 'missing-item'; },
    (saved) => { saved.session.history[0].next = null as never; },
    (saved) => { saved.session.processedCalls = [] as never; },
  ];
  for (const mutate of mutations) {
    const saved = workspace();
    mutate(saved);
    assert.equal(parseSavedWorkspace(saved), null);
  }
});

test('source IDs must be unique and must identify existing participant statements', () => {
  const saved = workspace();
  saved.session.turns.push({ ...saved.session.turns[0] });
  assert.equal(parseSavedWorkspace(saved), null);
  const withAgentEvidence = workspace();
  withAgentEvidence.session.turns[0].role = 'agent';
  assert.equal(parseSavedWorkspace(withAgentEvidence), null);
});

test('stale replay controls are clamped without altering clinical state', () => {
  const saved = workspace();
  saved.replayIndex = -10;
  assert.equal(parseSavedWorkspace(saved)?.replayIndex, 0);
  saved.replayIndex = 999;
  assert.equal(parseSavedWorkspace(saved)?.replayIndex, getReplaySteps(saved.session).length);
  assert.deepEqual(parseSavedWorkspace(saved)?.session.items, saved.session.items);
});

test('reported completion without the reporting source cannot be restored as fact', () => {
  const saved = workspace();
  saved.session.items[0].taskStatus = 'reported_complete';
  saved.session.items[0].completion = null;
  assert.equal(parseSavedWorkspace(saved), null);
});
