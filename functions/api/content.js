// GET /api/content?lang=en|es — public, read-only. What the storefront should render in each
// owner-editable slot right now.
//
// Public on purpose: it carries copy the owner has chosen to publish, nothing else. No customer
// data, no settings, no counts.
import { json } from '../_lib/util.js';
import { liveBlocks } from '../_lib/content.js';

export const onRequestGet = async ({ request, env }) => {
  const lang = new URL(request.url).searchParams.get('lang') || 'en';
  const blocks = await liveBlocks(env, lang);
  return json({ ok: true, blocks }, 200, {
    // Short cache: an announcement should appear within a minute of being switched on, but this
    // endpoint sits on every page load and does not need to be hit fresh every time.
    'Cache-Control': 'public, max-age=60',
  });
};
