// Sales OS — AÑEJO CONFIGURATION. Everything in this file is specific to Añejo and its first ICP
// (DGP-like institutional accounts). The engine files beside it (normalize, scoring, store,
// discovery, enrich, outreach, convert) take this as data and never import a clinic assumption of
// their own — that separation is what lets the pattern move to Aether Hub later.
//
// NOTHING HERE IS A PROMISE TO A PROSPECT. These are DEFAULTS for owner-editable settings. The
// offer copy in particular is a starting draft: outbound email refuses to send until the owner has
// saved (confirmed) the offer in the Sales settings, because the words that go to a clinic director
// are his to approve, not ours to assume.
// Files under functions/_lib are NOT routed.

// ---- ICP categories ------------------------------------------------------------------------------
// `fit` is the fraction of the category_fit points a category earns. The keywords classify an
// organization from its name, provider types and public site text — first match wins, so the list
// is ordered most-specific first ("adult day" before generic "day program", addiction before rehab).
export const ICP_CATEGORIES = {
  adult_day: {
    label: 'Adult day care / day program', fit: 1.0,
    keywords: ['adult day', 'adult daycare', 'adult day care', 'senior day', 'day center for adults', 'adult day services'],
  },
  addiction_treatment: {
    label: 'Addiction treatment / recovery', fit: 1.0,
    keywords: ['addiction', 'recovery center', 'recovery centre', 'detox', 'substance', 'sober', 'drug rehab',
      'alcohol rehab', 'drug and alcohol', 'dual diagnosis', 'treatment center', 'treatment centre'],
  },
  behavioral_health: {
    label: 'Behavioral-health center', fit: 1.0,
    keywords: ['behavioral health', 'behavioural health', 'psychiatric', 'mental health center', 'mental health treatment',
      'partial hospitalization', 'intensive outpatient'],
  },
  rehabilitation: {
    label: 'Rehabilitation facility', fit: 0.8,
    keywords: ['rehabilitation', 'rehab'],
  },
  residential_care: {
    label: 'Residential care / group home', fit: 0.6,
    keywords: ['group home', 'residential care', 'residential treatment', 'assisted living', 'memory care'],
  },
  mental_health_clinic: {
    label: 'Outpatient mental-health clinic', fit: 0.6,
    keywords: ['mental health', 'counseling', 'counselling', 'therapy', 'psychotherapy', 'psychology'],
  },
  wellness_program: {
    label: 'Wellness facility with daily programming', fit: 0.5,
    keywords: ['wellness center', 'wellness centre', 'day program', 'daily programming'],
  },
  medical_office: {
    label: 'Medical office', fit: 0.15,
    keywords: ['medical', 'clinic', 'physician', 'doctor', 'pediatric', 'dental', 'urgent care'],
  },
  other: { label: 'Other / unclassified', fit: 0, keywords: [] },
};

// ---- Service area ----------------------------------------------------------------------------
// Cities are matched against the organization's city (case/accent-insensitive). County is the
// stronger signal when a provider supplies it (Google's administrative_area_level_2).
export const PALM_BEACH_CITIES = ['west palm beach', 'boca raton', 'delray beach', 'boynton beach', 'jupiter',
  'palm beach gardens', 'wellington', 'lake worth', 'lake worth beach', 'greenacres', 'royal palm beach',
  'riviera beach', 'lantana', 'north palm beach', 'palm springs', 'belle glade', 'pahokee', 'tequesta',
  'juno beach', 'palm beach', 'lake park', 'loxahatchee', 'loxahatchee groves', 'westlake', 'highland beach',
  'ocean ridge', 'hypoluxo', 'manalapan', 'south palm beach', 'mangonia park', 'haverhill', 'cloud lake',
  'glen ridge', 'atlantis', 'golf', 'briny breezes', 'gulf stream', 'jupiter inlet colony', 'palm beach shores',
  'south bay', 'lake clarke shores', 'palm beach county'];

export const BROWARD_CITIES = ['fort lauderdale', 'hollywood', 'pembroke pines', 'coral springs', 'miramar',
  'pompano beach', 'davie', 'plantation', 'sunrise', 'deerfield beach', 'weston', 'lauderhill', 'tamarac',
  'coconut creek', 'margate', 'north lauderdale', 'oakland park', 'lauderdale lakes', 'cooper city',
  'dania beach', 'hallandale beach', 'wilton manors', 'parkland', 'lighthouse point', 'southwest ranches',
  'west park', 'lauderdale by the sea', 'pembroke park', 'hillsboro beach', 'sea ranch lakes', 'lazy lake',
  'broward county'];

export const DEFAULT_SERVICE_AREA = {
  label: 'Palm Beach and Broward counties, Florida',
  counties: ['palm beach', 'broward'],
  cities: [...PALM_BEACH_CITIES, ...BROWARD_CITIES],
  state: 'FL',
  // Distance is measured from the kitchen origin (KITCHEN_ORIGIN_LAT/LNG) and from every existing
  // contract site — a clinic next door to DGP Pompano rides the same run.
  near_miles: 10,
  max_miles: 30,
};

// ---- Discovery -----------------------------------------------------------------------------------
// Concrete categories with DGP-like recurring weekday meal demand. Not "medical office".
export const DISCOVERY_QUERIES = [
  'behavioral health center',
  'mental health treatment center',
  'addiction treatment center',
  'drug and alcohol recovery center',
  'partial hospitalization program',
  'intensive outpatient program',
  'adult day care center',
  'rehabilitation center',
  'outpatient behavioral health',
];

export const DISCOVERY_AREAS = [
  'Palm Beach County, FL', 'Broward County, FL',
  'West Palm Beach, FL', 'Boca Raton, FL', 'Delray Beach, FL', 'Boynton Beach, FL', 'Jupiter, FL',
  'Palm Beach Gardens, FL', 'Lake Worth Beach, FL', 'Wellington, FL',
  'Fort Lauderdale, FL', 'Pompano Beach, FL', 'Deerfield Beach, FL', 'Hollywood, FL', 'Coral Springs, FL',
  'Pembroke Pines, FL', 'Plantation, FL', 'Davie, FL', 'Sunrise, FL', 'Oakland Park, FL',
];

// ---- ICP scoring defaults (owner-editable in Sales → Settings) ----------------------------------
// Max points per criterion. The score is normalised to 0–100 over the SUM of these, so an owner
// who reweights never produces a 130-point score.
export const DEFAULT_ICP = {
  weights: {
    category_fit: 25,
    recurring_meal: 20,
    volume: 15,
    route_fit: 15,
    contact_quality: 10,
    multi_site: 5,
    operational_fit: 10,
  },
  tiers: { A: 80, B: 65, C: 45 },
  // Capacity bands for volume_potential (beds / patients / participants stated on their own site,
  // or a number the owner typed). Unknown capacity earns nothing — missing facts stay missing.
  volume_bands: [
    { min: 50, fraction: 1 },
    { min: 25, fraction: 0.75 },
    { min: 10, fraction: 0.45 },
    { min: 1, fraction: 0.2 },
  ],
  category_fit: Object.fromEntries(Object.entries(ICP_CATEGORIES).map(([k, v]) => [k, v.fit])),
  disqualify_out_of_area: true,
  disqualify_closed: true,
};

// ---- The institutional offer (owner-editable; send is BLOCKED until he saves it) ----------------
// Every sentence below is either a feature the codebase actually runs (the daily headcount link is
// /lunch-count; account invoicing is contract_invoices) or a blank the owner fills. No prices, no
// delivery windows, no dietary guarantees, no medical claims, no customer counts.
export const DEFAULT_OFFER = {
  confirmed: false,
  product_name: 'Añejo Managed Meal Service',
  headline: 'Scheduled, freshly prepared meals for your program',
  value_prop: 'We prepare meals fresh and deliver them on a set weekly schedule. Your staff send the day\'s headcount from a private link each morning, and the account receives one invoice.',
  cta_text: 'Would it be useful if I sent you a sample weekly menu and pricing for your approximate headcount?',
  // A tasting is an OFFER of something free. It is off until the owner turns it on.
  tasting_enabled: false,
  tasting_cta: 'Would you be open to a tasting for your team?',
  // 'on_request' — no number anywhere; 'show_from' — "from $X per meal" using price_from_cents.
  pricing_display_policy: 'on_request',
  price_from_cents: null,
  service_area_text: 'Palm Beach and Broward counties',
  delivery_days_text: '',       // e.g. "Monday–Friday" — blank means the page does not claim one
  headcount_cutoff_text: '',    // e.g. "9:00 AM" — blank means "a morning cutoff we agree with you"
  // Live menu item ids to show as a SAMPLE on the landing page. Empty = no sample menu section.
  sample_menu_item_ids: [],
  capacity_note: '',            // e.g. "We are onboarding two new accounts this month."
  catering_link_enabled: true,  // secondary link to catering / La Cajita on the landing page
};

// ---- Proof / case study policy ---------------------------------------------------------------
// DGP's name and numbers are never used unless named proof is explicitly on AND permission is
// recorded. Anonymous proof text is blank by default: the owner writes it, and only if it is true.
export const DEFAULT_PROOF = {
  mode: 'none',                 // none | anonymous | named
  anonymous_text: '',           // e.g. "We currently provide recurring scheduled lunch service to a healthcare organization in South Florida."
  named_text: '',
  named_permission_recorded: false,
  named_permission_note: '',    // who granted it, when
};

// ---- Sender identity ----------------------------------------------------------------------------
// A cold note from noreply@ is a note nobody can answer, and replies ARE the product of this whole
// system. Send is blocked until a real reply-to mailbox is set.
export const DEFAULT_SENDER = {
  from_name: '',                // "Dayan at Añejo"
  from_email: '',               // must be on the Resend-verified sending domain
  reply_to: '',                 // a mailbox a human reads daily
  signature_name: '',
  signature_title: '',
  signature_phone: '',
};

// Local business hours (ET) during which prospect email may leave. Weekdays 9–4 by default.
export const DEFAULT_SEND_WINDOW = { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 16 };
