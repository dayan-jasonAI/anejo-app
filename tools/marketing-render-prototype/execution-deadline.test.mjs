import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecutionDeadline,ExecutionDeadlineError} from './execution-deadline.mjs';
test('deadline refuses new dispatch at the exact boundary',async()=>{
 let time=100,calls=0;const d=createExecutionDeadline({now:()=>time,budgetMs:10});
 time=110;await assert.rejects(d.dispatch('render',()=>{calls++;}),ExecutionDeadlineError);assert.equal(calls,0);
});
test('expiry waits for pending I/O and does not claim cancellation',async()=>{
 let time=100,finish,settled=false;const d=createExecutionDeadline({now:()=>time,budgetMs:10});
 const pending=d.dispatch('write',()=>new Promise(resolve=>{finish=resolve;}));
 const result=pending.then(()=>{settled=true;},error=>{settled=true;return error;});
 time=120;await Promise.resolve();assert.equal(settled,false);
 finish('accepted');const error=await result;assert.ok(error instanceof ExecutionDeadlineError);assert.equal(error.stage,'write');
 let calls=0;await assert.rejects(d.dispatch('readback',()=>{calls++;}),ExecutionDeadlineError);assert.equal(calls,0);
});
test('clock reversal and invalid budgets cannot extend authority',()=>{
 let time=100;const d=createExecutionDeadline({now:()=>time,budgetMs:10});time=99;assert.throws(()=>d.check('render'),/invalid_execution_clock/);time=100;assert.throws(()=>d.check('retry'),ExecutionDeadlineError);
 for(const budgetMs of [0,-1,30001,Infinity,1.5])assert.throws(()=>createExecutionDeadline({budgetMs}),/invalid_execution_budget/);
});
test('successful settled stages preserve their values; errors propagate',async()=>{
 const d=createExecutionDeadline({now:()=>100,budgetMs:10});assert.equal(await d.dispatch('read',async()=>42),42);
 await assert.rejects(d.dispatch('write',async()=>{throw Error('write_unknown');}),/write_unknown/);
});
