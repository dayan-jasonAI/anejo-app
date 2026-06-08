// GET/POST /api/auth/logout — clears the session and returns to the portal landing.
import { readCookie, destroySession, clearCookie, isSecureRequest } from '../../_lib/session.js';
import { appBaseUrl } from '../../_lib/util.js';

export const onRequest = async ({ request, env }) => {
  await destroySession(env, readCookie(request));
  return new Response(null, {
    status: 302,
    headers: { Location: `${appBaseUrl(env, request)}/portal`, 'Set-Cookie': clearCookie(isSecureRequest(request)) },
  });
};
