'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, AudioLines, Check,
  CheckCheck, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck,
  Clock3, Download, FileText, Fingerprint, Headphones, History, Info, Link2,
  LoaderCircle, MessageSquareText, Mic, MoreHorizontal, Pencil, Play,
  Plus, Printer, Radio, RotateCcw, Send, ShieldCheck, Square,
  UserRound, UsersRound, X, AlertCircle,
} from 'lucide-react';
import {
  appendTurn, applyTool, createSession, getReplaySteps, replayStep, summarize,
  type HandoffSession,
} from '@/lib/handoff';
import { useVoice } from '@/lib/use-voice';
import { Dialog } from '@/components/dialog';
import { loadWorkspace, saveWorkspace } from '@/components/session-store';

type Role = 'sender' | 'receiver';
type Item = HandoffSession['items'][number];
type Modal = { kind: 'reset'; scenario?: string; mode?: 'guided' | 'live' } | { kind: 'edit' | 'accept' | 'complete'; itemId: string } | { kind: 'about' | 'history' } | null;

const roleNames = { sender: 'Sender', receiver: 'Receiver', agent: 'CareThread' };
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const uniqueId = (prefix = 'manual') => `${prefix}-${crypto.randomUUID()}`;

function Logo() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true"><AudioLines size={21} strokeWidth={2} /></span><span>CareThread</span></span>;
}

function EmptyState({ small = false }: { small?: boolean }) {
  return <div className={`empty-state ${small ? 'empty-small' : ''}`}>
    <div className="empty-illustration" aria-hidden="true">{small ? <MessageSquareText size={34} strokeWidth={1.4} /> : <ClipboardCheck size={40} strokeWidth={1.3} />}</div>
    <h3>{small ? 'Your conversation, kept in context' : 'A place for the next step'}</h3>
    <p>{small ? 'Source statements will appear here as the handoff unfolds.' : 'Start a handoff to capture pending work, who owns it, and what happens next.'}</p>
  </div>;
}

export default function Home() {
  const [session, setSession] = useState<HandoffSession>(() => createSession());
  const sessionRef = useRef(session);
  const [role, setRole] = useState<Role>('sender');
  const [mode, setMode] = useState<'guided' | 'live'>('guided');
  const [replayIndex, setReplayIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<'saving' | 'saved' | 'unavailable'>('saved');
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [activeNav, setActiveNav] = useState('workspace');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const currentItem = modal && 'itemId' in modal ? session.items.find((item) => item.id === modal.itemId) : undefined;

  const commit = useCallback((next: HandoffSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const onTurn = useCallback((turnRole: 'sender' | 'receiver' | 'agent', turnText: string, id: string) => {
    commit(appendTurn(sessionRef.current, { id, role: turnRole, text: turnText }));
  }, [commit]);

  const onTool = useCallback((name: string, args: Record<string, unknown>, id: string) => {
    const update = applyTool(sessionRef.current, name, args, id);
    commit(update.session);
    return update.result;
  }, [commit]);

  const voice = useVoice({ session, getSession: () => sessionRef.current, role, onTurn, onTool });
  const voiceActive = ['connecting', 'listening', 'speaking'].includes(voice.status);
  const summary = summarize(session);
  const steps = getReplaySteps(session);
  const nextStep = steps[replayIndex];
  const guidedLocked = mode === 'guided' && replayIndex < steps.length;
  const editsLocked = guidedLocked || voiceActive;
  const openIssues = session.issues.filter((issue) => issue.status === 'open');
  const reconciliationIssues = openIssues.filter((issue) => issue.kind === 'reconciliation');
  const activeItems = session.items.filter((item) => item.taskStatus !== 'cancelled');
  const phase = !activeItems.length ? 0 : openIssues.length ? 1 : summary.handoffComplete ? 3 : 2;

  useEffect(() => {
    let active = true;
    loadWorkspace().then((saved) => {
      if (!active) return;
      if (saved) {
        commit(saved.session);
        setRole(saved.role);
        setMode(saved.mode);
        setReplayIndex(saved.replayIndex);
      }
    }).catch(() => { if (active) setStorage('unavailable'); }).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, [commit]);

  useEffect(() => {
    if (!hydrated || storage === 'unavailable') return;
    setStorage('saving');
    const timer = setTimeout(() => {
      saveWorkspace({ session, role, mode, replayIndex }).then(() => setStorage('saved')).catch(() => setStorage('unavailable'));
    }, 300);
    return () => clearTimeout(timer);
    // storage is deliberately excluded: saving state should not schedule another write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role, mode, replayIndex, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const showEvidence = (ids: string[]) => {
    setSelectedEvidence(ids);
    setActiveNav('conversation');
    requestAnimationFrame(() => {
      const first = ids[0] ? document.getElementById(`turn-${ids[0]}`) : null;
      (first ?? document.getElementById('conversation'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const advanceReplay = () => {
    if (!nextStep || voiceActive) return;
    try {
      const nextSession = replayStep(sessionRef.current, replayIndex);
      if (nextStep.role === 'sender' || nextStep.role === 'receiver') setRole(nextStep.role);
      commit(nextSession);
      setReplayIndex((index) => index + 1);
      setSelectedEvidence([]);
    } catch {
      setNotice({ text: 'This record has changed since the scripted scenario began. Restart the guided scenario to continue, or switch to Live voice.', kind: 'error' });
    }
  };

  const reset = (scenario = 'mismatch', nextMode?: 'guided' | 'live') => {
    voice.stop();
    commit(createSession(scenario));
    if (nextMode) setMode(nextMode);
    setRole('sender');
    setReplayIndex(0);
    setSelectedEvidence([]);
    setText('');
    setModal(null);
    setNotice({ text: 'A fresh synthetic handoff is ready.', kind: 'success' });
  };

  const manualTool = (name: string, args: Record<string, unknown>, sourceText: string, sourceRole: Role) => {
    const turnId = uniqueId('review');
    const withTurn = appendTurn(sessionRef.current, { id: turnId, role: sourceRole, text: sourceText });
    const update = applyTool(withTurn, name, { ...args, sourceTurnIds: [turnId] }, uniqueId('tool'));
    commit(update.session);
    setNotice({ text: update.result.message, kind: update.result.ok ? 'success' : 'error' });
    return update.result.ok;
  };

  const markReviewed = (item: Item) => {
    manualTool('record_clarification', {
      itemId: item.id, expectedRevision: item.revision,
      clarification: 'The sender reviewed the captured task and its current details.', reviewed: true,
    }, `I have reviewed revision ${item.revision} of this handoff item: ${item.task}. Owner: ${item.owner ?? 'not yet stated'}. Timing: ${item.due ?? 'not yet stated'}. Condition: ${item.condition ?? 'not stated'}. Uncertainty: ${item.uncertainty ?? 'not stated'}.`, 'sender');
  };

  const exportJson = () => {
    const file = {
      product: 'CareThread', type: 'synthetic-clinical-communication-simulation', exportedAt: new Date().toISOString(),
      note: 'Clinician statements and acknowledgments are recorded for review. Reported completion is not independently verified.',
      summary, session,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `carethread-${session.patient.id}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: 'Session exported with source turns and revision history.', kind: 'success' });
  };

  const startLive = async (microphone = true) => {
    setMode('live');
    setNotice(null);
    await voice.start({ microphone, accessCode });
  };

  const sendText = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sendingText || mode !== 'live') return;
    setSendingText(true);
    try {
      if (!voiceActive) await voice.start({ microphone: false, accessCode });
      if (voice.sendText(text.trim())) setText('');
      else setNotice({ text: 'Your message is still here. Wait for the connection to be ready, or reconnect, then send it again.', kind: 'error' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Could not send this turn. Please reconnect.', kind: 'error' });
    } finally { setSendingText(false); }
  };

  const switchMode = (next: 'live' | 'guided') => {
    if (next === mode) return;
    if (voiceActive) voice.stop();
    if (next === 'guided' && sessionRef.current.turns.length > 0) {
      setModal({ kind: 'reset', scenario: session.scenario, mode: 'guided' });
      return;
    }
    setMode(next);
  };

  if (!hydrated) return <div className="boot-screen"><Logo /><LoaderCircle className="spin" size={22} /><p>Opening your handoff workspace…</p></div>;

  return <div className="app-shell">
    <a href="#workspace" className="skip-link">Skip to handoff workspace</a>
    <aside className="sidebar">
      <a className="brand-link" href="#workspace" aria-label="CareThread home" onClick={() => setActiveNav('workspace')}><Logo /></a>
      <p className="nav-label">Workspace</p>
      <nav aria-label="Workspace navigation">
        <a className={activeNav === 'workspace' ? 'nav-item active' : 'nav-item'} href="#workspace" onClick={() => setActiveNav('workspace')}><ClipboardCheck size={19} />Handoff<span className="nav-count">{activeItems.length}</span></a>
        <a className={activeNav === 'conversation' ? 'nav-item active' : 'nav-item'} href="#conversation" onClick={() => { setActiveNav('conversation'); setSelectedEvidence([]); }}><MessageSquareText size={18} />Conversation<span className="nav-count">{session.turns.length}</span></a>
        <button className="nav-item" onClick={() => setModal({ kind: 'history' })}><History size={18} />Revision history<span className="nav-count">{session.history.length}</span></button>
      </nav>
      <div className="sidebar-session-details"><p className="nav-label">Current handoff</p><a className="sidebar-patient" href="#workspace" onClick={() => setActiveNav('workspace')}><span className="sidebar-patient-avatar"><UserRound size={19} /></span><span className="sidebar-patient-detail"><strong>{session.patient.name}</strong><small>Nursing shift</small></span></a><p className="sidebar-case-note">Learning case {session.scenario === 'clean' ? '02' : '01'}<br />{session.scenario === 'clean' ? 'A clear handoff' : 'Pending result & review'}</p></div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal({ kind: 'about' })}><CircleHelp size={18} />About CareThread</button><div className="sidebar-user"><span className="user-initials"><ShieldCheck size={19} /></span><div><strong>Simulation workspace</strong><span>Synthetic data only</span></div></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="topbar-title"><span>Nursing handoff</span><span className="environment-badge">Simulation</span></div><div className="topbar-actions"><span className={`save-status ${storage === 'unavailable' ? 'save-warning' : ''}`}><span />{storage === 'saving' ? 'Saving…' : storage === 'saved' ? 'Saved on this device' : 'Session only · export to save'}</span><button className="button button-secondary toolbar-new" onClick={() => setModal({ kind: 'reset' })}><Plus size={16} /><span>New handoff</span></button><details className="toolbar-menu"><summary aria-label="Handoff options" title="Handoff options"><MoreHorizontal size={20} /></summary><div className="menu-panel"><button onClick={() => window.print()}><Printer size={16} />Print handoff</button><button onClick={exportJson}><Download size={16} />Export session</button><button onClick={() => setModal({ kind: 'history' })}><History size={16} />Revision history</button></div></details></div></header>

      <main id="workspace" tabIndex={-1}>
        <section className="page-heading"><div><h1>Handoff</h1><p>A shared understanding of what happens next.</p></div><span className="heading-context"><ShieldCheck size={15} />Clinical communication</span></section>

        <section className="patient-banner" aria-label="Current synthetic patient"><div className="patient-identity"><div className="patient-avatar"><UserRound size={25} /></div><div><div className="patient-title"><h2>{session.patient.name || 'Patient A'}</h2><span className="subtle-badge">SYNTHETIC</span></div><p>Nursing shift handoff <span>·</span> Learning case {session.scenario === 'clean' ? '02' : '01'}</p></div></div><div className="patient-context"><div><span>Care context</span><strong>Pending result &amp; review</strong></div><div className="handoff-state"><span>Handoff status</span><strong className={summary.handoffComplete ? 'text-teal' : ''}><span className={`status-dot ${summary.handoffComplete ? 'complete' : ''}`} />{summary.handoffComplete ? 'Acknowledged' : activeItems.length ? 'In progress' : 'Ready to begin'}</strong></div></div></section>

        <div className="journey" aria-label="Handoff progress">{[
          ['Capture', 'Hear the plan'], ['Clarify', 'Keep meaning intact'], ['Read back', 'Check understanding'], ['Acknowledge', 'Accept responsibility'],
        ].map(([label, detail], index) => <div key={label} className={`journey-step ${index === phase ? 'current' : ''} ${index < phase ? 'done' : ''}`}><span className="journey-number">{index < phase ? <Check size={13} /> : `0${index + 1}`}</span><div><strong>{label}</strong><span>{detail}</span></div>{index < 3 && <ChevronRight className="journey-arrow" size={16} />}</div>)}</div>

        <div className="workspace-grid">
          <section className="handoff-column" aria-labelledby="pending-heading">
            <div className="section-heading"><div><h2 id="pending-heading">Handoff items <span className="heading-count">{activeItems.length}</span></h2></div><span className="source-hint"><Link2 size={13} /> Source linked</span></div>

            {reconciliationIssues.length > 0 && <details className="reconciliation-panel"><summary className="reconciliation-summary"><AlertCircle size={19} /><span><strong>Readback needs clarification</strong><small>{reconciliationIssues.length} differences to review before acknowledgment</small></span><ChevronDown size={16} /></summary><div className="reconciliation-body"><p>Review the source statements together. New information may explain a changed plan.</p>{reconciliationIssues.map((issue) => <button key={issue.id} className="issue-evidence" onClick={() => showEvidence(issue.sourceTurnIds)}><span>{issue.message}</span><ArrowUpRight size={15} /></button>)}<button className="text-button clarify-button" disabled={editsLocked} onClick={() => setModal({ kind: 'edit', itemId: reconciliationIssues[0].itemId })}>Clarify the plan<ArrowRight size={14} /></button>{guidedLocked && <p className="guided-edit-note">Continue the scenario to hear the sender’s clarification.</p>}</div></details>}

            {activeItems.length === 0 ? <div className="empty-task-card"><EmptyState /><div className="empty-task-footer"><span><ShieldCheck size={15} /> Every captured detail stays reviewable.</span><button onClick={() => mode === 'guided' ? advanceReplay() : startLive()} className="text-button">{mode === 'guided' ? 'Try the guided handoff' : 'Start a conversation'}<ArrowRight size={15} /></button></div></div> : activeItems.map((item, index) => {
              const itemIssues = openIssues.filter((issue) => issue.itemId === item.id);
              const accepted = item.acceptance?.revision === item.revision;
              const complete = item.taskStatus === 'reported_complete';
              return <article className={`task-card ${accepted ? 'task-accepted' : ''}`} key={item.id}>
                <div className="task-card-top"><span className="task-index">ACTION {String(index + 1).padStart(2, '0')}</span><div className="task-meta"><span className={`pill ${complete ? 'pill-blue' : 'pill-neutral'}`}>{complete ? <CheckCheck size={12} /> : <Clock3 size={12} />}{complete ? 'Reported complete' : 'Pending'}</span><button className="icon-button" onClick={() => setModal({ kind: 'edit', itemId: item.id })} aria-label={`Edit ${item.task}`} title={guidedLocked ? "Finish the guided scenario or switch to Live voice to edit" : "Review or edit captured details"} disabled={editsLocked}><Pencil size={16} /></button></div></div>
                <h3>{item.task}</h3>
                {item.uncertainty && <div className="uncertainty-note"><span className="uncertainty-mark">?</span><div><span>Uncertainty</span><p>{item.uncertainty}</p></div></div>}
                <div className="task-fields"><button className={`task-field ${!item.owner ? 'field-missing' : ''}`} onClick={() => setModal({ kind: 'edit', itemId: item.id })} disabled={editsLocked}><span><UserRound size={13} />Responsible person</span><strong>{item.owner || 'Not yet stated'}{!item.owner && <Plus size={14} />}</strong></button><button className={`task-field ${!item.due ? 'field-missing' : ''}`} onClick={() => setModal({ kind: 'edit', itemId: item.id })} disabled={editsLocked}><span><Clock3 size={13} />Time or trigger</span><strong>{item.due || 'Needs clarification'}{!item.due && <Plus size={14} />}</strong></button></div>
                {item.condition && <div className="condition-row"><Link2 size={15} /><div><span>Condition</span><p>{item.condition}</p></div></div>}
                {item.completion && <div className="condition-row"><CheckCheck size={15} /><div><span>Completion report · not independently verified</span><p>Reported by {item.completion.reportedBy} at {time(item.completion.time)}.</p></div></div>}
                {itemIssues.filter((issue) => issue.kind !== 'reconciliation').length > 0 && <div className="item-questions">{itemIssues.filter((issue) => issue.kind !== 'reconciliation').map((issue) => <span key={issue.id}><span />{issue.message}</span>)}</div>}
                <div className="task-evidence-row"><button className="evidence-link" onClick={() => showEvidence(item.sourceTurnIds)}><Fingerprint size={14} />View source evidence<ArrowUpRight size={12} /></button><span>Sources {item.sourceTurnIds.map((id) => `#${String(session.turns.findIndex((turn) => turn.id === id) + 1).padStart(2, '0')}`).join(', ')} · Revision {item.revision}</span></div>
                <div className="task-card-bottom"><div className="review-status">{accepted ? <><CheckCircle2 size={17} /><span><strong>Accepted by {item.acceptance?.by}</strong><small>Responsibility acknowledged · work {complete ? 'reported complete' : 'still pending'}</small></span></> : item.reviewed ? <><ShieldCheck size={16} /><span>Sender reviewed<span className="status-divider">·</span>Awaiting receiver</span></> : <><span className="proposal-dot" /><span>Captured proposal<span className="status-divider">·</span>Review before accepting</span></>}</div><div className="task-actions">{!item.reviewed && <button className="button button-small button-secondary" onClick={() => markReviewed(item)} disabled={editsLocked}><Check size={14} />Sender review</button>}{!accepted && <button className="button button-small button-teal" onClick={() => setModal({ kind: 'accept', itemId: item.id })} disabled={editsLocked || !item.reviewed || !item.owner || !item.due || itemIssues.some((issue) => issue.kind === 'reconciliation')}><ClipboardCheck size={14} />Acknowledge</button>}{accepted && !complete && <button className="text-button compact" onClick={() => setModal({ kind: 'complete', itemId: item.id })} disabled={editsLocked}>Record completion<ArrowRight size={13} /></button>}</div></div>
              </article>;
            })}

            <div className={`handoff-summary ${summary.handoffComplete ? 'summary-accepted' : ''}`}><div className="summary-icon">{summary.handoffComplete ? <CheckCheck size={22} /> : <UsersRound size={22} />}</div><div><h3>{summary.handoffComplete ? 'Handoff acknowledged' : 'A shared plan, ready for review'}</h3><p>{summary.handoffComplete ? `${summary.pending} clinical ${summary.pending === 1 ? 'task remains' : 'tasks remain'} pending. Acceptance and completion are tracked separately.` : 'Review the captured details, then ask the receiver to read back and acknowledge the plan.'}</p></div>{summary.handoffComplete && <span className="accepted-seal"><Check size={18} /></span>}</div>

            <div className="metrics-row"><div><span>Pending work</span><strong>{summary.pending}<span>items</span></strong></div><div><span>Responsibility accepted</span><strong>{summary.accepted}<span>of {activeItems.length}</span></strong></div><div><span>Open questions</span><strong className={summary.openIssues ? 'text-amber' : ''}>{summary.openIssues}<span>to resolve</span></strong></div></div>
          </section>

          <aside className="studio-column" aria-label="Conversation controls">
            <div className="mode-tabs" role="group" aria-label="Conversation mode"><button aria-pressed={mode === 'guided'} className={mode === 'guided' ? 'selected' : ''} onClick={() => switchMode('guided')}><Play size={14} />Guided scenario</button><button aria-pressed={mode === 'live'} className={mode === 'live' ? 'selected' : ''} onClick={() => switchMode('live')}><Radio size={15} />Live voice</button></div>
            <div className={`voice-studio ${voiceActive ? 'voice-active' : ''}`}>
              <div className="studio-top"><span><span className={`studio-status-dot ${voiceActive ? 'pulse' : ''}`} />{mode === 'guided' ? 'Guided handoff' : voiceActive ? 'Live session' : 'Voice session'}</span><span className="studio-corner-mark"><AudioLines size={18} /></span></div>
              <div className="role-control"><span>Speaking as</span><div role="group" aria-label="Select speaker role"><button className={role === 'sender' ? 'selected' : ''} aria-pressed={role === 'sender'} onClick={() => setRole('sender')} disabled={mode === 'guided'}><UserRound size={14} />Sender</button><button className={role === 'receiver' ? 'selected' : ''} aria-pressed={role === 'receiver'} onClick={() => setRole('receiver')} disabled={mode === 'guided'}><UsersRound size={14} />Receiver</button></div></div>
              <div className={`voice-emblem ${voiceActive ? 'voice-wave-state' : ''}`} aria-hidden="true">{voice.status === 'connecting' ? <LoaderCircle className="spin" size={34} strokeWidth={1.6} /> : <AudioLines size={36} strokeWidth={1.7} />}</div>
              <div className="studio-copy"><h3>{mode === 'guided' ? replayIndex === 0 ? 'Try a handoff' : !nextStep ? 'Handoff complete' : 'Continue the handoff' : voice.status === 'connecting' ? 'Connecting your voice…' : voice.status === 'speaking' ? 'CareThread is speaking' : voice.status === 'listening' ? 'Listening' : voice.status === 'error' ? 'Reconnect to continue' : 'Start with your voice'}</h3><p>{mode === 'guided' ? 'A fictional case, one step at a time.' : voiceActive ? 'Speak naturally. You can interrupt at any time.' : 'Capture the pending work in a short conversation.'}</p></div>
              {mode === 'guided' ? <button className="button button-lime studio-main-button" onClick={nextStep ? advanceReplay : () => setModal({ kind: 'reset' })}><Play size={16} fill="currentColor" />{replayIndex === 0 ? 'Begin handoff' : !nextStep ? 'New handoff' : 'Continue'}<ArrowRight size={17} /></button> : <button className={`button studio-main-button ${voiceActive ? 'button-end' : 'button-lime'}`} onClick={() => voiceActive ? voice.stop() : startLive()} disabled={voice.status === 'connecting'}>{voice.status === 'connecting' ? <LoaderCircle className="spin" size={17} /> : voiceActive ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}{voice.status === 'connecting' ? 'Connecting…' : voiceActive ? 'End conversation' : 'Start conversation'}{voiceActive && <span className="session-timer">{Math.floor((voice.elapsedSeconds || 0) / 60)}:{String((voice.elapsedSeconds || 0) % 60).padStart(2, '0')}</span>}</button>}
              <div className="studio-footnote">{mode === 'guided' ? <><span />Scripted replay · no live AI call</> : <><span />AssemblyAI · sessions end before 3 minutes</>}</div>
            </div>

            {mode === 'guided' ? <div className="scenario-card"><div className="scenario-heading"><span className="section-kicker">Up next</span><span className="step-fraction">{Math.min(replayIndex + 1, steps.length)} / {steps.length}</span></div><h3>{nextStep?.title || 'Ready for review'}</h3><p>{nextStep?.text || 'The receiver has acknowledged the reviewed plan. A pending clinical task remains open until someone reports its completion.'}</p><div className="scenario-progress" aria-label={`Completed ${replayIndex} of ${steps.length} scenario steps`}>{steps.map((step, index) => <span key={step.id} className={index < replayIndex ? 'done' : index === replayIndex ? 'current' : ''} />)}</div><div className="scenario-footer"><span>{nextStep ? `${roleNames[nextStep.role]} speaks next` : 'Walkthrough complete'}</span><button title="Restart scenario" aria-label="Restart guided scenario" onClick={() => setModal({ kind: 'reset', scenario: session.scenario })}><RotateCcw size={14} /></button></div><details className="scenario-picker"><summary>Try another scenario<ChevronDown size={13} /></summary><button onClick={() => setModal({ kind: 'reset', scenario: session.scenario === 'clean' ? 'mismatch' : 'clean' })}>{session.scenario === 'clean' ? 'Pending result becomes a confirmed result' : 'A clear handoff with no meaning changes'}<ArrowRight size={13} /></button></details></div> : <div className="live-options"><p><Headphones size={16} /><span>A quiet space helps. Use only the synthetic case shown here.</span></p><details><summary>Live session access<ChevronDown size={14} /></summary><label className="field-label" htmlFor="access-code">Demo access code <span>provided by the host</span></label><input id="access-code" type="password" autoComplete="off" placeholder="Enter your demo code" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} /></details>{voice.error && <div className="voice-error" role="alert"><AlertCircle size={17} /><p>{voice.error}</p></div>}<button className="text-button" onClick={() => startLive(false)} disabled={voiceActive}><MessageSquareText size={14} />Connect with text instead<ArrowRight size={14} /></button></div>}

            <div className="review-note"><div className="review-note-icon"><ShieldCheck size={17} /></div><p><strong>Every detail is reviewable</strong><br />Source statements stay attached to each item.</p></div>
          </aside>
        </div>

        <section className="conversation-section" id="conversation" aria-labelledby="conversation-heading">
          <div className="section-heading"><div><h2 id="conversation-heading">Conversation <span className="heading-count">{session.turns.length}</span></h2></div><div className="conversation-tools">{selectedEvidence.length > 0 && <button className="button button-small button-secondary" onClick={() => setSelectedEvidence([])}>Clear highlight<X size={13} /></button>}<span className="subtle-badge">Source record</span></div></div>
          <div className="conversation-card"><div className="transcript-header"><span><span className={voiceActive ? 'status-dot complete pulse' : 'status-dot'} />{voiceActive ? 'Conversation in progress' : 'Session transcript'}</span><span><Link2 size={12} />Click an evidence link to trace a detail</span></div><div className="transcript-list" ref={transcriptRef} role="log" aria-live="polite" aria-relevant="additions">{session.turns.length === 0 ? <EmptyState small /> : session.turns.map((turn, index) => <article id={`turn-${turn.id}`} key={turn.id} className={`transcript-turn turn-${turn.role} ${selectedEvidence.includes(turn.id) ? 'evidence-highlight' : ''}`}><div className={`turn-avatar avatar-${turn.role}`}>{turn.role === 'agent' ? <AudioLines size={17} /> : turn.role === 'sender' ? <UserRound size={17} /> : <UsersRound size={17} />}</div><div className="turn-body"><div className="turn-heading"><strong>{roleNames[turn.role]}</strong><span>{turn.role === 'agent' ? 'Voice agent' : turn.role === 'sender' ? 'Outgoing clinician role' : 'Receiving clinician role'}</span><time dateTime={turn.time}>{time(turn.time)}</time></div><p>{turn.text}</p><div className="turn-source"><span>#{String(index + 1).padStart(2, '0')}</span><span>{turn.id.startsWith('replay-') ? 'Scripted replay' : turn.id.startsWith('review-') ? 'Participant review' : 'Live conversation'}</span>{selectedEvidence.includes(turn.id) && <span className="source-selected"><Fingerprint size={11} />Source evidence</span>}</div></div></article>)}{voiceActive && voice.partial && <div className="partial-transcript"><span className="status-dot complete pulse" /><p>{voice.partial}</p><span>Listening · provisional</span></div>}</div>
            <form className="text-turn-form" onSubmit={sendText}><label className="sr-only" htmlFor="text-turn">Send a text turn as {roleNames[role]}</label><MessageSquareText size={19} /><input id="text-turn" value={text} onChange={(event) => setText(event.target.value)} disabled={mode === 'guided'} placeholder={mode === 'guided' ? 'Switch to Live voice to send your own text turn…' : `Type a turn as ${roleNames[role].toLowerCase()}…`} /><button aria-label="Send text turn" type="submit" disabled={mode === 'guided' || !text.trim() || sendingText || voice.status === 'connecting'}>{sendingText ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></form><div className="text-turn-note">{mode === 'guided' ? 'Guided replay is prerecorded text. Live mode connects to the real AssemblyAI agent.' : 'Text turns use the live voice agent. Sending while disconnected starts a text-only session.'}</div>
          </div>
        </section>

        <section className="export-strip"><div className="export-icon"><FileText size={23} /></div><div><h3>Keep a copy</h3><p>Print the handoff and conversation. Export JSON for the full revision history.</p></div><div className="export-actions"><button className="button button-secondary" onClick={() => window.print()}><Printer size={16} />Print handoff</button><button className="button button-teal" onClick={exportJson}><Download size={16} />Export session</button></div></section>
        <footer className="main-footer"><Logo /><p>Continuity, in every conversation.</p><span>Synthetic patient · Communication simulation</span></footer>
      </main>
    </div>

    {notice && <div className={`toast toast-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.text}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}

    {modal?.kind === 'reset' && <Dialog title="Start a fresh handoff?" description="The current workspace will be replaced. Export the session first if you want to keep its conversation and history." onClose={() => setModal(null)}><div className="reset-case"><span className="case-icon"><FileText size={22} /></span><div><strong>{modal.scenario === 'clean' ? 'A clear handoff' : 'A pending result, a different readback'}</strong><p>One synthetic patient. A guided nursing shift transition.</p></div></div><div className="dialog-actions"><button className="button button-secondary" onClick={() => setModal(null)}>Keep this session</button><button className="button button-teal" onClick={() => reset(modal.scenario || 'mismatch', modal.mode)}><Plus size={16} />Start fresh</button></div></Dialog>}

    {modal?.kind === 'edit' && currentItem && <EditItemDialog item={currentItem} hasReconciliation={reconciliationIssues.some((issue) => issue.itemId === currentItem.id)} onClose={() => setModal(null)} onSave={(changes, note, resolve) => {
      const clarificationOnly = Object.keys(changes).length === 0;
      const updated = manualTool(resolve || clarificationOnly ? 'record_clarification' : 'revise_item', {
        itemId: currentItem.id, expectedRevision: currentItem.revision, changes,
        ...(resolve || clarificationOnly ? { clarification: note, reviewed: resolve || currentItem.reviewed, resolveAllReconciliation: resolve } : {}),
      }, note, 'sender');
      if (updated) setModal(null);
    }} />}

    {modal?.kind === 'accept' && currentItem && <AcceptDialog item={currentItem} onClose={() => setModal(null)} onAccept={(by, readback) => {
      const accepted = manualTool('acknowledge_handoff', { itemId: currentItem.id, expectedRevision: currentItem.revision, by }, readback, 'receiver');
      if (accepted) { setRole('receiver'); setModal(null); }
    }} />}

    {modal?.kind === 'complete' && currentItem && <CompleteDialog item={currentItem} onClose={() => setModal(null)} onComplete={(reportedBy, source) => {
      const updated = manualTool('revise_item', { itemId: currentItem.id, expectedRevision: currentItem.revision, changes: { taskStatus: 'reported_complete', reportedBy } }, source, 'sender');
      if (updated) setModal(null);
    }} />}

    {modal?.kind === 'about' && <Dialog title="About CareThread" description="CareThread is a clinical communication simulation built with AssemblyAI for the Voice Agent Hackathon." onClose={() => setModal(null)}><div className="about-points"><div><AudioLines size={22} /><h3>Listen with a purpose.</h3><p>Capture unfinished work and preserve exactly what remains uncertain.</p></div><div><UsersRound size={22} /><h3>Make understanding visible.</h3><p>Compare a receiver’s readback, resolve questions, and record acceptance of a specific revision.</p></div><div><Fingerprint size={22} /><h3>Keep the evidence close.</h3><p>Every captured item and change links back to a source statement.</p></div></div><div className="about-boundary"><Info size={17} /><p>Use synthetic data only. Speaker roles are selected, not authenticated. The prototype records statements; it does not diagnose, issue clinical orders, or independently verify completion. Browser records stay on this device; live voice is sent to AssemblyAI.</p></div><div className="dialog-actions"><button className="button button-teal" onClick={() => setModal(null)}>Back to the workspace<ArrowRight size={16} /></button></div></Dialog>}

    {modal?.kind === 'history' && <Dialog title="Revision history" description="A local record of captured items, corrections, and acknowledgments in this simulation." onClose={() => setModal(null)} wide>{session.history.length === 0 ? <p className="history-empty">Your revision history starts with the first captured item.</p> : <div className="history-list">{session.history.map((entry) => <div className="history-entry" key={entry.id}><span className="history-marker"><History size={14} /></span><div><div className="history-heading"><strong>{{capture:'Item captured',revision:'Plan revised',clarification:'Sender clarification',comparison:'Readback compared',acknowledgment:'Responsibility accepted'}[entry.type]}</strong><time dateTime={entry.time}>{time(entry.time)}</time></div><p>{entry.message}</p><span className="history-item">{entry.next.task} · Revision {entry.next.revision}</span>{entry.previous && <div className="history-changes">{(['task','owner','due','condition','uncertainty','taskStatus'] as const).filter((key) => entry.previous?.[key] !== entry.next[key]).map((key) => <div key={key}><strong>{{task:'Pending work',owner:'Responsible person',due:'Time or trigger',condition:'Condition',uncertainty:'Uncertainty',taskStatus:'Clinical work'}[key]}</strong><span>{String(entry.previous?.[key] ?? 'Not stated').replaceAll('_', ' ')}<ArrowRight size={12} />{String(entry.next[key] ?? 'Not stated').replaceAll('_', ' ')}</span></div>)}</div>}<button className="evidence-link" onClick={() => { setModal(null); showEvidence(entry.sourceTurnIds); }}><Fingerprint size={13} />View source statement<ArrowUpRight size={12} /></button></div></div>)}</div>}<div className="dialog-actions"><button className="button button-secondary" onClick={exportJson}><Download size={16} />Export full record</button><button className="button button-teal" onClick={() => setModal(null)}>Done</button></div></Dialog>}
  </div>;
}

function EditItemDialog({ item, hasReconciliation, onClose, onSave }: { item: Item; hasReconciliation: boolean; onClose: () => void; onSave: (changes: Record<string, string | null>, source: string, resolve: boolean) => void }) {
  const [task, setTask] = useState(item.task);
  const [owner, setOwner] = useState(item.owner || '');
  const [due, setDue] = useState(item.due || '');
  const [condition, setCondition] = useState(item.condition || '');
  const [uncertainty, setUncertainty] = useState(item.uncertainty || '');
  const [note, setNote] = useState('');
  const [resolve, setResolve] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const fields = { task: task.trim(), owner: owner.trim() || null, due: due.trim() || null, condition: condition.trim() || null, uncertainty: uncertainty.trim() || null };
    const changes: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(fields)) if (value !== item[key as keyof typeof fields]) changes[key] = value;
    if (Object.keys(changes).length === 0 && !resolve && !note.trim()) { onClose(); return; }
    if (resolve && !note.trim()) return;
    onSave(changes, `Sender correction to revision ${item.revision}. Task: ${fields.task}. Responsible person: ${fields.owner ?? 'not yet stated'}. Time or trigger: ${fields.due ?? 'not yet stated'}. Condition: ${fields.condition ?? 'not stated'}. Uncertainty: ${fields.uncertainty ?? 'not stated'}.${note.trim() ? ` Clarification: ${note.trim()}` : ''}${resolve ? ' I have reviewed the source statements, confirm these details, and resolve the readback questions for this item.' : ''}`, resolve);
  };
  return <Dialog title="Review details" description="Keep clinical wording faithful to the conversation. A correction creates a new revision and clears any acceptance of the older version." onClose={onClose}>
    <form onSubmit={submit} className="edit-form"><label className="field-label" htmlFor="edit-task">Pending work</label><textarea id="edit-task" required value={task} onChange={(event) => setTask(event.target.value)} rows={2} /><div className="form-grid"><div><label className="field-label" htmlFor="edit-owner">Responsible person</label><input id="edit-owner" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Name or role, as stated" /></div><div><label className="field-label" htmlFor="edit-due">Time or trigger</label><input id="edit-due" value={due} onChange={(event) => setDue(event.target.value)} placeholder="As stated in the plan" /></div></div><label className="field-label" htmlFor="edit-condition">Condition or prerequisite</label><textarea id="edit-condition" value={condition} onChange={(event) => setCondition(event.target.value)} rows={2} placeholder="What must happen first?" /><label className="field-label" htmlFor="edit-uncertainty">Uncertainty to preserve</label><input id="edit-uncertainty" value={uncertainty} onChange={(event) => setUncertainty(event.target.value)} placeholder="For example, the result remains pending" /><label className="field-label" htmlFor="edit-note">Clarification <span>{resolve ? "required to resolve questions" : "optional"}</span></label><textarea id="edit-note" required={resolve} value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Explain what changed, in your own words…" />{hasReconciliation && <label className="check-field reconciliation-check"><input type="checkbox" checked={resolve} onChange={(event) => setResolve(event.target.checked)} /><span>I reviewed both source statements. My clarification above resolves the readback questions, and I confirm this captured plan.</span></label>}<p className="form-footnote"><Info size={13} />Blank fields remain unknown. This review is recorded as a sender statement.</p><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-teal" type="submit"><Check size={16} />{resolve ? "Confirm clarification" : "Save correction"}</button></div></form>
  </Dialog>;
}

function AcceptDialog({ item, onClose, onAccept }: { item: Item; onClose: () => void; onAccept: (by: string, text: string) => void }) {
  const [by, setBy] = useState('');
  const [checked, setChecked] = useState(false);
  return <Dialog title="Acknowledge handoff" description={item.taskStatus === 'reported_complete' ? "This acknowledges the current revision, which contains a clinician’s completion report. CareThread has not independently verified that report." : "This records the receiver’s acknowledgment of the current plan. Clinical work remains pending."} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (by.trim() && checked) onAccept(by.trim(), `I, ${by.trim()}, acknowledge and accept handoff revision ${item.revision}: ${item.task}. The responsible person is ${item.owner}; the time or trigger is ${item.due}.${item.condition ? ` The condition remains: ${item.condition}.` : ''}${item.uncertainty ? ` The uncertainty remains: ${item.uncertainty}.` : ''} I understand this acknowledgment does not report the clinical work complete.`); }}><div className="accept-preview"><span className="eyebrow">REVISION {item.revision} · RECEIVER READBACK</span><h3>{item.task}</h3><dl><div><dt>Responsible person</dt><dd>{item.owner}</dd></div><div><dt>Time or trigger</dt><dd>{item.due}</dd></div>{item.condition && <div><dt>Condition</dt><dd>{item.condition}</dd></div>}{item.uncertainty && <div><dt>Uncertainty</dt><dd>{item.uncertainty}</dd></div>}</dl></div><label className="field-label" htmlFor="receiver-name">Receiving clinician <span>simulation name</span></label><input id="receiver-name" required value={by} onChange={(event) => setBy(event.target.value)} placeholder="Enter the receiver’s name" autoComplete="off" /><label className="check-field"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I have reviewed the plan above, including its conditions and uncertainty, and acknowledge this handoff.</span></label><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Back to review</button><button type="submit" className="button button-teal" disabled={!checked || !by.trim()}><ClipboardCheck size={16} />Record acknowledgment</button></div></form></Dialog>;
}

function CompleteDialog({ item, onClose, onComplete }: { item: Item; onClose: () => void; onComplete: (by: string, source: string) => void }) {
  const [by, setBy] = useState('');
  const [report, setReport] = useState('');
  return <Dialog title="Record completion" description="A separate clinician statement is required. CareThread records what is reported; it does not observe or verify the clinical action." onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (by.trim() && report.trim()) onComplete(by.trim(), `I, ${by.trim()}, report that the following clinical work was completed: ${item.task}. Completion report: ${report.trim()}`); }}><div className="completion-task"><CheckCheck size={20} /><strong>{item.task}</strong></div><label className="field-label" htmlFor="completion-by">Reported by <span>simulation name</span></label><input id="completion-by" required value={by} onChange={(event) => setBy(event.target.value)} placeholder="Name of the reporting clinician" /><label className="field-label" htmlFor="completion-report">What was completed?</label><textarea id="completion-report" required rows={3} value={report} onChange={(event) => setReport(event.target.value)} placeholder="Record the clinician’s statement…" /><div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-teal" disabled={!by.trim() || !report.trim()}><CheckCheck size={16} />Record reported completion</button></div></form></Dialog>;
}
