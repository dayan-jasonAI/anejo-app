// Local executor foundation. Expiry stops NEW dispatch; it does not cancel work.
// The admission owner must await already-dispatched operations before releasing.
export class ExecutionDeadlineError extends Error {
 constructor(stage){super('execution_deadline_exceeded');this.name='ExecutionDeadlineError';this.stage=stage;}
}
export function createExecutionDeadline({now=Date.now,budgetMs=25000}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(budgetMs)||budgetMs<1||budgetMs>30000)throw Error('invalid_execution_budget');
 const start=now();if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(start+budgetMs))throw Error('invalid_execution_clock');
 const expiresAt=start+budgetMs;let last=start,expired=false;
 const check=stage=>{
  const at=now();
  // Clock reversal cannot extend the executor's authority.
  if(!Number.isSafeInteger(at)||at<last)throw Error('invalid_execution_clock');
  last=at;if(at>=expiresAt)expired=true;
  if(expired)throw new ExecutionDeadlineError(stage);
  return at;
 };
 return Object.freeze({expiresAt,check,async dispatch(stage,operation){
  check(stage);if(typeof operation!=='function')throw Error('invalid_execution_operation');
  // Never race a timeout against I/O: settlement is required even past expiry.
  const value=await operation();check(stage);return value;
 }});
}
