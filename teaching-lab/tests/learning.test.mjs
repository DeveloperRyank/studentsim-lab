import {test} from 'node:test';import assert from 'node:assert/strict';import {evaluateState,validateStudent,validateEvaluation} from '../worker/learning.js';
const s={mastery:.3,observations:0,retention:'Not assessed',transfer:'Not assessed'};const e={assessed:true,correct:true,demonstratedUnderstanding:true,independent:true,evidence:'Independently explained equivalent portions.',misconceptions:[]};
test('correctness without understanding does not award mastery or XP',()=>{const r=evaluateState(s,{...e,demonstratedUnderstanding:false},3,'practice',0);assert.equal(r.gain,0);assert.equal(r.xp,0)});
test('teacher explanation alone does not update mastery',()=>{assert.equal(evaluateState(s,{...e,assessed:false,demonstratedUnderstanding:false},3,'explain',0).next.mastery,.3)});
test('retention requires at least one day',()=>{assert.equal(evaluateState(s,e,3,'retention',.5).next.retention,'Not assessed');assert.equal(evaluateState(s,e,3,'retention',2).next.retention,'Demonstrated')});
test('understanding gains are bounded and previous state immutable',()=>{const r=evaluateState(s,e,5,'transfer',0);assert.ok(r.gain<=.08);assert.equal(s.mastery,.3);assert.equal(r.next.transfer,'Demonstrated')});
test('provider output validation rejects missing fields',()=>{assert.equal(validateStudent({response:'ok'}),false);assert.equal(validateEvaluation({evidence:'ok'}),false)});
