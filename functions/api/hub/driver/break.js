// POST /api/hub/driver/break — start or end a break on the driver's open shift.
// Body: { action: 'start' | 'end' }. Same rules as the kitchen (see _lib/timesheet.js handleBreak):
// breaks append to shifts.breaks, ending one adds its minutes to break_minutes, clock-out closes
// one still running.
import { handleBreak } from '../../../_lib/timesheet.js';

export const onRequestPost = ({ request, env }) => handleBreak(request, env, ['driver', 'owner']);
