# La Cajita tray-band template preview

The existing Details tab includes an optional **Preview 11×17 tray bands** action. It sends only the nearest supported template family, current round-label wording and up to three selected food names to a deterministic, non-persistent first-party endpoint. A round-label message longer than 48 characters is not truncated or changed; the customer sees the smaller template limit and keeps the original design intact.

The result is a scaled, sandboxed three-band preview using the same `renderEventBands` structure as the owner event workflow. Uploaded artwork, custom color placement and production approval are explicitly excluded from this template preview. The request configuration, quantity, price, uploaded files and checkout behavior are unchanged. No quote or customer record is created by viewing a template. The existing design request remains the path for Añejo to review final artwork.

`POST /api/cajita-label-preview` accepts only three template keys, up to 48 title characters and one to three dish names of up to 80 characters. The body is bounded at 4 KiB. Unknown fields, arbitrary destinations, image URLs, approval flags, cross-origin requests and malformed content are rejected. QR destinations and public contact information come from the shared renderer, not client input. Responses are private/no-store and iframe content has a restrictive CSP. No database, provider or filesystem API is used by the endpoint.

Each preview request is tied to its exact current input. Later draft changes or version changes hide the previous preview and abort an outstanding request. A stale response cannot replace the current design. English/Spanish product messaging is local; customer wording is preserved literally.

Local validation: `node --no-warnings --test test/money/cajita-label-preview.test.js test/ui/cajita-bilingual-builder.test.js` passes 11 tests. Focused ESLint and builder syntax checks pass. Root must rebuild `public/assets/js/cajita-builder.js`, perform browser acceptance and record release/live evidence separately. These checks do not prove deployment or customer production approval.
