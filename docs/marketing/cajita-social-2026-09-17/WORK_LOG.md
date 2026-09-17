# Marketing recovery and photo drop-off — September 17, 2026

Authority: Dayan asked to prioritize social marketing, make generating/scheduling easier, and create a designated photo drop-off accessible to marketing and Hub. Existing guarded-deployment authority persists. Public posts require rendered preview review before final approval. No credentials, customer messages or public posts changed in this work.

Observed supported-browser state: @anejo.catering.co connected, 76 followers, 9 posts; Hub activity reports41 days since last publication. Old drafts include governance flags and August proposed dates. Recorded token expiry September20 is a configured date, not an independently verified Meta expiry. Public Instagram shows /go in bio. Existing metrics and zero attributed orders do not establish actual sales or unique visitors.

Implemented private Photos/Fotos folder in Marketing, shared by owner and marketing role. Uses existing R2 with a restricted marketing-library/ namespace, not Google Drive sync or a public folder. Original JPEG/PNG/WebP <=5MB preserved; name,event/folder,tags stored; bounded paginated listing. HEIC/videos are not yet supported. PNG/WebP can generate separate JPEG copies for Instagram. Search explicitly covers loaded photos only. Employee desk links directly to Photos. Photo selection opens unsaved composer; caption preview generation uses current brand/menu context and existing metered AI budget without executing actions. Saving/scheduling remain explicit.

Repaired atomic creation of post+first slide, invalid/past scheduled dates, and silent scheduler query failure (now503, no unknown work processed). Stale publishing-state recovery not changed; automatic retry can duplicate external posts and needs receipt reconciliation.

Prepared3 original-event campaign previews in drafts.json and preview.html. These are not scheduled/published. Personalized birthday tags visible in original photos require Dayan's review/permission; captions do not name or tag people. Suggested times are not claimed to be optimized from metrics. No synthetic event imagery.

Validation before final search control:2522 root tests passed, lint0errors/4existingwarnings, Pages Functions build and ancestry guard passed. New search control passed its focused test; all451UI tests passed. Logs /tmp/anejo-marketing-*. Final release/browser evidence appended below.
