// The Marketing Expert's daily run — what "running the system daily" actually means.
// Files under functions/_lib are NOT routed.
//
// The checks live in code rather than in the database on purpose. They describe the product,
// and the product changes; a check list stored as rows goes stale silently the moment a surface
// is added, and nobody notices because the run still comes back green. Here, adding a marketing
// surface and adding its check are the same commit.
//
// Each check names a surface she can actually open and states what "working" looks like, because
// a check nobody can fail is decoration. `href` is where she goes to answer it.

export const RUN_CHECKS = [
  {
    key: 'inbox',
    label: 'Instagram inbox answered',
    detail: 'Every DM and comment from yesterday has a reply or a deliberate skip.',
    href: '/hub/comms.html',
  },
  {
    key: 'drafts',
    label: 'Drafts moved',
    detail: 'Nothing approved is still sitting unscheduled, and nothing scheduled has silently failed.',
    href: '/hub/owner/marketing.html#create-instagram',
  },
  {
    key: 'campaigns',
    label: 'Email campaigns on track',
    detail: 'The sends that were due went out, and the ones queued still read the way we want.',
    href: '/hub/owner/marketing.html#create-email',
  },
  {
    key: 'links',
    label: 'Tracked links resolving',
    detail: 'Open each /l/ link in the bio. A dead redirect is a whole day of traffic lost.',
    href: '/hub/owner/marketing.html',
  },
  {
    key: 'site',
    label: 'Site copy correct',
    detail: 'Banners and legal blocks say what they should — nothing expired still showing.',
    href: '/hub/owner/site-copy.html',
  },
  {
    key: 'affiliates',
    label: 'Affiliates handled',
    detail: 'New applications reviewed; nobody approved is waiting on their link.',
    href: '/hub/owner/partners.html',
  },
  {
    key: 'traffic',
    label: 'Yesterday’s numbers read',
    detail: 'Traffic and attribution checked against what we published. Surprises get a note below.',
    href: '/hub/owner/traffic.html',
  },
];

export const CHECK_KEYS = RUN_CHECKS.map((c) => c.key);
export const CHECK_RESULTS = ['ok', 'issue', 'skip'];

// Normalise a submitted { key: result } map: drop unknown keys and unknown results rather than
// storing them. A check that was removed from the product must not keep counting as an issue,
// and a result string we do not understand must never be persisted as if we did.
export function normalizeChecks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of CHECK_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && CHECK_RESULTS.includes(v)) out[key] = v;
  }
  return out;
}

export function countIssues(checks) {
  return Object.values(checks || {}).filter((v) => v === 'issue').length;
}

// A run is complete when every check has an answer — 'skip' counts. Silence does not:
// an unanswered check is the difference between "we looked and it was fine" and "nobody looked".
export function isComplete(checks) {
  return CHECK_KEYS.every((k) => !!(checks || {})[k]);
}
