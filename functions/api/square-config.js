// GET /api/square-config — publishable Square identifiers for the Web Payments SDK.
// applicationId + locationId are client-side IDs by design (not secrets); the access token
// stays server-side. Used by the subscribe page to render the hosted card field.
import { json } from '../_lib/util.js';

export const onRequestGet = ({ env }) => {
  return json({
    applicationId: env.SQUARE_APPLICATION_ID || null,
    locationId: env.SQUARE_LOCATION_ID || null,
    env: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
  });
};
