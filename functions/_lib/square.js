// Shared Square client for Pages Functions. Files under functions/_lib are not routed.
// Uses the sandbox host when SQUARE_ENV !== 'production' so test mode never touches live money.

export function squareBase(env) {
  return env.SQUARE_ENV === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

export function squareConfigured(env) {
  return !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}

// Thin wrapper around the Square REST API. Returns { ok, status, data }.
export async function square(env, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${squareBase(env)}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      // Square-Version intentionally omitted → uses the app's dashboard-default
      // version (matches the validated /v2/locations call). Pin a date before go-live.
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

// Money helper: dollars (number) -> Square integer cents.
export const money = (dollars) => ({ amount: Math.round(Number(dollars) * 100), currency: 'USD' });
