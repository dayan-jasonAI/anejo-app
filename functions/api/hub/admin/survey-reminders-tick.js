import {json,bad,ctEq} from '../../../_lib/util.js';
import {runSurveyReminders} from '../../../_lib/survey_reminders.js';
export const onRequestPost=async({request,env})=>{
 const key=request.headers.get('x-cron-key');if(!env.CRON_KEY||!key||!ctEq(key,env.CRON_KEY))return bad('Unauthorized.',401);
 return json(await runSurveyReminders(env));
};
