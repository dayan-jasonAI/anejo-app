// Thin client over the existing Cloudflare Functions API. Sends the session cookie
// (credentials:'include') so the SAME magic-link/PIN auth the vanilla HUB uses works here —
// no new auth system. In dev, vite proxies /api → `wrangler pages dev`.
import type { ChatMessage } from './useStudioStream';

export interface Me {
  authed: boolean;
  user_type?: string;
  role?: string;
  name?: string;
  is_lead?: boolean;
}

export async function getMe(): Promise<Me> {
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    if (!r.ok) return { authed: false };
    const d = await r.json();
    // /api/me returns the session shape; treat a staff role as authed for the HUB.
    const role = d.role || d.user_type;
    return { authed: !!role, user_type: d.user_type, role, name: d.name || d.first_name, is_lead: !!d.is_lead };
  } catch {
    return { authed: false };
  }
}

export async function createSession(title: string): Promise<{ id: string } | null> {
  try {
    const r = await fetch('/api/hub/kitchen/studio/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode: 'mixed', title }),
    });
    if (!r.ok) return null;
    // The endpoint returns { ok, session: { id, ... } }; tolerate a bare { id } too.
    const d = await r.json();
    const sid = d?.session?.id || d?.id;
    return sid ? { id: sid } : null;
  } catch {
    return null;
  }
}

export interface StudioMacros {
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface StudioContent {
  ok?: boolean;
  caption_en: string;
  caption_es: string;
  blurb_en: string;
  blurb_es: string;
  image_url: string | null;
  macros?: StudioMacros | null;
  demo?: boolean;
}

// One-click brand content for a dish from the current Studio session.
export async function generateContent(sessionId: string, recipeName: string): Promise<StudioContent | null> {
  try {
    const r = await fetch('/api/hub/kitchen/studio/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId, recipe_name: recipeName }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

async function postJson(path: string, body: unknown): Promise<any | null> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Attach a photo to the session (stored in R2; used as vision context on the next chat turn).
export async function uploadPhoto(sessionId: string, file: File): Promise<boolean> {
  try {
    const dataUrl = await readDataUrl(file);
    const d = await postJson('/api/hub/kitchen/studio/media', {
      session_id: sessionId,
      media_type: 'photo',
      content: 'photo:' + file.name,
      data_url: dataUrl,
      meta: { size: file.size, type: file.type },
    });
    return !!(d && d.ok);
  } catch {
    return false;
  }
}

// Transcribe a recorded voice clip. Returns the text, or { unavailable } when STT isn't enabled.
export async function transcribeVoice(
  sessionId: string,
  blob: Blob,
  lang: 'en' | 'es',
): Promise<{ text?: string; unavailable?: boolean }> {
  try {
    const dataUrl = await readDataUrl(blob);
    const d = await postJson('/api/hub/kitchen/studio/transcribe', { session_id: sessionId, audio: dataUrl, lang });
    if (d && d.ok && d.text) return { text: d.text };
    return { unavailable: true };
  } catch {
    return { unavailable: true };
  }
}

export interface RecipeDraft {
  name?: string;
  summary?: string;
  ingredients?: string[];
  steps?: string[];
  nutrition?: unknown;
  tags?: string[];
}

// Ask the AI to draft a structured recipe from the session (not yet saved).
export async function draftRecipe(sessionId: string): Promise<{ draft: RecipeDraft; demo?: boolean } | null> {
  return postJson('/api/hub/kitchen/recipe/create?ai_draft=1', { session_id: sessionId });
}

// Save the (possibly edited) draft as a recipe.
export async function createRecipe(sessionId: string, draft: RecipeDraft): Promise<{ recipe: { id: string } } | null> {
  return postJson('/api/hub/kitchen/recipe/create', {
    session_id: sessionId,
    name: draft.name,
    summary: draft.summary || null,
    ingredients: draft.ingredients || [],
    steps: draft.steps || [],
    nutrition: draft.nutrition || null,
    tags: draft.tags || [],
  });
}

// Publish a saved recipe to the kitchen library.
export async function publishRecipe(recipeId: string): Promise<boolean> {
  const d = await postJson('/api/hub/kitchen/recipe/publish', { id: recipeId });
  return !!(d && d.ok);
}

export interface BriefDraft {
  title: string;
  rationale: string;
  proposed_body: string;
  demo?: boolean;
}

export interface MyBriefProposal {
  id: string;
  title?: string;
  rationale?: string;
  status: string; // pending | approved | rejected | needs_info
  decision_note?: string;
  decided_at?: number;
  created_at: number;
}

// The current staffer's own Brief proposals + the owner's decision/note — their feedback loop.
export async function listMyBriefProposals(): Promise<MyBriefProposal[]> {
  try {
    const r = await fetch('/api/hub/kitchen/studio/brief-proposal', { credentials: 'include' });
    if (!r.ok) return [];
    const d = await r.json();
    return (d && d.proposals) || [];
  } catch {
    return [];
  }
}

// Ask the AI to draft a proposed change to the Brand & Standards Brief (not saved).
export async function draftBriefChange(sessionId: string, instruction: string): Promise<{ draft: BriefDraft; demo?: boolean } | null> {
  return postJson('/api/hub/kitchen/studio/brief-proposal?ai_draft=1', { session_id: sessionId, instruction });
}

// Submit a Brief change as a PROPOSAL for Dayan to approve in the HUB (never auto-applied).
export async function submitBriefProposal(
  sessionId: string,
  draft: { title: string; rationale: string; proposed_body: string },
): Promise<boolean> {
  const d = await postJson('/api/hub/kitchen/studio/brief-proposal', {
    session_id: sessionId,
    title: draft.title,
    rationale: draft.rationale,
    proposed_body: draft.proposed_body,
  });
  return !!(d && d.ok && d.proposal);
}

export interface StudioSession {
  id: string;
  title?: string;
  mode?: string;
  status?: string;
  ai_assist_count?: number;
  media_count?: number;
  created_at: number;
  updated_at?: number;
}

interface StudioEvent { kind?: string; content?: string; assist_type?: string }

// Convert stored session events into chat messages so a past conversation can be resumed.
export function eventsToMessages(events: StudioEvent[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let n = 0;
  for (const e of events || []) {
    const k = e.kind || '';
    const text = (e.content || '').toString();
    const id = 'ev' + (n++);
    if (k === 'user_text') out.push({ id, role: 'user', text });
    else if (k === 'voice_transcript') out.push({ id, role: 'user', text: '🎙️ ' + text });
    else if (k === 'ai_assist') out.push({ id, role: 'assistant', text, assistType: e.assist_type });
    else if (k === 'photo') out.push({ id, role: 'user', text: '📷' });
  }
  return out;
}

// The current user's recent Studio conversations (newest first). Scoped to them server-side.
export async function listSessions(): Promise<StudioSession[]> {
  try {
    const r = await fetch('/api/hub/kitchen/studio/session', { credentials: 'include' });
    if (!r.ok) return [];
    const d = await r.json();
    return (d && d.sessions) || [];
  } catch {
    return [];
  }
}

// Load one past conversation (ownership-checked server-side) → its messages for resume.
export async function loadSession(id: string): Promise<{ session: StudioSession; messages: ChatMessage[] } | null> {
  try {
    const r = await fetch('/api/hub/kitchen/studio/session?id=' + encodeURIComponent(id), { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !d.session) return null;
    return { session: d.session, messages: eventsToMessages(d.events || []) };
  } catch {
    return null;
  }
}
