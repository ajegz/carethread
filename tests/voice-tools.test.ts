import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTurn, createSession, replayStep } from '../lib/handoff';
import { buildPlannerRequest, nextQuestion, parsePlannerResponse, validateVoicePlan } from '../lib/voice-tools';

const capture = (turnId='sender-1') => ({name:'capture_pending_item',arguments:{task:'Review the scan result',owner:null,due:null,condition:'Discharge is waiting for review',uncertainty:'Scan result pending',sourceTurnIds:[turnId]}});
const wire = (actions:unknown[]) => JSON.stringify({actions,question:'Who will review the scan result?'});
const sourceSession = () => appendTurn(createSession(),{id:'sender-1',role:'sender',text:'The scan result is pending. Discharge waits for review.'});

test('Gateway request cites current human turn and uses JSON planning without native tools',()=>{
 const request=buildPlannerRequest(sourceSession(),'sender','sender-1');
 assert.equal(request.model,'qwen3.5-4b-32k-fast');assert.equal('tools' in request,false);
 assert.match(request.messages[1].content,/sender-1/);
 assert.throws(()=>buildPlannerRequest(sourceSession(),'receiver','sender-1'),/source/);
});

test('parsed capture preserves unknown owner and pending uncertainty through validation',()=>{
 const session=sourceSession();const plan=parsePlannerResponse(wire([capture()]),session,'sender-1');
 const checked=validateVoicePlan(session,plan,'sender-1');
 assert.equal(checked.session.items[0].owner,null);assert.equal(checked.session.items[0].due,null);
 assert.equal(checked.session.items[0].uncertainty,'Scan result pending');
 assert.equal(checked.session.items[0].taskStatus,'pending');assert.equal(checked.session.items[0].acceptance,null);
 assert.deepEqual(checked.session.items[0].sourceTurnIds,['sender-1']);assert.equal(session.items.length,0);
});

test('planner rejects fabricated, older, and agent source IDs',()=>{
 const session=appendTurn(appendTurn(sourceSession(),{id:'old-human',role:'sender',text:'Earlier statement.'}),{id:'agent-1',role:'agent',text:'I guessed an owner.'});
 for(const badId of ['invented','old-human','agent-1'])assert.throws(()=>parsePlannerResponse(wire([capture(badId)]),session,'sender-1'),/current source/);
 assert.throws(()=>parsePlannerResponse(wire([capture('agent-1')]),session,'agent-1'),/source/);
});

test('planner cannot acknowledge using sender speech',()=>{
 assert.throws(()=>parsePlannerResponse(wire([{name:'acknowledge_handoff',arguments:{sourceTurnIds:['sender-1'],by:'Nurse Morgan',itemId:'item_1',expectedRevision:1}}]),sourceSession(),'sender-1'),/receiver/);
});

test('planner rejects unknown tools and implicit confirmation',()=>{
 assert.throws(()=>parsePlannerResponse(wire([{name:'authorize_discharge',arguments:{sourceTurnIds:['sender-1']}}]),sourceSession(),'sender-1'),/Unsupported/);
 assert.throws(()=>parsePlannerResponse(wire([{name:'record_clarification',arguments:{sourceTurnIds:['sender-1'],itemId:'item_1',expectedRevision:1,clarification:'An owner was supplied.'}}]),sourceSession(),'sender-1'),/explicitly/);
});

test('a stale revision fails before the caller commits any proposed action',()=>{
 let session=replayStep(createSession(),0);session=appendTurn(session,{id:'new-owner',role:'sender',text:'Dr Lee reviews it at 3 PM.'});
 const plan=parsePlannerResponse(wire([{name:'revise_item',arguments:{sourceTurnIds:['new-owner'],itemId:'item_1',expectedRevision:99,changes:{owner:'Dr Lee',due:'3 PM'}}}]),session,'new-owner');
 assert.throws(()=>validateVoicePlan(session,plan,'new-owner'),/revision/);
 assert.equal(session.items[0].owner,null);assert.equal(session.items[0].revision,1);
});

test('all-or-nothing validation prevents partial commit when a later action fails',()=>{
 const session=sourceSession();const plan=parsePlannerResponse(wire([capture(),{name:'revise_item',arguments:{sourceTurnIds:['sender-1'],itemId:'missing',expectedRevision:1,changes:{owner:'Dr Lee'}}}]),session,'sender-1');
 assert.throws(()=>validateVoicePlan(session,plan,'sender-1'),/does not exist/);assert.equal(session.items.length,0);
});

test('malformed or excessive planner output is rejected',()=>{
 for(const content of ['not JSON','null','[]',JSON.stringify({actions:[],question:10}),wire([capture(),capture(),capture(),capture()])])assert.throws(()=>parsePlannerResponse(content,sourceSession(),'sender-1'));
});

test('next question advances confirmed work to receiver readback without a confirmation loop',()=>{
 let session=replayStep(createSession('clean'),0);
 assert.match(nextQuestion(session,'sender'),/explicitly confirm/);
 session=replayStep(session,1);
 assert.match(nextQuestion(session,'sender'),/Switch to Receiver/);
 assert.match(nextQuestion(session,'receiver'),/state your name/);
 session=replayStep(session,2);
 assert.match(nextQuestion(session,'receiver'),/acknowledged/);
 assert.match(nextQuestion(session,'receiver'),/does not complete/);
});

test('reconciliation and missing facts take precedence over confirmation',()=>{
 let session=replayStep(createSession(),0);
 assert.match(nextQuestion(session,'sender'),/Who is responsible/);
 session=replayStep(session,1);
 assert.match(nextQuestion(session,'receiver'),/new information/);
});

test('a detected mismatch is validated before an acknowledgment, regardless of model ordering',()=>{
 let session=replayStep(replayStep(createSession('clean'),0),1);
 session=appendTurn(session,{id:'receiver-drift',role:'receiver',text:'I am Nurse Morgan. The scan is clear and discharge is ready; I acknowledge.'});
 const base={itemId:'item_1',expectedRevision:1,sourceTurnIds:['receiver-drift']};
 const plan=parsePlannerResponse(wire([
  {name:'acknowledge_handoff',arguments:{...base,by:'Nurse Morgan'}},
  {name:'compare_receiver_summary',arguments:{...base,receiverSummary:'Scan clear and ready.',concerns:[{field:'uncertainty',description:'Has a new result become available?'}]}},
 ]),session,'receiver-drift');
 assert.equal(plan.actions[0].name,'compare_receiver_summary');
 assert.throws(()=>validateVoicePlan(session,plan,'receiver-drift'),/open questions/);
 assert.equal(session.items[0].acceptance,null);
});
