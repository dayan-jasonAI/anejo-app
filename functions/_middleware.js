// Top-level Pages middleware — runs on EVERY request (pages, assets, and /api, which then also
// hits functions/api/_middleware.js via next()). Sole job: canonical-host enforcement.
//
// Cloudflare Pages serves the same build on all attached hostnames, and `_redirects` only matches
// paths (not hosts), so `www.anejocateringco.com` was serving a duplicate copy of the site. Here we
// 301 www → apex, preserving path + query. Preview hosts (*.pages.dev) and the apex pass straight
// through, so nothing else is affected.
export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (url.hostname === 'www.anejocateringco.com') {
    url.hostname = 'anejocateringco.com';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
