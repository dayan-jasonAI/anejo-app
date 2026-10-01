# Legacy social upload bounds — September28

Implemented locally in social-upload.js. The currently inspected public compose path uses marketing-library/branded-save; no current public caller of this legacy endpoint was found. This is endpoint hardening, not proof of the active photo-to-post workflow.

Authenticated JSON is streamed with the existing bounded reader. Encoded and decoded sizes enforce5MiB, JSON media type is checked, base64 is strict/canonical, role is bounded80characters, and JPEG marker/dimension validation runs before R2 storage. It is structural validation, not full decoding, image quality or authenticity verification. HEIC guidance no longer promises that a screenshot/CopyPhoto produces JPEG.

Root reran46tests (7new actual-handler tests plus existing related groups), all passed. Tests use a real JPEG and validJPEG-comment padding at5MiB, reject5MiB+1 before decoding, cancel streamed oversized bodies despite misleading Content-Length, enforce auth before bodyread and reject invalidheaders/base64 without storage. Log:/tmp/anejo-upload-bounds-root.log. No dependencies, schemas, credentials or production data changed. Deployment not attempted; existing access blockers remain.
