// Thin client over the existing Cloudflare Functions API. Sends the session cookie
// (credentials:'include') so the SAME magic-link/PIN auth the vanilla HUB uses works here —
// no new auth system. In dev, vite proxies /api → `wrangler pages dev`.

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
    return await r.json();
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
