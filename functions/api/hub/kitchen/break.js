// POST /api/hub/kitchen/break — start or end a break on the current open shift.
// Body: { action: 'start' | 'end' }. Starting appends {start} to shifts.breaks; ending stamps the
// stop and adds the whole minutes to break_minutes. Clock-out closes a break still running.
// The logic lives in _lib/timesheet.js, shared with the driver, so the two can never disagree
// about what a break is worth.
import { handleBreak } from '../../../_lib/timesheet.js';

export const onRequestPost = ({ request, env }) => handleBreak(request, env, ['kitchen', 'owner']);
