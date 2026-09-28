# Editorial pixel lifetime — September 28

Local prototype optimization, not deployed. Removed unnecessary full-frame copies during background sampling and final encoding. withRaster invokes its synchronous consumer while the image/renderer remain alive and frees both in finally; only computed ink statistics/JPEG bytes escape. The tiny32×32probe retains its own4KiBcopy. This avoids relying on post-free WASM pixel ownership.

Root validation:18prototype tests passed;12maximum-dimension workerd renders and both Node previews retained exact prior image hashes. Source/measurements: evidence-2026-09-28/editorial-raster-lifetime.json. Highest observed post-request usedSize was73,590,104bytes versus130,098,468 in the preceding fixed-font run. This is one observed local comparison, not peak/all-inclusive isolate accounting, a guaranteed percentage reduction or production CPU/memory acceptance. GC again timed out.

No browser renderer, current carousel, production import, publishing gate, database, credential or provider spend changed. Actual browserpixelparity, EXIF/ICC normalization, concurrent/cold/deployed resource behavior, durable jobs and owner review remain open. Next: compare actual browser output and investigate normalized-source ingestion before an opt-in draft job consumer is considered.
