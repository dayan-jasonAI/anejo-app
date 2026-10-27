/* Private media preparation only. The runner has no approval, scheduling or provider-generation action. */
(function (global) {
  'use strict';
  var API = '/api/hub/owner/social-campaigns', IMAGE = 5 * 1024 * 1024, VIDEO = 25 * 1024 * 1024;
  function fail(message) { throw new Error(message); }
  function sha(bytes) { return crypto.subtle.digest('SHA-256', bytes).then(function (hash) { return Array.from(new Uint8Array(hash), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }); }
  function textHash(text) { return sha(new TextEncoder().encode(text)); }
  function parseManifest(value) {
    if (!value || value.schema !== 'anejo-campaign-media-batch-v1' || typeof value.campaign_id !== 'string' || !/^sc_[a-z0-9_-]{1,100}$/i.test(value.campaign_id) || !Array.isArray(value.slots) || !value.slots.length || value.slots.length > 180) fail('Choose a media manifest with 1–180 saved campaign posts.');
    var ids = new Set(), posts = new Set();
    var slots = value.slots.map(function (slot) {
      if (!slot || typeof slot.slot_id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(slot.slot_id) || ids.has(slot.slot_id) || typeof slot.post_id !== 'string' || !/^sp_[a-z0-9_-]{1,100}$/i.test(slot.post_id) || posts.has(slot.post_id) || !['feed', 'story', 'reel'].includes(slot.channel) || !/^[a-f0-9]{64}$/.test(slot.caption_sha256 || '') || !Array.isArray(slot.assets) || !slot.assets.length || slot.assets.length > 10) fail('Every post needs unique saved IDs, its exact caption hash and ordered media.');
      ids.add(slot.slot_id); posts.add(slot.post_id); var names = new Set();
      var assets = slot.assets.map(function (asset) {
        if (!asset || typeof asset.filename !== 'string' || !/^[^/\\\x00-\x1f]{1,180}$/.test(asset.filename) || names.has(asset.filename) || !/^[a-f0-9]{64}$/.test(asset.sha256 || '') || !['image/jpeg', 'video/mp4', 'video/quicktime'].includes(asset.content_type) || !Number.isSafeInteger(asset.byte_length) || asset.byte_length < 12 || asset.byte_length > (asset.content_type === 'image/jpeg' ? IMAGE : VIDEO)) fail('Each asset needs a basename, exact SHA-256, supported MIME type and bounded byte size.');
        names.add(asset.filename); return { filename: asset.filename, sha256: asset.sha256, byte_length: asset.byte_length, content_type: asset.content_type };
      });
      if (slot.channel !== 'feed' && assets.length !== 1 || slot.channel === 'feed' && assets.some(function (a) { return a.content_type !== 'image/jpeg'; }) || slot.channel === 'reel' && assets[0].content_type === 'image/jpeg') fail('Feed posts use up to 10 JPEGs; Stories one photo/video; Reels one video.');
      if (slot.expected_revision_snapshot != null && (typeof slot.expected_revision_snapshot !== 'string' || !slot.expected_revision_snapshot || slot.expected_revision_snapshot.length > 64000)) fail('The optional saved revision is invalid.');
      return { slot_id: slot.slot_id, post_id: slot.post_id, channel: slot.channel, caption_sha256: slot.caption_sha256, expected_revision_snapshot: slot.expected_revision_snapshot || null, assets: assets };
    });
    return { schema: value.schema, campaign_id: value.campaign_id, source_calendar_sha256: value.source_calendar_sha256 || null, slots: slots };
  }
  function readView(view, manifest) {
    if (!view || !view.ok || view.campaign?.id !== manifest.campaign_id || !['draft', 'paused'].includes(view.campaign.state) || !Number.isSafeInteger(view.campaign.version) || !Array.isArray(view.posts)) fail('This campaign must be a current private draft or paused cycle.');
    return view;
  }
  function member(view, slot) {
    var post = view.posts.find(function (p) { return p.slot_id === slot.slot_id; });
    if (!post || post.post_id !== slot.post_id || post.channel !== slot.channel || !['draft', 'failed'].includes(post.post_status) || typeof post.revision_snapshot !== 'string') fail('A saved post, channel or status changed. Refresh the manifest before continuing.');
    return post;
  }
  function keysMatch(post, record) { return record.assets.every(function (a) { return a.receipt; }) && JSON.stringify((post.media || []).map(function (m) { return m.key; })) === JSON.stringify(record.assets.map(function (a) { return a.receipt.key; })); }
  function Runner(options) { this.options = options; this.manifest = null; this.files = new Map(); this.checkpoint = null; this.view = null; this.stopRequested = false; this.running = false; }
  Runner.prototype.persist = function () { this.checkpoint.updated_at = new Date().toISOString(); this.options.persist(this.checkpoint); this.options.progress?.(this.checkpoint); };
  Runner.prototype.prepare = async function (input, files, saved) {
    if (this.running) fail('Stop the current preparation first.');
    this.manifest = parseManifest(input); var hash = await textHash(JSON.stringify(this.manifest));
    if (files.length > 1800) fail('Choose at most 1,800 media files.'); this.files = new Map();
    Array.from(files).forEach(function (file) { if (this.files.has(file.name)) fail('Duplicate file basenames are ambiguous: ' + file.name); this.files.set(file.name, file); }, this);
    this.view = readView(await this.options.api(API + '?id=' + encodeURIComponent(this.manifest.campaign_id)), this.manifest);
    if (saved && (saved.slots?.length !== this.manifest.slots.length || new Set(saved.slots?.map(function(r){return r.slot_id;})).size !== this.manifest.slots.length)) fail('Checkpoint post mapping differs from this manifest.');
    if (saved && (saved.schema !== 'anejo-campaign-media-checkpoint-v1' || saved.manifest_hash !== hash || saved.campaign_id !== this.manifest.campaign_id || !Array.isArray(saved.slots))) fail('Checkpoint does not match this exact media manifest.');
    this.checkpoint = saved ? JSON.parse(JSON.stringify(saved)) : { schema: 'anejo-campaign-media-checkpoint-v1', campaign_id: this.manifest.campaign_id, manifest_hash: hash, source_calendar_sha256: this.manifest.source_calendar_sha256, created_at: new Date().toISOString(), status: 'checking', slots: [] };
    var count = 0;
    for (var slot of this.manifest.slots) {
      var post = member(this.view, slot); if (await textHash(post.caption || '') !== slot.caption_sha256) fail('Saved caption differs for ' + slot.slot_id + '. Captions will not be overwritten.');
      var record = this.checkpoint.slots.find(function (r) { return r.slot_id === slot.slot_id; });
      if (!record) { if (slot.expected_revision_snapshot && post.revision_snapshot !== slot.expected_revision_snapshot) fail('Saved revision differs for ' + slot.slot_id + '.'); record = { slot_id: slot.slot_id, post_id: slot.post_id, base_revision: post.revision_snapshot, state: 'pending', assets: slot.assets.map(function (a) { return Object.assign({}, a, { state: 'pending', receipt: null }); }), request: null }; this.checkpoint.slots.push(record); }
      if (!['pending','attaching','save_unknown','attached'].includes(record.state) || !Array.isArray(record.assets) || record.assets.some(function(a){return !['pending','uploading','uploaded','upload_unknown'].includes(a.state);}) || record.post_id !== slot.post_id || JSON.stringify(record.assets.map(function (a) { return [a.filename,a.sha256,a.byte_length,a.content_type]; })) !== JSON.stringify(slot.assets.map(function (a) { return [a.filename,a.sha256,a.byte_length,a.content_type]; }))) fail('Checkpoint asset mapping changed.');
      if (record.state === 'attached' && !keysMatch(post, record)) fail('A previously attached post changed. Do not overwrite it with an old checkpoint.');
      if (record.state !== 'attached' && record.base_revision !== post.revision_snapshot && !keysMatch(post, record)) fail('Saved media or caption changed for ' + slot.slot_id + '.');
      if (record.state === 'attaching') record.state = 'save_unknown';
      for (var asset of record.assets) {
        if (asset.state === 'uploading') asset.state = 'upload_unknown';
        if (asset.receipt) { var receipt=asset.receipt; if (typeof receipt.key!=='string'||!/^marketing-library\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|mp4|mov)$/.test(receipt.key)||receipt.key.includes('..')||receipt.sha256!==asset.sha256||receipt.byte_length!==asset.byte_length||receipt.content_type!==asset.content_type||!this.options.verifyReceipt) fail('Checkpoint upload receipt needs verification.'); await this.options.verifyReceipt(receipt,asset); }
        var file = this.files.get(asset.filename); if (!file || file.size !== asset.byte_length || file.size > (asset.content_type === 'image/jpeg' ? IMAGE : VIDEO) || (file.type && file.type !== asset.content_type)) fail('Choose the exact supported file: ' + asset.filename);
        if (await sha(await file.arrayBuffer()) !== asset.sha256) fail('File bytes do not match the manifest: ' + asset.filename);
        count++; this.options.checking?.(count, asset.filename);
      }
      if (keysMatch(post, record)) record.state = 'attached';
    }
    this.checkpoint.status = this.hasUnknown() ? 'needs_readback' : this.checkpoint.slots.every(function(r){return r.state==='attached';}) ? 'attached' : 'prepared'; this.persist(); return this.checkpoint;
  };
  Runner.prototype.hasUnknown = function () { return this.checkpoint.slots.some(function (r) { return r.state === 'save_unknown' || r.assets.some(function (a) { return a.state === 'upload_unknown'; }); }); };
  Runner.prototype.reconcile = async function () {
    if (this.running) fail('Wait for the current request.'); this.view = readView(await this.options.api(API + '?id=' + encodeURIComponent(this.manifest.campaign_id)), this.manifest);
    for (var slot of this.manifest.slots) { var post = member(this.view, slot), record = this.checkpoint.slots.find(function (r) { return r.slot_id === slot.slot_id; }); if (await textHash(post.caption || '') !== slot.caption_sha256) fail('The saved caption changed.'); if (keysMatch(post, record)) record.state = 'attached'; else if (record.state === 'attached' || record.base_revision !== post.revision_snapshot) fail('The saved post changed after this checkpoint.'); }
    this.checkpoint.status = this.hasUnknown() ? 'needs_readback' : this.checkpoint.slots.every(function(r){return r.state==='attached';}) ? 'attached' : 'prepared'; this.persist(); return this.checkpoint;
  };
  Runner.prototype.run = async function () {
    if (this.running || !this.checkpoint || this.hasUnknown()) fail('Resolve the unknown outcome with a saved readback before continuing.');
    this.running = true; this.stopRequested = false; this.checkpoint.status = 'preparing'; this.persist();
    try {
      this.view = readView(await this.options.api(API + '?id=' + encodeURIComponent(this.manifest.campaign_id)), this.manifest);
      for (var slot of this.manifest.slots) {
        var record = this.checkpoint.slots.find(function (r) { return r.slot_id === slot.slot_id; }), post = member(this.view, slot);
        if (await textHash(post.caption || '') !== slot.caption_sha256) fail('Saved caption changed; no overwrite was made.');
        if (record.state === 'attached') { if (!keysMatch(post, record)) fail('A previously attached post changed.'); continue; }
        if (record.base_revision !== post.revision_snapshot) fail('Saved post revision changed; no overwrite was made.');
        for (var asset of record.assets) {
          if (this.stopRequested) break;
          if (asset.receipt) continue;
          asset.state = 'uploading'; this.persist();
          try { var receipt = await this.options.upload(this.files.get(asset.filename)); if (!receipt || typeof receipt.key !== 'string' || !/^marketing-library\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|mp4|mov)$/.test(receipt.key) || receipt.key.includes('..') || receipt.sha256 !== asset.sha256 || receipt.byte_length !== asset.byte_length || receipt.content_type !== asset.content_type) fail('Upload receipt did not match the selected bytes.'); asset.receipt = receipt; asset.state = 'uploaded'; this.persist(); }
          catch (error) { asset.state = 'upload_unknown'; this.checkpoint.status = 'needs_readback'; this.persist(); throw error; }
        }
        if (this.stopRequested) break;
        record.request = { op: 'save_media', id: this.manifest.campaign_id, expected_version: this.view.campaign.version, request_id: crypto.randomUUID(), post_id: slot.post_id, expected_revision_snapshot: record.base_revision, media_keys: record.assets.map(function (a) { return a.receipt.key; }) }; record.state = 'attaching'; this.persist();
        try { var result = readView(await this.options.api(API, { method: 'POST', body: record.request }), this.manifest); var actual = member(result, slot); if (!keysMatch(actual, record) || await textHash(actual.caption || '') !== slot.caption_sha256) fail('Attachment needs a current readback.'); this.view = result; record.state = 'attached'; this.persist(); this.options.accept?.(result); }
        catch (error) { record.state = 'save_unknown'; this.checkpoint.status = 'needs_readback'; this.persist(); throw error; }
      }
      this.checkpoint.status = this.stopRequested ? 'paused' : 'attached'; this.persist(); return this.checkpoint;
    } catch (error) { if (this.checkpoint.status !== 'needs_readback') this.checkpoint.status = 'stopped'; this.persist(); throw error; }
    finally { this.running = false; }
  };
  global.CampaignBatchMedia = { parseManifest: parseManifest, Runner: Runner, textHash: textHash };
  if (!global.document) return;
  var dialog, runner, manifest, manifestRaw, selectedFiles = [], storageKey, uiBusy = false;
  function bridge() { return global.CampaignReview?.batch; }
  function status(text) { document.getElementById('campaign-batch-status').textContent = text; }
  function download(name, value) { var url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function progress(cp) { var attached = cp.slots.filter(function (r) { return r.state === 'attached'; }).length, uploaded = cp.slots.reduce(function (n,r) { return n+r.assets.filter(function (a) { return !!a.receipt; }).length; },0); document.getElementById('campaign-batch-progress').max = manifest.slots.length; document.getElementById('campaign-batch-progress').value = attached; status(attached + ' of ' + manifest.slots.length + ' posts attached · ' + uploaded + ' file(s) uploaded · ' + cp.status.replaceAll('_',' ')); document.getElementById('campaign-batch-export').disabled = false; }
  function controls(busy) { uiBusy=busy; ['campaign-batch-manifest','campaign-batch-files','campaign-batch-checkpoint','campaign-batch-check','campaign-batch-close'].forEach(function (id) { document.getElementById(id).disabled=busy; }); document.getElementById('campaign-batch-start').disabled=busy||!runner||runner.hasUnknown()||runner.checkpoint.status==='attached'; document.getElementById('campaign-batch-readback').disabled=busy||!runner; document.getElementById('campaign-batch-stop').disabled=!busy; }
  async function prepare() {
    var gate=bridge(); if (!gate || !gate.available()) { status('Save caption edits and finish other actions before preparing media.'); return; }
    if (!manifestRaw || !selectedFiles.length) { status('Choose a manifest and its media files first.'); return; }
    if (!gate.lock()) return; controls(true);
    try { manifest=parseManifest(manifestRaw); if (gate.campaignId()!==manifest.campaign_id) fail('Open the campaign named by this manifest.'); storageKey='anejo-campaign-media:'+manifest.campaign_id+':'+await textHash(JSON.stringify(manifest)); var stored=localStorage.getItem(storageKey), saved=stored?JSON.parse(stored):null;
      runner=new Runner({ api:Hub.api, verifyReceipt:async function(receipt,asset){var response=await fetch('/api/hub/media/'+receipt.key,{credentials:'same-origin'});if(!response.ok)fail('Checkpoint media is unavailable.');var reader=response.body.getReader(),chunks=[],size=0;while(true){var part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>asset.byte_length){await reader.cancel();fail('Checkpoint media bytes changed.');}chunks.push(part.value);}if(size!==asset.byte_length||await sha(await new Blob(chunks).arrayBuffer())!==asset.sha256)fail('Checkpoint media bytes changed.');}, upload:async function(file){var form=new FormData();form.append('file',file);var response=await fetch('/api/hub/owner/social-campaign-media-upload',{method:'POST',credentials:'same-origin',body:form}),data=await response.json();if(!response.ok||!data.ok)fail('Upload was not confirmed. Refresh saved status; no automatic retry.');return data.media;},persist:function(cp){localStorage.setItem(storageKey,JSON.stringify(cp));},progress:progress,checking:function(n,name){status('Checking local file '+n+': '+name);},accept:function(view){gate.accept(view);} });
      await runner.prepare(manifest,selectedFiles,saved); gate.accept(runner.view); status(runner.checkpoint.status==='attached'?'All listed media is already attached. Nothing will be uploaded again.':runner.hasUnknown()?'Checkpoint restored with an unknown outcome. Read saved status; files will not be uploaded again.':'Files and saved captions match. Start to attach private media; nothing will be scheduled.');
    } catch(error) { runner=null;status('Preparation stopped. '+error.message); }
    finally { gate.unlock();controls(false); }
  }
  async function start() { var gate=bridge();if(!runner||!gate?.lock())return;controls(true);try{await runner.run();}catch(error){gate.invalidate();status('Stopped safely. '+error.message+' Export the checkpoint and read saved status before continuing.');}finally{gate.unlock();controls(false);} }
  function open() {
    if (!bridge()?.available()) return;
    if (!dialog) { dialog=document.createElement('dialog');dialog.id='campaign-batch-dialog';dialog.className='campaign-review-dialog campaign-batch-dialog';dialog.setAttribute('aria-labelledby','campaign-batch-title');dialog.innerHTML='<h3 id="campaign-batch-title">Attach a media batch</h3><p>Choose the manifest and all matching files once. Captions stay unchanged. Review and scheduling remain separate.</p><label>Media manifest JSON<input id="campaign-batch-manifest" type="file" accept="application/json,.json"></label><label>Media files<input id="campaign-batch-files" type="file" accept="image/jpeg,video/mp4,video/quicktime,.jpg,.jpeg,.mp4,.mov" multiple></label><details><summary>Continue from a checkpoint</summary><label>Checkpoint JSON<input id="campaign-batch-checkpoint" type="file" accept="application/json,.json"></label><p>Checkpoints contain saved upload receipts, never your sign-in.</p></details><progress id="campaign-batch-progress" value="0" max="1" aria-label="Posts attached"></progress><p id="campaign-batch-status" role="status" aria-live="polite">Choose the manifest and files to begin.</p><div class="campaign-action-buttons"><button id="campaign-batch-check" class="campaign-button" type="button">Check files</button><button id="campaign-batch-start" class="campaign-button primary" type="button" disabled>Attach private media</button><button id="campaign-batch-stop" class="campaign-button" type="button" disabled>Stop after current request</button><button id="campaign-batch-readback" class="campaign-button" type="button" disabled>Read saved status</button><button id="campaign-batch-export" class="campaign-button" type="button" disabled>Export checkpoint</button><button id="campaign-batch-close" class="campaign-button" type="button">Close</button></div>';document.body.appendChild(dialog);
      document.getElementById('campaign-batch-manifest').addEventListener('change',async function(event){manifestRaw=null;manifest=null;runner=null;document.getElementById('campaign-batch-progress').value=0;controls(true);try{var file=event.target.files[0];if(!file||file.size>1024*1024)fail('Manifest must be smaller than1MB.');manifestRaw=JSON.parse(await file.text());manifest=parseManifest(manifestRaw);runner=null;status(manifest.slots.length+' posts in this manifest. Choose matching media files.');controls(false);}catch(error){manifestRaw=null;status(error.message);}finally{controls(false);}});
      document.getElementById('campaign-batch-files').addEventListener('change',function(event){selectedFiles=Array.from(event.target.files);runner=null;document.getElementById('campaign-batch-progress').value=0;status(selectedFiles.length+' files selected. Check their bytes before attaching.');controls(false);});
      document.getElementById('campaign-batch-checkpoint').addEventListener('change',async function(event){try{var file=event.target.files[0];if(!file||file.size>2*1024*1024||!manifest)fail('Choose the media manifest first, then a checkpoint smaller than2MB.');var cp=JSON.parse(await file.text()),expected=await textHash(JSON.stringify(manifest));if(cp.schema!=='anejo-campaign-media-checkpoint-v1'||cp.manifest_hash!==expected||cp.campaign_id!==manifest.campaign_id)fail('Checkpoint does not match this manifest.');localStorage.setItem('anejo-campaign-media:'+manifest.campaign_id+':'+expected,JSON.stringify(cp));runner=null;status('Checkpoint loaded. Check files to verify the current saved state.');controls(false);}catch(error){status(error.message);}});
      document.getElementById('campaign-batch-check').addEventListener('click',prepare);document.getElementById('campaign-batch-start').addEventListener('click',start);document.getElementById('campaign-batch-stop').addEventListener('click',function(){if(runner){runner.stopRequested=true;status('Will stop after the current request. Saved receipts are retained.');}});document.getElementById('campaign-batch-readback').addEventListener('click',async function(){var gate=bridge();if(!runner||!gate?.lock(true))return;controls(true);try{await runner.reconcile();gate.accept(runner.view);status(runner.hasUnknown()?'An upload or save is still unconfirmed. No upload will be retried; export the checkpoint for review.':'Saved posts reconciled. You can continue the remaining private media.');}catch(error){status(error.message);}finally{gate.unlock();controls(false);}});document.getElementById('campaign-batch-export').addEventListener('click',function(){if(runner)download('anejo-media-checkpoint.json',runner.checkpoint);});document.getElementById('campaign-batch-close').addEventListener('click',function(){dialog.close();});dialog.addEventListener('cancel',function(event){if(uiBusy)event.preventDefault();});
    }
    dialog.showModal();document.getElementById('campaign-batch-manifest').focus();
  }
  document.getElementById('campaign-batch-open').addEventListener('click',open);
})(globalThis);
