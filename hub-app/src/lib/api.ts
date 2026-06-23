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
