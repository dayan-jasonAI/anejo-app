// Sales OS — WHAT EACH BUYER WILL ASK FOR, and whether Añejo can hand it over today.
// Files under functions/_lib are NOT routed.
//
// WHY THIS EXISTS (Dayan, 2026-09-18): an AHCA-licensed adult day care replied to our first email,
// wanted ~90 meals a day, and asked within the hour for a dietitian-signed menu and an issued DBPR
// license certificate. Neither was ready, both were knowable in advance (Rule 59A-16.105 says so in
// plain words), and the contract did not close that day. "You must look at and cover all the angles
// and ensure Añejo is actually fully equipped and ready to conquer."
//
// So the requirements live HERE, as data with their sources, and the Hub checks them BEFORE a
// prospect is pitched:
//   · BUYER_REQUIREMENTS — per ICP category, what the facility must get from a meal vendor, why
//     (the rule, with a link), and how strictly (required / conditional / expected).
//   · READINESS_ITEMS — Añejo's side of each requirement: an owner-maintained status in
//     app_settings 'sales.readiness'. The DEFAULTS below record only what was verified on 2026-09-18;
//     anything not verified is 'unknown', never assumed ready.
//
// Every source below was read on 2026-09-18. Rules change — re-read before quoting one to a buyer.

import { now } from '../hub.js';

export const READINESS_STATUSES = ['ready', 'in_progress', 'missing', 'unknown', 'not_applicable'];

// ---------------------------------------------------------------- Añejo's side

/**
 * One row per thing a buyer can ask Añejo to produce. `default` is the state verified on 2026-09-18
 * (see the note); the owner updates it from Sales → Readiness as documents arrive.
 */
export const READINESS_ITEMS = {
  dbpr_license_certificate: {
    label: 'DBPR food service license certificate (issued, with expiration date)',
    group: 'License & inspection',
    default: { status: 'in_progress', note: 'License 6023364 shows "Plan Review Approved" on DBPR. The 30-day authorization from the 7/21/2026 inspection expired 8/20/2026. The annual license has to be obtained through the DBPR Online Services account; call 850-487-1395.' },
  },
  inspection_report: {
    label: 'Most recent DBPR food service inspection report',
    group: 'License & inspection',
    default: { status: 'ready', note: 'Opening inspection 7/21/2026, #3759227-1: met inspection standards, 0 violations.' },
  },
  dbpr_risk_level_3: {
    label: 'DBPR Risk Level 3 classification (serving a highly susceptible population)',
    group: 'License & inspection',
    default: { status: 'unknown', note: 'Required to be listed as a caterer by Elder Affairs (adult day care food program) and DOH (child care food program). Confirm the classification with DBPR.' },
  },
  food_manager_certification: {
    label: 'Certified Food Protection Manager (approved exam, someone working in the kitchen)',
    group: 'License & inspection',
    default: { status: 'unknown', note: 'Florida requires one for a licensed food service establishment, and the Elder Affairs and DOH caterer lists ask for a copy. Confirm who holds it and its expiration.' },
  },
  food_handler_training: {
    label: 'Food handler training for every kitchen employee',
    group: 'License & inspection',
    default: { status: 'unknown', note: 'Florida requires approved food handler training for food service employees. Keep the certificates on file.' },
  },
  general_liability_coi: {
    label: 'General liability certificate of insurance (facility added as certificate holder on signing)',
    group: 'Insurance & business',
    default: { status: 'ready', note: 'Liability certificate N0276GL00000100 on file and sent to Boca Raton Adult Daycare 9/18.' },
  },
  auto_liability_coi: {
    label: 'Auto liability covering delivery driving (hired and non-owned auto)',
    group: 'Insurance & business',
    default: { status: 'unknown', note: 'Facilities often ask for it because meals arrive by car. Confirm with the insurer whether the policy covers drivers using their own vehicles.' },
  },
  workers_comp: {
    label: "Workers' compensation certificate or exemption",
    group: 'Insurance & business',
    default: { status: 'ready', note: 'Certificate of Election to be Exempt E02419029, 8/31/2026 to 8/30/2028. It covers the owner only; Florida requires coverage once a non-construction business has 4 or more employees.' },
  },
  w9: {
    label: 'Signed W-9 (for the facility to set Añejo up as a vendor)',
    group: 'Insurance & business',
    default: { status: 'unknown', note: 'Keep a signed current W-9 ready to attach. Many offices pay through AP only after one is on file.' },
  },
  contract_template: {
    label: 'Written catering services agreement',
    group: 'Contract & service',
    default: { status: 'ready', note: 'Catering Services Agreement (13 sections, 9/18): pricing, minimums, rush fee, terms, backup service, allergens, AHCA consistency.' },
  },
  backup_service_plan: {
    label: 'Backup service plan (missed run, vehicle problem, kitchen closure)',
    group: 'Contract & service',
    default: { status: 'ready', note: 'Agreement Section 5: backup drivers, then equivalent meals bought from a licensed establishment; Añejo covers the difference.' },
  },
  allergen_policy: {
    label: 'Allergen handling policy and labeled allergy meals',
    group: 'Contract & service',
    default: { status: 'ready', note: 'Menu has no peanuts or tree nuts; allergies recorded in the ordering system; allergy meals individually packed and labeled with name and allergy.' },
  },
  seven_day_service: {
    label: 'Three meals a day, seven days a week (breakfast, lunch, dinner, snack)',
    group: 'Contract & service',
    default: { status: 'unknown', note: 'Residential programs must serve 3 meals and a snack every day, weekends included. Current contracts are weekday breakfast and lunch. Decide whether to offer dinner and weekends.' },
  },
  adult_meal_pattern_menu: {
    label: 'Cycle menu written to the USDA adult meal pattern (components labeled)',
    group: 'Menu & nutrition',
    default: { status: 'ready', note: 'Exhibit A: 4-week breakfast, lunch and afternoon snack cycle for adults 80+, with components labeled.' },
  },
  therapeutic_diets: {
    label: 'Therapeutic and texture-modified diets (diabetic, low sodium, IDDSI levels)',
    group: 'Menu & nutrition',
    default: { status: 'ready', note: 'Exhibit A diet page: consistent carbohydrate, low sodium, IDDSI 6/5/4, no-pork, snack allergy alternatives.' },
  },
  dietitian_signed_menu: {
    label: 'Menu reviewed and signed by a Florida-licensed dietitian (name, license #, date, validity)',
    group: 'Menu & nutrition',
    default: { status: 'in_progress', note: 'Requests out 9/18 to Wendy Wesley RDN LDN (FL ND8024), AteekRD, Long Term Care Nutrition and a referral. Promised to Boca Raton Adult Daycare by Monday 9/21.' },
  },
  nutrient_analysis: {
    label: 'Nutrient analysis showing each meal meets 1/3 of the DRI',
    group: 'Menu & nutrition',
    default: { status: 'in_progress', note: 'Comes with the dietitian review.' },
  },
  delivery_slip: {
    label: 'Daily delivery slip: menu, serving sizes, meals ordered and delivered, temperatures at delivery, both signatures',
    group: 'Menu & nutrition',
    default: { status: 'in_progress', note: 'The Hub records every delivery. The Elder Affairs program slip also needs the menu, serving sizes, food temperatures at delivery and a signature from each side.' },
  },
  doea_caterer_list: {
    label: 'Listed on the Florida Elder Affairs approved caterer list (adult day care food program)',
    group: 'Program listings',
    default: { status: 'missing', note: 'Needs a Risk Level 3 DBPR license, no closure or administrative complaint in 12 months, and 3 sanitation inspections or 6 months open (open 7/21/2026, so about 1/21/2027). Submit annually: catering information form, license, latest inspection, food manager certificate.' },
  },
  bid_response_packet: {
    label: 'Bid response packet (for centers that must collect quotes)',
    group: 'Program listings',
    default: { status: 'missing', note: 'Centers in the federal food program must procure competitively; a formal bid is required at $50,000+ a year and needs state approval. Have a ready packet: price per meal type, menu, license, inspection, insurance, references.' },
  },
};

// ---------------------------------------------------------------- the buyer's side

const R = (readiness, level, why, source, url, when) => ({ readiness, level, why, source, url, when: when || null });

const SRC = {
  adc: ['Fla. Admin. Code 59A-16.105 (adult day care basic services)', 'https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-59A-16-105'],
  alf: ['Fla. Admin. Code 59A-36.012 (assisted living food service)', 'https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-59A-36-012'],
  dcf: ['Fla. Admin. Code 65D-30 (DCF substance use services: residential treatment)', 'https://flrules.org/gateway/readFile.asp?sid=0&tid=0&cno=65D-30&caid=639150&type=4&file=65D-30.doc'],
  acfp: ['Florida Elder Affairs Adult Care Food Program Policy Manual, 8th ed. (5/2025), §11.14 and §5.14', 'https://elderaffairs.org/wp-content/uploads/2025/12/ACFP-Policy-Manual.pdf'],
  ask: ['Asked for by a live buyer (Boca Raton Adult Daycare, 9/18/2026)', null],
  practice: ['Standard vendor onboarding for institutional accounts', null],
};

const UNIVERSAL = [
  R('dbpr_license_certificate', 'required', 'Every licensed facility has to show its inspector that food comes from a licensed source. The certificate, not a checklist or receipt, is what goes in their file.', ...SRC.ask),
  R('inspection_report', 'required', 'Facilities keep the caterer\'s current health inspection on file, and residential programs send it to their licensing agency.', ...SRC.dcf),
  R('contract_template', 'required', 'Outside food service needs a written contract that promises the food and dietary standards will be met.', ...SRC.adc),
  R('general_liability_coi', 'required', 'Vendors serving vulnerable adults are asked for proof of liability insurance before the first delivery.', ...SRC.practice),
  R('w9', 'required', 'The facility cannot pay a new vendor through accounts payable without a W-9.', ...SRC.practice),
  R('food_manager_certification', 'expected', 'Asked for by every state caterer list and by careful buyers checking food safety.', ...SRC.acfp),
  R('workers_comp', 'expected', 'Facilities usually ask for workers\' comp proof from anyone making deliveries on their premises.', ...SRC.practice),
  R('auto_liability_coi', 'expected', 'Meals arrive by car; some buyers ask for auto liability along with general liability.', ...SRC.practice),
  R('allergen_policy', 'expected', 'Every buyer with a documented allergy on file will ask how it is handled.', ...SRC.ask),
  R('backup_service_plan', 'expected', 'Participants must be fed that day regardless; buyers ask what happens when a delivery fails.', ...SRC.ask),
];

/** What each ICP category needs from a meal vendor, beyond UNIVERSAL. */
export const BUYER_REQUIREMENTS = {
  adult_day: {
    label: 'Adult day care center (AHCA-licensed)',
    summary: 'Needs a written contract, meals meeting 1/3 of the DRI, a snack for full-day participants, a dietitian-reviewed menu unless it follows the adult food program pattern, and therapeutic diets. Centers in the federal food program can only buy from caterers on the Elder Affairs list.',
    items: [
      R('dietitian_signed_menu', 'required', 'Menus that do not meet the adult food program pattern must be reviewed by a registered or Florida-licensed dietitian; the center keeps the reviewer\'s signature, license number and date on file. In practice centers ask for it either way.', ...SRC.adc),
      R('nutrient_analysis', 'expected', 'Each meal must provide at least one-third of the DRI for participants at the center 4+ hours; the analysis is how a center proves it.', ...SRC.adc),
      R('adult_meal_pattern_menu', 'required', 'Meals follow current dietary guidelines and 1/3 of the DRI; a snack is required for participants present 3 hours before or 2 hours after the noon meal.', ...SRC.adc),
      R('therapeutic_diets', 'required', 'Modified and therapeutic diets must be available as ordered.', ...SRC.adc),
      R('doea_caterer_list', 'conditional', 'A center claiming federal Adult Care Food Program reimbursement may only buy from a caterer on the Elder Affairs approved list.', ...SRC.acfp, 'If the center participates in the Adult Care Food Program (ask).'),
      R('delivery_slip', 'conditional', 'Food program centers keep a daily delivery slip with the menu, serving sizes, counts, temperatures at delivery and both signatures.', ...SRC.acfp, 'If the center participates in the Adult Care Food Program.'),
      R('bid_response_packet', 'conditional', 'Food program centers must collect competing quotes; at $50,000+ a year it is a formal bid that the state approves.', ...SRC.acfp, 'If the center participates in the Adult Care Food Program.'),
    ],
    ask_first: ['Does the center participate in the Adult Care Food Program (federal meal reimbursement)?', 'How many participants attend 4+ hours, and who needs a snack?', 'Any participants on therapeutic or texture-modified diets?', 'Who signs the vendor contract, and who keeps the AHCA file?'],
  },
  addiction_treatment: {
    label: 'Substance use treatment program (DCF-licensed)',
    summary: 'Residential programs must serve 3 meals and a snack every day, with nutrition plans approved yearly by a Florida-licensed dietitian, and must give DCF the caterer\'s contract and current health inspection. Day and intensive outpatient programs usually just need lunch.',
    items: [
      R('dietitian_signed_menu', 'conditional', 'Residential providers must have nutrition and dietary plans reviewed and approved at least annually by a Florida-licensed dietitian.', ...SRC.dcf, 'Residential programs.'),
      R('seven_day_service', 'conditional', 'Residential treatment must provide at least three meals and one snack per calendar day.', ...SRC.dcf, 'Residential programs.'),
      R('therapeutic_diets', 'expected', 'Special dietary needs must be reasonably accommodated.', ...SRC.dcf),
    ],
    ask_first: ['Residential, partial hospitalization, or intensive outpatient?', 'Which meals and which days (weekends included)?', 'How many clients on an average day?', 'Does your dietitian already approve your menus, or do you need ours?'],
  },
  behavioral_health: {
    label: 'Behavioral-health program (crisis unit, partial hospitalization, residential treatment)',
    summary: 'Crisis and residential units feed people around the clock and follow their license rules on dietary services; partial hospitalization programs usually serve a weekday lunch. Expect a dietitian-reviewed menu and the caterer\'s license and inspection on file.',
    items: [
      R('dietitian_signed_menu', 'expected', 'Licensed residential and crisis programs keep dietitian-reviewed menus; day programs commonly ask for one too.', ...SRC.dcf),
      R('seven_day_service', 'conditional', 'Residential and crisis units serve three meals and a snack every day.', ...SRC.dcf, 'Residential or crisis units.'),
      R('therapeutic_diets', 'expected', 'Special diets ordered for clients must be accommodated.', ...SRC.dcf),
    ],
    ask_first: ['Crisis unit, residential, or partial hospitalization?', 'Which meals and which days?', 'Average daily census?', 'Is a dietitian-signed menu required by your license?'],
  },
  residential_care: {
    label: 'Residential care (assisted living, residential treatment facility, group home)',
    summary: 'Assisted living must serve 3+ meals a day with snacks, menus planned a week ahead, reviewed yearly by a licensed dietitian with signature and license number, therapeutic diets as ordered, and a current contract with a licensed vendor.',
    items: [
      R('dietitian_signed_menu', 'required', 'Menus must be reviewed annually by a licensed/registered dietitian or nutritionist, documented with signature, license number and date.', ...SRC.alf),
      R('seven_day_service', 'required', 'Three or more meals a day including snacks, with limits on the gaps between meals.', ...SRC.alf),
      R('therapeutic_diets', 'required', 'Therapeutic diets prepared and served as ordered by the resident\'s health care provider.', ...SRC.alf),
      R('adult_meal_pattern_menu', 'required', 'Menus planned at least a week ahead to the current USDA Dietary Guidelines and DRIs; as-served menus kept 6 months.', ...SRC.alf),
    ],
    ask_first: ['How many residents, and which meals do you want covered?', 'Weekends and holidays?', 'How many therapeutic or texture-modified diets?', 'Who is your consultant dietitian today?'],
  },
  rehabilitation: {
    label: 'Rehabilitation facility',
    summary: 'Treat as a treatment program: ask whether it is residential. Residential means 3 meals and a snack daily and a dietitian-approved plan.',
    items: [
      R('dietitian_signed_menu', 'conditional', 'Residential programs need dietitian-approved nutrition plans.', ...SRC.dcf, 'Residential programs.'),
      R('seven_day_service', 'conditional', 'Residential programs serve three meals and a snack every day.', ...SRC.dcf, 'Residential programs.'),
    ],
    ask_first: ['Residential or outpatient?', 'Which meals and which days?', 'Average daily census?'],
  },
};
const DEFAULT_BUYER = {
  label: 'Office or day program',
  summary: 'No meal rule of its own; the facility still needs the vendor basics on file before paying you.',
  items: [],
  ask_first: ['How many people eat on an average day, and which days?', 'Who approves vendors and how are invoices paid?'],
};
BUYER_REQUIREMENTS.mental_health_clinic = { ...DEFAULT_BUYER, label: 'Outpatient mental-health clinic' };
BUYER_REQUIREMENTS.wellness_program = { ...DEFAULT_BUYER, label: 'Wellness program' };
BUYER_REQUIREMENTS.medical_office = { ...DEFAULT_BUYER, label: 'Medical office' };

// ---------------------------------------------------------------- storage

export function mergeReadiness(stored) {
  const out = {};
  const s = stored && typeof stored === 'object' ? stored : {};
  for (const [key, def] of Object.entries(READINESS_ITEMS)) {
    const row = s[key] && typeof s[key] === 'object' ? s[key] : null;
    const status = row && READINESS_STATUSES.includes(row.status) ? row.status : def.default.status;
    out[key] = {
      key, label: def.label, group: def.group, status,
      note: row && typeof row.note === 'string' ? row.note : def.default.note,
      updated_at: row && row.updated_at ? row.updated_at : null,
      updated_by: row && row.updated_by ? row.updated_by : null,
      is_default: !row,
    };
  }
  return out;
}

export async function loadReadiness(env) {
  let stored = null;
  try {
    const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'sales.readiness'").first();
    stored = r && r.value ? JSON.parse(r.value) : null;
  } catch { stored = null; }
  return mergeReadiness(stored);
}

/** Owner updates one readiness item. Status must be from the vocabulary; the note is free text. */
export async function setReadiness(env, key, { status, note } = {}, ctx) {
  if (!READINESS_ITEMS[key]) return { ok: false, error: `Unknown readiness item "${key}".` };
  if (status !== undefined && !READINESS_STATUSES.includes(status)) return { ok: false, error: `Status must be one of: ${READINESS_STATUSES.join(', ')}.` };
  let stored = {};
  try {
    const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'sales.readiness'").first();
    stored = r && r.value ? JSON.parse(r.value) : {};
  } catch { stored = {}; }
  const cur = mergeReadiness(stored)[key];
  const who = (ctx && (ctx.email || ctx.distinct_id)) || 'owner';
  stored[key] = {
    status: status !== undefined ? status : cur.status,
    note: note !== undefined ? String(note).slice(0, 600) : cur.note,
    updated_at: now(), updated_by: who,
  };
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('sales.readiness', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(JSON.stringify(stored), who, now()).run();
  return { ok: true, item: mergeReadiness(stored)[key] };
}

// ---------------------------------------------------------------- the check

/**
 * The checklist for one buyer category, joined with Añejo's readiness.
 * `blocking` = required items not ready: the things the buyer will ask for that Añejo cannot hand
 * over today. A prospect with blockers can still be emailed; the owner is told first, not refused.
 */
export function buyerChecklist(category, readiness) {
  const def = BUYER_REQUIREMENTS[category] || DEFAULT_BUYER;
  const seen = new Set();
  const items = [];
  for (const it of [...def.items, ...UNIVERSAL]) {
    if (seen.has(it.readiness)) continue;
    seen.add(it.readiness);
    const r = readiness[it.readiness] || { status: 'unknown', label: it.readiness, note: '' };
    items.push({ ...it, label: r.label, status: r.status, readiness_note: r.note, ready: r.status === 'ready' || r.status === 'not_applicable' });
  }
  const order = { required: 0, conditional: 1, expected: 2 };
  items.sort((a, b) => (order[a.level] - order[b.level]) || (Number(a.ready) - Number(b.ready)));
  const blocking = items.filter((i) => i.level === 'required' && !i.ready);
  const conditional = items.filter((i) => i.level === 'conditional' && !i.ready);
  return {
    category, label: def.label, summary: def.summary, ask_first: def.ask_first || [],
    items, blocking, conditional_gaps: conditional,
    verdict: blocking.length ? 'gaps' : conditional.length ? 'ask_first' : 'ready',
    verdict_text: blocking.length
      ? `${blocking.length} required item${blocking.length === 1 ? '' : 's'} this buyer will ask for ${blocking.length === 1 ? 'is' : 'are'} not ready: ${blocking.map((b) => b.label.split(' (')[0]).join('; ')}.`
      : conditional.length ? `Ready on the required items. Ask first: ${conditional.map((c) => c.when || c.label).filter((v, i, a) => a.indexOf(v) === i).join(' ')}`
        : 'Ready: everything this buyer is likely to ask for can be sent today.',
  };
}

/** Company-wide view: which gaps block the most categories in the pipeline. */
export function readinessSummary(readiness, categoryCounts = {}) {
  const items = Object.values(readiness);
  const blockers = new Map();
  for (const [cat, n] of Object.entries(categoryCounts)) {
    if (!n) continue;
    for (const b of buyerChecklist(cat, readiness).blocking) {
      const cur = blockers.get(b.readiness) || { key: b.readiness, label: b.label, status: b.status, note: b.readiness_note, prospects: 0, categories: [] };
      cur.prospects += n;
      cur.categories.push(cat);
      blockers.set(b.readiness, cur);
    }
  }
  return {
    counts: Object.fromEntries(READINESS_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length])),
    top_blockers: [...blockers.values()].sort((a, b) => b.prospects - a.prospects),
  };
}
