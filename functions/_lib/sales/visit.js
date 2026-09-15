// Sales OS — the IN-PERSON VISIT: what to say at the door, and what to come back with.
// Files under functions/_lib are NOT routed.
//
// WHY THIS IS IN THE PRODUCT AND NOT IN A NOTEBOOK. The owner walked into a clinic with five buses
// outside and had the conversation from memory. It went fine — but the four facts that decide
// whether that visit was worth anything (how many they feed, what they do now, who decides, how to
// reach them) are the same four facts the scorer is missing on almost every prospect, and a note
// typed into a phone at the kerb never becomes a contact row or a capacity figure.
//
// So a visit WRITES INTO THE MODEL rather than sitting beside it:
//   headcount        → organization.employee_or_capacity_hint → Volume potential (15 pts)
//   name + email     → a real contact                        → Decision-maker quality (10 pts)
//   what they do now → the activity feed, as evidence for the next email
//   outcome          → the opportunity's next action
// Everything is optional. A visit where he only got a name is still worth recording.

/** The script. Data, not markup, so it can be edited without touching a page. */
export const VISIT_SCRIPT = Object.freeze({
  before: [
    'You are not going in to sell. You are going in to find out who handles lunch and get their email. That is the win.',
    'Open the prospect page on your phone or iPad first — it carries their name at the top.',
    'Worst realistic outcome is "leave your information", and you still walk out with a name.',
  ],
  door: {
    label: 'At the front desk — twelve words, then stop',
    lines: [
      '"Hi, I\'m Dayan — I own Añejo Catering, we\'re local here in Palm Beach."',
      '(let them answer)',
      '"I\'m not here to sell you anything today. Who handles the food for the program?"',
    ],
    note: 'If the person who decides is out, the NAME is the win. Ask when they are usually in, leave a menu, go.',
  },
  pitch: {
    label: 'If the administrator comes out — ask before you pitch',
    lines: [
      '"How many are you feeding on a typical day?"',
      '(let them answer)',
      '"Your number moves every day, right? That is what we are built for. Your staff send the day\'s count from a link on their phone each morning, and you pay for that number — no fixed order, no week\'s notice."',
      '"One invoice at the end of the month instead of a stack of receipts."',
      'Then show them this page.',
    ],
  },
  ask: '"What\'s the best email? I\'ll send a sample week\'s menu and a real number for your headcount — no obligation." Write it down in front of them and read it back.',
  objections: [
    ['"We already have a vendor."', 'Two questions: how much notice do they need, and do you pay for meals nobody eats? That gap is the whole pitch. "Can I leave a menu for the week they let you down?"'],
    ['"We cook in-house."', 'Then you know the hard day is when a kitchen staffer calls out. Start with one day a week, or the days you are short.'],
    ['"Send me some information."', 'That is a win, not a brush-off. Get the email, repeat it back, send it tonight.'],
    ['"I\'m not the one who decides."', '"Completely understand — who is, and when are they usually in?" Write the name down.'],
    ['"Not interested."', '"No problem at all. Can I leave a menu in case something changes?" Then leave. Ask if there is a better time of day.'],
  ],
  never: [
    'Never name another customer. You have no recorded permission to use anyone as a reference — "an account we run in this corridor" is true and enough.',
    'Never promise a delivery day you do not run.',
    'Never invent a dietary capability on the spot. Write the request down and say you will confirm.',
    'Never quote a price you have not decided. "Let me send a real number for your headcount" is a better answer than a guess.',
  ],
});

/** What to come back with. The first four are what the score is actually missing. */
export const VISIT_FIELDS = Object.freeze([
  { key: 'spoke_to_name', label: 'Who you spoke to', hint: 'A name is the minimum win of any visit.' },
  { key: 'spoke_to_title', label: 'Their title', hint: 'Administrator, director, office manager.' },
  { key: 'spoke_to_email', label: 'Their email', hint: 'Read it back to them. Half of cold-collected addresses are wrong.', type: 'email' },
  { key: 'spoke_to_phone', label: 'Direct phone', hint: 'Optional — a direct line beats the main number.', type: 'tel' },
  { key: 'headcount', label: 'People on site for lunch', hint: 'Their number, not your estimate. Feeds the score.', type: 'number' },
  { key: 'headcount_varies', label: 'Does the count move day to day?', hint: 'If yes, say so in the follow-up — it is the whole reason they need you.', type: 'select', options: ['', 'yes', 'no', 'did not ask'] },
  { key: 'current_solution', label: 'What they do for lunch now', hint: 'In-house kitchen, a vendor, clients bring their own, nothing.' },
  { key: 'dietary', label: 'Dietary needs mentioned', hint: 'Allergies, diabetic, renal, cultural. Write it down, confirm later.' },
  { key: 'decision_maker', label: 'Who actually decides', hint: 'If it is not the person you met, this is the most valuable line on the form.' },
  { key: 'best_time', label: 'Best time to come back', hint: 'Ask it even on a no.' },
]);

export const VISIT_OUTCOMES = Object.freeze([
  { key: 'spoke_to_decision_maker', label: 'Spoke to the decision-maker', stage: 'engaged' },
  { key: 'spoke_to_staff', label: 'Spoke to staff, not the decider', stage: 'contacted' },
  { key: 'left_materials', label: 'Left a menu only', stage: 'contacted' },
  { key: 'come_back', label: 'Come back another time', stage: 'contacted' },
  { key: 'not_a_fit', label: 'Not a fit', stage: null },
]);

export const visitOutcome = (key) => VISIT_OUTCOMES.find((o) => o.key === key) || null;

/** One line summarising a visit, for the activity feed. */
export function visitSummary(input = {}) {
  const o = visitOutcome(input.outcome);
  const bits = [o ? o.label : 'Visited'];
  if (input.spoke_to_name) bits.push(`spoke to ${input.spoke_to_name}${input.spoke_to_title ? `, ${input.spoke_to_title}` : ''}`);
  if (input.headcount) bits.push(`${input.headcount} on site`);
  if (input.current_solution) bits.push(`now: ${input.current_solution}`);
  return bits.join(' · ');
}
