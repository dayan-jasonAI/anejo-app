# Reposado launch templates

Status: rendered review drafts; no scheduling/publication approval. The actual Hub images and image-audit scores must be verified after release and replacement.

The 26 JPEGs come from the shared production renderer at `public/hub/owner/assets/marketing-branding.js`. `manifest.json` identifies each website source, caption, heading, layout and exported filename. Food and packaging are preserved. Catering is1080×1080; the Cajita launch is1080×810. Only the three tall tray images need sampled-color side extensions. The photo itself is never cropped, stretched or reconstructed. Source illustrations remain design possibilities rather than documentary event evidence.

Run `python3 scripts/marketing-launch-preview.py` from the repository and open `http://127.0.0.1:8781/docs/marketing/cajita-social-2026-09-17/revision-3/render.html`. Click **Render all26slides**. The loopback-only server accepts only this page origin and the26-style slide filename pattern; it has no production credentials or API calls. It writes JPEGs and layout reports into this folder. The normal review page is one directory above: `preview.html`.

For future Hub posts, choose **Add branding**, select the source photo, enter the short title, and choose a matching Reposado template:

- Square, lower-edge title: individual tray or collection with an empty lower edge.
- Dense food spread: small title on the lower edge, emblem in the upper-left clear area.
- Tall tray, side title: preserve the tall photograph; use the added side background for lettering.
- Wide photo, lower-left title: thematic Cajita photos with open lower-left space.
- Signature Cajita launch: headline in the open lid area, emblem beside the food.

Templates fix their own positions; manual placement controls are disabled. Preview and inspect food, packaging labels, text legibility, logo shape and frame edges. A template does not recognize food automatically. If the photo differs from the reference, select another layout or provide reviewed protected regions; never assume a successful render proves suitability. **Use this** replaces the selected slide, preserving its sequence and original stored image; caption/media changes clear prior audit/approval. Audit the saved draft, using the actual images. A current passing score is evidence for the audited revision, not a promise of sales and not publication authorization.

The shared brand brief now records the owner direction and both compiled consumers have been regenerated. The live owner-editable brand document still needs the same targeted addition at release; existing live content must be preserved.
