/* Owner-only campaign review. Caption suggestions live in this tab only.
   A downloaded review is never an approval record or a scheduling instruction. */
(function () {
  'use strict';
  var API = '/api/hub/owner/social-campaigns';
  var state = { cycles: [], cycle: null, readiness: {}, filter: 'all', view: 'list', edits: {}, loading: false, busy: false, needsRefresh: false, request: 0, saveRequest: null, nextRequest: null, mediaDraft: null };
  var root = document.getElementById('owner-root');
  var esc = Hub.esc;
  function say(text) { document.getElementById('campaign-feedback').textContent = text; }
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { var url = new URL(value, location.origin); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; }
  }
  function category(slot) {
    if (slot.post_status === 'published') return 'published';
    if (slot.post_status === 'scheduled') return 'scheduled';
    if (!slot.post_id || (slot.blockers || []).length || slot.post_status === 'failed') return 'blocked';
    if (slot.ready === true) return 'ready';
    return 'draft';
  }
  function label(slot) {
    if (!slot.post_id) return 'Unfilled';
    return { ready: 'Ready for review', draft: 'Draft', blocked: 'Needs attention', scheduled: 'Scheduled', published: 'Published' }[category(slot)];
  }
  function counts(slots) {
    var out = { ready: 0, draft: 0, blocked: 0, scheduled: 0, published: 0 };
    slots.forEach(function (slot) { out[category(slot)]++; }); return out;
  }
  function dirty() { return Object.keys(state.edits).length > 0; }
  function mediaPending() { return !!state.mediaDraft; }
  function approvalCurrent(cycle) {
    var record = cycle.approval;
    return !!(record && record.id && record.owner_id && record.approved_at && Number.isFinite(new Date(record.approved_at).getTime()) && record.scope === 'exact_manifest_only' && cycle.preview_digest && record.approved_manifest_hash === cycle.preview_digest);
  }
  function caption(slot) { return Object.prototype.hasOwnProperty.call(state.edits, slot.slot_id) ? state.edits[slot.slot_id] : (slot.caption || ''); }
  function dateLabel(slot, short) {
    var date = new Date(String(slot.date || '') + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime())) return 'Date not set';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', weekday: short ? undefined : 'short' }).format(date);
  }
  function timeLabel(slot) {
    if (!slot.scheduled_at) return slot.time ? slot.time + ' · suggested' : 'Time not set';
    var time = new Date(Number(slot.scheduled_at));
    if (!Number.isFinite(time.getTime())) return 'Time not set';
    try { return new Intl.DateTimeFormat('en-US', { timeZone: state.cycle.timezone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(time) + (slot.post_status === 'scheduled' || slot.post_status === 'published' ? '' : ' · suggested'); }
    catch (_) { return 'Timezone needs confirmation'; }
  }
  function title(slot) { return slot.title || slot.topic || (slot.caption || '').split('\n')[0].slice(0, 80) || 'A story still to shape'; }
  function isVideo(slot, media) {
    return (media || {}).kind === 'video' || /video|reels/i.test(String((media || {}).content_type || (media || {}).media_type || '')) || /VIDEO|REELS/.test(String(slot.media_type || '').toUpperCase()) || /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(String((media || {}).key || '') + ' ' + String((media || {}).preview_url || ''));
  }
  function byDate(slots) {
    var dates = {};
    slots.forEach(function (slot) { var key = slot.date || 'Date not set'; (dates[key] = dates[key] || []).push(slot); });
    return dates;
  }
  function mediaHtml(slot) {
    var first = (slot.media || [])[0], url = first && safeUrl(first.preview_url);
    if (!url) return '<p>Media not attached</p>';
    var video = isVideo(slot, first);
    return video ? '<video controls muted playsinline preload="metadata" src="' + esc(url) + '" aria-label="Video preview for ' + esc(dateLabel(slot)) + '"></video>' : '<img loading="lazy" src="' + esc(url) + '" alt="' + esc(first.alt || 'Campaign image for ' + dateLabel(slot)) + '">';
  }
  function card(slot) {
    var key = esc(slot.slot_id), kind = category(slot), offer = slot.offer || slot.offer_name || 'Not specified', cta = slot.cta || slot.cta_text || 'Not specified', link = safeUrl(slot.cta_url || slot.cta_link || '');
    var media = (slot.media || []).map(function (m, index) {
      var url = safeUrl(m.preview_url);
      var video = isVideo(slot, m);
      var preview = url ? (video ? '<video controls muted playsinline preload="none" src="' + esc(url) + '" aria-label="Media ' + (index + 1) + ' video preview"></video>' : '<img src="' + esc(url) + '" alt="Media ' + (index + 1) + ' for ' + esc(dateLabel(slot)) + '" loading="lazy">') : '';
      return '<dd class="campaign-asset">' + preview + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Open media ' + (index + 1) + '</a>' : 'Media URL unavailable') + '<span class="campaign-evidence">' + esc(m.key || '') + (m.sha256 ? ' · SHA-256 ' + esc(m.sha256) : '') + '</span></dd>';
    }).join('');
    return '<article class="campaign-card" id="slot-' + key + '" data-slot="' + key + '" tabindex="-1"><div class="campaign-visual">' + mediaHtml(slot) + '<span class="campaign-day">' + esc(dateLabel(slot, true)) + '</span></div><div class="campaign-card-content"><div class="campaign-card-top"><span class="campaign-label">' + esc(slot.channel || 'Instagram') + ' · ' + esc(slot.media_type || 'Format unset') + '</span><span class="campaign-badge ' + (kind === 'blocked' ? 'attention' : /scheduled|published/.test(kind) ? 'live' : '') + '">' + esc(label(slot)) + '</span></div><h3>' + esc(title(slot)) + '</h3><p class="campaign-time">' + esc(dateLabel(slot)) + ' · ' + esc(timeLabel(slot)) + '</p><p class="campaign-caption" translate="no" dir="auto">' + esc(caption(slot) || 'Caption not written yet.') + '</p><button type="button" class="campaign-button campaign-open" data-open="' + key + '">Review post</button><details><summary>Post details &amp; caption</summary><dl class="campaign-fields"><div><dt>Language</dt><dd>' + esc(slot.language || slot.lang || 'As written · preserved') + '</dd></div><div><dt>Offer</dt><dd>' + esc(offer) + '</dd></div><div><dt>Call to action</dt><dd>' + esc(cta) + (link ? '<br><a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a>' : '<br>Link not specified') + '</dd></div><div><dt>Media · ' + (slot.media || []).length + ' asset(s)</dt>' + (media || '<dd>Not attached</dd>') + '</div><div><dt>Audit</dt><dd>' + esc(slot.audit_status || 'Not audited') + (slot.audit_current === true || slot.audit_current === 1 ? ' · current snapshot' : ' · current audit not verified') + '</dd></div></dl>' + ((slot.blockers || []).length ? '<details><summary>' + slot.blockers.length + ' item(s) to resolve</summary><ul class="campaign-fields">' + slot.blockers.map(function (b) { return '<li>' + esc(typeof b === 'string' ? b : b.message || b.code || JSON.stringify(b)) + '</li>'; }).join('') + '</ul></details>' : '') + '<label class="campaign-edit-label" for="caption-' + key + '">Caption</label><textarea id="caption-' + key + '" data-caption="' + key + '" translate="no" dir="auto" maxlength="2200"' + (!slot.post_id || ['draft', 'failed'].indexOf(slot.post_status) < 0 || ['draft', 'paused'].indexOf(state.cycle.state) < 0 ? ' disabled' : '') + '>' + esc(caption(slot)) + '</textarea><p class="campaign-edit-note">Save changes below. Saving invalidates the previous review; media and scheduling need a fresh review.</p></details></div></article>';
  }
  function renderPosts() {
    var slots = state.cycle.slots || [], filtered = slots.filter(function (s) { return state.filter === 'all' || category(s) === state.filter; });
    var list = document.getElementById('campaign-posts');
    list.className = state.view === 'calendar' ? 'campaign-calendar' : 'campaign-grid';
    var html = '';
    if (state.view === 'calendar') {
      var months = {};
      filtered.forEach(function (s) { var month = String(s.date || '').slice(0, 7); (months[month] = months[month] || []).push(s); });
      Object.keys(months).sort().forEach(function (month) {
        var date = new Date(month + '-01T12:00:00Z');
        html += '<p class="campaign-month-label">' + esc(Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date) : 'Dates to confirm') + '</p>';
        html += ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) { return '<span class="campaign-calendar-head" aria-hidden="true">' + d + '</span>'; }).join('');
        // Keep gaps real even when filtering: dates never slide into the wrong weekday.
        var group = byDate(months[month]), last = 0;
        Object.keys(group).sort().forEach(function (day) {
          var items = group[day], s = items.find(function (slot) { return !/STOR(Y|IES)/i.test(slot.channel + ' ' + slot.media_type); }) || items[0];
          var n = Number(String(s.date).slice(-2)), target = (Number.isFinite(date.getTime()) ? date.getUTCDay() : 0) + n - 1;
          while (last < target) { html += '<span aria-hidden="true"></span>'; last++; }
          html += '<article class="campaign-calendar-day" data-day="' + esc(day) + '"><div class="campaign-visual">' + mediaHtml(s) + '<span class="campaign-day">' + esc(dateLabel(s, true)) + '</span></div><button type="button" class="campaign-button" data-open="' + esc(s.slot_id) + '" aria-label="Review ' + esc(dateLabel(s)) + ', ' + items.length + ' item(s)">' + items.length + ' <span class="campaign-calendar-item-word">item(s)</span></button></article>'; last++;
        });
      });
    } else {
      var days = byDate(filtered);
      html = Object.keys(days).sort().map(function (day) { return '<section class="campaign-day-group" data-day="' + esc(day) + '"><h3 class="campaign-day-heading">' + esc(dateLabel(days[day][0])) + '<span>' + days[day].length + ' item(s)</span></h3><div class="campaign-day-posts">' + days[day].map(card).join('') + '</div></section>'; }).join('');
    }
    list.innerHTML = html || '<p class="campaign-state">No posts in this view.</p>';
    document.getElementById('campaign-result').textContent = filtered.length + ' of ' + slots.length + ' planned items · ' + Object.keys(byDate(slots)).length + ' days · ' + state.cycle.timezone;
    list.querySelectorAll('[data-caption]').forEach(function (input) { input.addEventListener('input', function () {
      var slot = slots.find(function (s) { return s.slot_id === input.dataset.caption; });
      if (input.value === (slot.caption || '')) delete state.edits[slot.slot_id]; else state.edits[slot.slot_id] = input.value;
      input.closest('.campaign-card').querySelector('.campaign-caption').textContent = input.value;
      renderDirty();
    }); });
    list.querySelectorAll('[data-open]').forEach(function (button) { button.addEventListener('click', function () {
      var id = button.dataset.open; state.view = 'list'; setViewButtons(); renderPosts();
      var selected = Array.from(list.querySelectorAll('[data-slot]')).find(function (item) { return item.dataset.slot === id; });
      if (selected) { selected.querySelector('details').open = true; selected.scrollIntoView({ block: 'start' }); selected.focus({ preventScroll: true }); }
    }); });
    list.querySelectorAll('img,video').forEach(function (node) { node.addEventListener('error', function () {
      if (node.parentElement.querySelector('.campaign-media-failure')) return;
      var message = document.createElement('p'); message.className = 'campaign-media-failure'; message.textContent = 'Preview unavailable · review media before approval'; node.parentElement.appendChild(message);
    }); });
    mountMediaEditors();
  }
  function renderDirty() {
    var notice = document.getElementById('campaign-unsaved'); notice.hidden = !dirty();
    notice.textContent = Object.keys(state.edits).length + ' unsaved caption change(s). Save changes before leaving; the saved campaign is unchanged.';
    document.getElementById('campaign-approval').textContent = dirty() ? 'New review required for caption suggestions' : approvalCurrent(state.cycle) ? 'Owner approval recorded for this preview' : 'Owner review required before scheduling';
    syncActions();
  }
  function setViewButtons() { root.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); }); }
  function render() {
    var cycle = state.cycle, slots = cycle.slots || [], c = counts(slots);
    var blockers = [].concat((cycle.validation || {}).errors || [], cycle.blockers || [], cycle.warnings || []);
    var digest = cycle.preview_digest || '';
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '<section class="campaign-summary"><div><h3>' + esc(cycle.title || 'Instagram campaign') + '</h3><p>' + esc(cycle.start_date || '') + ' — ' + esc(cycle.end_date || '') + ' · ' + esc(cycle.timezone || 'Timezone not set') + '</p><p>' + slots.length + ' planned posts · ' + c.scheduled + ' scheduled · ' + c.published + ' published</p></div><div class="campaign-stats" aria-label="Campaign post counts"><div><strong>' + c.ready + '</strong><span>Ready for review</span></div><div><strong>' + c.draft + '</strong><span>Draft</span></div><div><strong>' + c.blocked + '</strong><span>Needs attention</span></div></div></section><div class="campaign-toolbar"><div class="campaign-controls"><label>Campaign<select id="campaign-select">' + state.cycles.map(function (item) { return '<option value="' + esc(item.id) + '"' + (item.id === cycle.id ? ' selected' : '') + '>' + esc(item.title || item.start_date || item.id) + '</option>'; }).join('') + '</select></label><label>Show<select id="campaign-filter"><option value="all">All posts</option><option value="ready">Ready for review</option><option value="draft">Drafts</option><option value="blocked">Needs attention</option><option value="scheduled">Scheduled</option><option value="published">Published</option></select></label></div><div class="campaign-segment" role="group" aria-label="Campaign view"><button type="button" data-view="list" aria-pressed="true">List</button><button type="button" data-view="calendar" aria-pressed="false">Calendar</button></div></div><p id="campaign-unsaved" class="campaign-unsaved" role="status" hidden></p><p id="campaign-result" class="campaign-result" aria-live="polite"></p><div id="campaign-posts"></div><details class="campaign-audit"><summary>Readiness &amp; audit details' + (blockers.length ? ' · ' + blockers.length + ' item(s)' : '') + '</summary><ul><li>Validation: ' + esc((cycle.validation || {}).state || 'Not run') + '.</li><li>Dates marked suggested have not been scheduled.</li>' + blockers.map(function (b) { return '<li>' + esc(typeof b === 'string' ? b : b.detail || b.message || b.code || JSON.stringify(b)) + '</li>'; }).join('') + '<li>Each post must have a current audit and the exact caption, assets, and time reviewed before scheduling.</li></ul></details><section class="campaign-footer"><div><h3 id="campaign-approval">Owner review required before scheduling</h3><p>This screen is a read-only preview. Review the full captions and every media asset, then give explicit approval for this exact version. Scheduling and provider acceptance require separate evidence.</p><p class="campaign-evidence">Preview digest: ' + esc(digest || 'Unavailable · approval cannot be bound') + '</p>' + (approvalCurrent(cycle) ? '<p class="campaign-evidence">Approval record: ' + esc(cycle.approval.id) + ' · owner ' + esc(cycle.approval.owner_id) + ' · ' + esc(new Date(cycle.approval.approved_at).toISOString()) + ' · ' + esc(cycle.approval.review_mode || 'Exact manifest') + '</p>' : '') + '<button type="button" id="campaign-export" class="campaign-button primary">Export review manifest</button></div><div><h3>Next month</h3><p>Start with this month’s results and a fresh offer. The next cycle needs its own draft, media review, and approval.</p><a class="campaign-button" href="/hub/owner/marketing.html#teach-team">Plan with Marketing</a></div></section>';
    document.getElementById('campaign-filter').value = state.filter;
    document.getElementById('campaign-filter').addEventListener('change', function (event) { state.filter = event.target.value; renderPosts(); });
    document.getElementById('campaign-select').addEventListener('change', function (event) { if (dirty()) { event.target.value = cycle.id; say('Export your unsaved caption suggestions before switching campaigns.'); return; } loadCycle(event.target.value); });
    root.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.dataset.view; setViewButtons(); renderPosts(); }); });
    document.getElementById('campaign-export').addEventListener('click', exportManifest);
    buildActions(); setViewButtons(); renderPosts(); renderDirty();
  }
  function canSchedule() {
    return !dirty() && !mediaPending() && !state.busy && !state.loading && !state.needsRefresh && !!state.cycle.preview_digest && ['draft', 'paused'].indexOf(state.cycle.state) >= 0 && (state.cycle.validation || {}).state === 'complete' && (state.readiness.strict_ready === true || state.readiness.owner_review_ready === true);
  }
  function syncActions() {
    var review = document.getElementById('campaign-review'), validate = document.getElementById('campaign-validate'), pause = document.getElementById('campaign-pause');
    if (!review) return;
    var importing = document.getElementById('campaign-import'); if (importing) importing.disabled = state.busy || state.loading || dirty() || mediaPending();
    document.getElementById('campaign-reload').disabled = state.busy || state.loading || mediaPending();
    document.getElementById('campaign-select').disabled = state.busy || state.loading || mediaPending();
    review.disabled = !canSchedule();
    validate.disabled = dirty() || mediaPending() || state.busy || state.needsRefresh || ['draft', 'paused'].indexOf(state.cycle.state) < 0;
    pause.disabled = dirty() || mediaPending() || state.busy || state.needsRefresh || state.cycle.state !== 'scheduled';
    var saving = document.getElementById('campaign-save-captions'); if (saving) saving.disabled = !dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh || ['draft', 'paused'].indexOf(state.cycle.state) < 0;
    var discard = document.getElementById('campaign-discard-edits'); if (discard) { discard.hidden = !dirty(); discard.disabled = state.busy || state.loading || mediaPending(); }
    var next = document.getElementById('campaign-next-create'); if (next) next.disabled = dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh;
    root.querySelectorAll('[data-media-pick]').forEach(function (button) { var slot = state.cycle.slots.find(function (s) { return s.slot_id === button.dataset.mediaPick; }); button.disabled = !mediaEditable(slot) || dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh; button.nextElementSibling.textContent = dirty() ? 'Save caption changes before adding media.' : mediaPending() ? 'Finish or discard the active media selection first.' : state.needsRefresh ? 'Refresh the saved campaign before adding media.' : mediaHint(slot); });
    if (mediaPending()) root.querySelectorAll('[data-caption]').forEach(function (input) { input.disabled = true; });
  }
  function mediaEditable(slot) {
    return !!(slot && slot.post_id && slot.revision_snapshot && ['draft', 'failed'].indexOf(slot.post_status) >= 0 && ['draft', 'paused'].indexOf(state.cycle.state) >= 0);
  }
  function mediaRules(slot) {
    var reel = slot.channel === 'reel', story = slot.channel === 'story';
    return { max: reel || story ? 1 : 10, accept: reel ? 'video/mp4,.mp4' : story ? 'image/jpeg,video/mp4,.jpg,.jpeg,.mp4' : 'image/jpeg,.jpg,.jpeg', text: reel ? 'One MP4 video, up to 25 MB.' : story ? 'One JPEG photo (5 MB) or MP4 video (25 MB).' : 'Up to 10 JPEG photos, 5 MB each. The first photo is the cover.' };
  }
  function mediaHint(slot) {
    if (!slot.post_id) return 'Save the caption draft first.';
    if (slot.post_status === 'published') return 'Published posts cannot be edited here.';
    if (slot.post_status === 'scheduled' || state.cycle.state === 'scheduled') return 'Pause the campaign before changing scheduled media.';
    if (!slot.revision_snapshot) return 'Refresh to load this draft’s current saved revision.';
    return mediaRules(slot).text;
  }
  function fileIssue(slot, files) {
    var rules = mediaRules(slot);
    if (!files.length || files.length > rules.max) return 'Choose ' + (rules.max === 1 ? 'one file' : '1–10 JPEG photos') + ' for this post.';
    for (var i = 0; i < files.length; i++) {
      var file = files[i], jpeg = /\.jpe?g$/i.test(file.name) && (!file.type || file.type === 'image/jpeg'), video = /\.mp4$/i.test(file.name) && (!file.type || file.type === 'video/mp4');
      if (slot.channel === 'reel' && !video) return 'A Reel needs one MP4 video.';
      if (slot.channel === 'feed' && !jpeg) return 'Feed posts accept JPEG photos. Use a Reel slot for video.';
      if (!jpeg && !video) return 'Choose a JPEG photo or MP4 video.';
      if (!file.size || file.size > (video ? 25 : 5) * 1024 * 1024) return file.name + ' exceeds the ' + (video ? '25 MB video' : '5 MB photo') + ' limit or is empty.';
    }
    return '';
  }
  function mountMediaEditors() {
    root.querySelectorAll('[data-slot]').forEach(function (card) {
      var slot = state.cycle.slots.find(function (s) { return s.slot_id === card.dataset.slot; });
      var area = document.createElement('div'); area.className = 'campaign-media-picker';
      area.innerHTML = '<button type="button" class="campaign-button" data-media-pick="' + esc(slot.slot_id) + '">Add / replace media</button><p class="campaign-media-help">' + esc(mediaHint(slot)) + '</p>';
      card.querySelector('details').appendChild(area);
      area.querySelector('button').addEventListener('click', function () { chooseMedia(slot); });
    });
    renderMediaWorkbench(); syncActions();
  }
  function chooseMedia(slot) {
    if (!mediaEditable(slot) || dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh) return;
    var input = document.getElementById('campaign-media-file');
    if (!input) { input = document.createElement('input'); input.id = 'campaign-media-file'; input.type = 'file'; input.hidden = true; document.body.appendChild(input); input.addEventListener('change', selectMediaFiles); }
    input.dataset.slotId = slot.slot_id; input.accept = mediaRules(slot).accept; input.multiple = mediaRules(slot).max > 1; input.value = ''; input.click();
  }
  function selectMediaFiles(event) {
    var input = event.target, slot = state.cycle.slots.find(function (s) { return s.slot_id === input.dataset.slotId; });
    if (dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh || !mediaEditable(slot)) return;
    var files = Array.from(input.files || []); if (!files.length) return;
    var issue = fileIssue(slot, files); if (issue) { say(issue); return; }
    state.mediaDraft = { slotId: slot.slot_id, slotSnapshot: Object.assign({}, slot), postId: slot.post_id, version: state.cycle.version, revision: slot.revision_snapshot, requestId: crypto.randomUUID(), phase: 'selected', message: 'Review the files and their order, then upload. Uploading alone does not attach them.', items: files.map(function (file) { return { file: file, url: URL.createObjectURL(file), uploaded: null }; }) };
    renderMediaWorkbench(); syncActions(); document.getElementById('campaign-media-heading').focus();
  }
  function releaseMediaDraft() {
    if (state.mediaDraft) state.mediaDraft.items.forEach(function (item) { URL.revokeObjectURL(item.url); });
    state.mediaDraft = null;
  }
  function renderMediaWorkbench() {
    var area = document.getElementById('campaign-media-workbench');
    if (!area) { area = document.createElement('section'); area.id = 'campaign-media-workbench'; area.className = 'campaign-media-workbench'; document.getElementById('campaign-posts').before(area); }
    var draft = state.mediaDraft; area.hidden = !draft; if (!draft) { area.innerHTML = ''; return; }
    var current = state.cycle.slots.find(function (s) { return s.slot_id === draft.slotId; }), slot = current || draft.slotSnapshot;
    var editable = mediaEditable(current), ready = draft.phase === 'uploaded' && draft.items.every(function (item) { return item.uploaded; });
    area.innerHTML = '<div class="campaign-media-heading-row"><div><p class="campaign-eyebrow">MEDIA FOR ONE POST</p><h3 id="campaign-media-heading" tabindex="-1">' + esc(dateLabel(slot)) + ' · ' + esc(slot.channel) + '</h3></div><span class="campaign-badge">' + draft.items.length + ' selected</span></div><p class="campaign-media-current-caption" translate="no" dir="auto">' + esc(slot.caption || '') + '</p><ol class="campaign-media-selection">' + draft.items.map(function (item, index) {
      var video = /\.mp4$/i.test(item.file.name);
      return '<li><div class="campaign-media-local-preview">' + (video ? '<video controls playsinline muted preload="metadata" src="' + esc(item.url) + '" aria-label="Selected video ' + (index + 1) + '"></video>' : '<img src="' + esc(item.url) + '" alt="Selected photo ' + (index + 1) + '">') + '</div><div class="campaign-media-file-info"><strong>' + (index + 1) + '. ' + esc(item.file.name) + '</strong><span>' + (item.file.size / (1024 * 1024)).toFixed(2) + ' MB · ' + (item.uploaded ? 'Uploaded, not attached' : 'Local file') + '</span></div><div class="campaign-media-reorder"><button type="button" class="campaign-button" data-media-move="' + index + '" data-direction="-1" aria-label="Move ' + esc(item.file.name) + ' earlier"' + (index === 0 || state.busy || !['selected', 'uploaded'].includes(draft.phase) ? ' disabled' : '') + '>Earlier</button><button type="button" class="campaign-button" data-media-move="' + index + '" data-direction="1" aria-label="Move ' + esc(item.file.name) + ' later"' + (index === draft.items.length - 1 || state.busy || !['selected', 'uploaded'].includes(draft.phase) ? ' disabled' : '') + '>Later</button></div></li>';
    }).join('') + '</ol><p id="campaign-media-status" role="status" aria-live="polite">' + esc(draft.message) + '</p><div class="campaign-media-actions"><button type="button" id="campaign-media-upload" class="campaign-button"' + (draft.phase !== 'selected' || state.busy || dirty() || !editable ? ' disabled' : '') + '>Upload selected files</button><button type="button" id="campaign-media-attach" class="campaign-button primary"' + (!ready || state.busy || dirty() || !editable || state.needsRefresh ? ' disabled' : '') + '>Attach media to this draft</button><button type="button" id="campaign-media-readback" class="campaign-button"' + (!['stale', 'save_unknown', 'upload_unknown', 'upload_failed'].includes(draft.phase) || state.busy ? ' disabled' : '') + '>Refresh saved post</button><button type="button" id="campaign-media-discard" class="campaign-button"' + (state.busy ? ' disabled' : '') + '>Discard selection</button></div><p class="campaign-media-help">Attaching replaces this post’s saved media in the shown order and requires a fresh audit and review. Caption edits stay separate. Discarding does not delete staged uploads.</p>';
    area.querySelectorAll('[data-media-move]').forEach(function (button) { button.addEventListener('click', function () { if (state.busy || !['selected', 'uploaded'].includes(draft.phase)) return; var from = Number(button.dataset.mediaMove), to = from + Number(button.dataset.direction); if (to < 0 || to >= draft.items.length) return; var item = draft.items.splice(from, 1)[0]; draft.items.splice(to, 0, item); draft.requestId = crypto.randomUUID(); renderMediaWorkbench(); }); });
    document.getElementById('campaign-media-upload').addEventListener('click', uploadSelectedMedia);
    document.getElementById('campaign-media-attach').addEventListener('click', attachSelectedMedia);
    document.getElementById('campaign-media-readback').addEventListener('click', refreshMediaPost);
    document.getElementById('campaign-media-discard').addEventListener('click', function () { if (state.busy) return; releaseMediaDraft(); renderPosts(); say('Local selection discarded. Staged uploads were not deleted or attached.'); });
  }
  async function uploadSelectedMedia() {
    var draft = state.mediaDraft, slot = draft && state.cycle.slots.find(function (s) { return s.slot_id === draft.slotId; });
    if (!draft || draft.phase !== 'selected' || state.busy || dirty() || !mediaEditable(slot) || state.needsRefresh) return;
    state.busy = true; draft.phase = 'uploading'; syncActions(); renderMediaWorkbench();
    try {
      for (var i = 0; i < draft.items.length; i++) {
        draft.message = 'Uploading file ' + (i + 1) + ' of ' + draft.items.length + '…'; renderMediaWorkbench();
        var form = new FormData(); form.append('file', draft.items[i].file);
        var response, data;
        try { response = await fetch('/api/hub/owner/social-campaign-media-upload', { method: 'POST', credentials: 'same-origin', body: form }); data = await response.json(); }
        catch (_) { throw { unknown: true, message: 'The upload outcome is unknown. No media attachment was requested. Refresh the saved post before starting a new selection.' }; }
        if (response.status === 401 && Hub.sessionLost) Hub.sessionLost(data && data.error);
        if (!response.ok || !data || !data.ok || !data.media || !data.media.key) throw { unknown: response.status >= 500, message: response.status >= 500 ? 'The upload outcome could not be confirmed.' : response.status === 401 ? 'Sign in again before uploading.' : data && /bytes_mismatch|type_unsupported/.test(data.error || '') ? 'The file could not be verified as a supported JPEG or MP4.' : 'The file could not be uploaded. Check its format and size before choosing again.' };
        draft.items[i].uploaded = data.media;
      }
      draft.phase = 'uploaded'; draft.message = 'Files uploaded. Review the order, then attach them explicitly. The saved post has not changed.';
    } catch (error) { draft.phase = error.unknown ? 'upload_unknown' : 'upload_failed'; draft.message = error.message + ' Uploads will not be retried automatically.'; }
    finally { state.busy = false; renderMediaWorkbench(); syncActions(); }
  }
  async function attachSelectedMedia() {
    var draft = state.mediaDraft, slot = draft && state.cycle.slots.find(function (s) { return s.slot_id === draft.slotId; });
    if (!draft || draft.phase !== 'uploaded' || !draft.items.every(function (item) { return item.uploaded; }) || state.busy || dirty() || !mediaEditable(slot) || state.needsRefresh) return;
    state.busy = true; draft.phase = 'saving'; draft.message = 'Saving this ordered media selection…'; syncActions(); renderMediaWorkbench();
    try {
      var result = await Hub.api(API, { method: 'POST', body: { op: 'save_media', id: state.cycle.id, expected_version: draft.version, request_id: draft.requestId, post_id: draft.postId, expected_revision_snapshot: draft.revision, media_keys: draft.items.map(function (item) { return item.uploaded.key; }) } });
      if (!result || !result.ok) { draft.phase = result && (result._status === 409 || result.review_required) ? 'stale' : 'save_unknown'; draft.message = draft.phase === 'stale' ? 'The saved version changed. Your uploaded files are retained. Refresh the saved post, review it, then choose whether to attach these files.' : 'The save outcome is unknown. Your files are retained. Refresh the saved post before any new save.'; state.needsRefresh = true; return; }
      acceptSavedView(result); releaseMediaDraft(); render(); say('Media saved to this draft. Previous audit, validation, and approval no longer apply; review the new media before scheduling.');
    } catch (_) { draft.phase = 'save_unknown'; draft.message = 'The save outcome is unknown. Refresh the saved post before any new save; files are retained.'; state.needsRefresh = true; }
    finally { state.busy = false; renderMediaWorkbench(); syncActions(); }
  }
  async function refreshMediaPost() {
    var draft = state.mediaDraft; if (!draft || state.busy || dirty()) return;
    state.busy = true; draft.message = 'Reading the current saved post…'; renderMediaWorkbench(); syncActions();
    try {
      var data = await Hub.api(API + '?id=' + encodeURIComponent(state.cycle.id)); acceptSavedView(data); state.needsRefresh = false;
      var slot = state.cycle.slots.find(function (s) { return s.slot_id === draft.slotId; });
      if (!slot) { draft.phase = 'stale'; draft.message = 'This post is no longer in the campaign. Selected files are retained; discard the selection before continuing.'; render(); return; }
      var expected = draft.items.map(function (item) { return item.uploaded && item.uploaded.key; });
      if (expected.every(Boolean) && JSON.stringify((slot.media || []).map(function (m) { return m.key; })) === JSON.stringify(expected)) { releaseMediaDraft(); render(); say('Saved media confirmed from the current readback. No save was retried. A fresh audit and review are required.'); return; }
      if (!mediaEditable(slot)) { draft.phase = 'stale'; draft.message = 'This post is no longer an editable draft. Files are retained; discard this selection, then pause the campaign if applicable.'; }
      else if (draft.items.every(function (item) { return item.uploaded; })) { draft.phase = 'uploaded'; draft.version = state.cycle.version; draft.revision = slot.revision_snapshot; draft.postId = slot.post_id; draft.requestId = crypto.randomUUID(); draft.message = 'Current saved version refreshed. Review the caption and current media on its card. Your selected files are retained; attaching now requires a new explicit click.'; }
      else { draft.message = 'Saved post refreshed. At least one upload is unconfirmed. Discard this selection and choose files again if you want to start a new upload; nothing is retried automatically.'; }
      render();
    } catch (_) { draft.message = 'Could not read the current post. Files remain selected; no upload or save was retried.'; }
    finally { state.busy = false; renderMediaWorkbench(); syncActions(); }
  }
  function buildActions() {
    var validation = state.cycle.validation || {};
    var area = document.createElement('div'); area.className = 'campaign-action-area';
    area.innerHTML = '<p>Asset validation: <strong>' + esc(validation.state || 'Not started') + '</strong> · ' + (Number(validation.cursor) || 0) + ' of ' + (Number(validation.total) || 0) + ' checked</p><div class="campaign-action-buttons"><button type="button" id="campaign-validate" class="campaign-button">' + (validation.state === 'complete' ? 'Recheck assets' : Number(validation.cursor) > 0 ? 'Resume validation' : 'Validate assets') + '</button><button type="button" id="campaign-review" class="campaign-button primary">Review &amp; schedule</button><button type="button" id="campaign-pause" class="campaign-button">Pause campaign</button></div><p id="campaign-action-feedback" role="status" aria-live="polite">Scheduling unlocks after asset validation and a current review. Each validation step checks up to three assets.</p>';
    root.querySelector('.campaign-footer').before(area);
    // Receipt and controls come from the current server snapshot; no checkbox is an approval record.
    root.querySelector('.campaign-footer p').textContent = 'Review the full captions and every media asset, then give explicit approval for this exact version. Scheduling and provider acceptance require separate evidence.';
    document.getElementById('campaign-validate').addEventListener('click', function () { perform('validate', {}); });
    document.getElementById('campaign-pause').addEventListener('click', function () { perform('pause', { request_id: crypto.randomUUID() }); });
    document.getElementById('campaign-review').addEventListener('click', openReview);
    var save = document.createElement('button'); save.id = 'campaign-save-captions'; save.type = 'button'; save.className = 'campaign-button campaign-save'; save.textContent = 'Save caption changes'; save.addEventListener('click', saveCaptions); area.appendChild(save);
    var discard = document.createElement('button'); discard.id = 'campaign-discard-edits'; discard.type = 'button'; discard.className = 'campaign-button campaign-save'; discard.textContent = 'Discard edits & reload saved version'; discard.addEventListener('click', function () { if (state.busy) return; state.edits = {}; state.needsRefresh = false; load(); }); area.appendChild(discard);
    var next = document.createElement('div'); next.className = 'campaign-next-controls'; next.innerHTML = '<label>Next cycle start<input id="campaign-next-date" type="date" required aria-label="Next cycle start"></label><button type="button" id="campaign-next-create" class="campaign-button">Create next draft cycle</button><p>Copies the plan structure only. New copy, media and review are required.</p>'; area.appendChild(next);
    var last = new Date(state.cycle.end_date + 'T12:00:00Z'); if (Number.isFinite(last.getTime())) { last.setUTCDate(last.getUTCDate() + 1); document.getElementById('campaign-next-date').value = last.toISOString().slice(0, 10); }
    document.getElementById('campaign-next-create').addEventListener('click', createNextCycle);
  }
  async function perform(op, extra, feedback) {
    if (state.busy || state.needsRefresh || dirty() || mediaPending()) return;
    if (op === 'approve_schedule' && !canSchedule()) return;
    if (op === 'pause' && state.cycle.state !== 'scheduled') return;
    state.busy = true; syncActions();
    var output = feedback || document.getElementById('campaign-action-feedback');
    output.textContent = op === 'validate' ? 'Checking the next assets…' : op === 'pause' ? 'Pausing remaining campaign posts…' : 'Submitting exact version for owner approval and scheduling…';
    var submit = document.getElementById('campaign-confirm'); if (submit) submit.disabled = true;
    try {
      var data = await Hub.api(API, { method: 'POST', body: Object.assign({ op: op, id: state.cycle.id, expected_version: state.cycle.version }, extra) });
      if (!data || !data.ok) {
        state.needsRefresh = true;
        output.textContent = (data && (data._status === 409 || data.review_required) ? 'Campaign changed. Refresh and review the current version before trying again. ' : 'The action could not be confirmed. Refresh before retrying. ') + (data && data.error || 'The request may have reached the server.');
        return;
      }
      var dialog = document.getElementById('campaign-review-dialog'); if (dialog && dialog.open) dialog.close();
      await loadCycle(state.cycle.id);
      say(op === 'validate' ? 'Validation progress refreshed from the server.' : op === 'pause' ? 'Server reports the campaign paused. Review the updated post statuses.' : 'Server reports the schedule saved. Provider acceptance and publication are not yet verified.');
    } catch (_) {
      state.needsRefresh = true; output.textContent = 'The action could not be confirmed. Refresh before retrying; the server may have received it.';
    } finally { state.busy = false; syncActions(); }
  }
  function openReview() {
    if (!canSchedule()) return;
    var old = document.getElementById('campaign-review-dialog'); if (old) old.remove();
    var dialog = document.createElement('dialog'); dialog.id = 'campaign-review-dialog'; dialog.className = 'campaign-review-dialog'; dialog.setAttribute('aria-labelledby', 'campaign-review-title');
    var cycle = state.cycle, warnings = state.readiness.warnings || [], manual = state.readiness.owner_review_ready === true, strict = state.readiness.strict_ready === true;
    var preview = (cycle.slots || []).map(function (slot) {
      return '<article class="campaign-review-post"><h3>' + esc(dateLabel(slot)) + ' · ' + esc(timeLabel(slot)) + '</h3><p>' + esc(slot.language || 'Language as written') + ' · ' + esc(slot.media_type || 'Format unset') + '</p><div class="campaign-review-media">' + (slot.media || []).map(function (media) {
        var url = safeUrl(media.preview_url); if (!url) return '<p>Media unavailable</p>';
        return isVideo(slot, media) ? '<video src="' + esc(url) + '" controls playsinline preload="none" aria-label="Review video for ' + esc(dateLabel(slot)) + '"></video>' : '<img src="' + esc(url) + '" alt="Campaign image for ' + esc(dateLabel(slot)) + '" loading="eager">';
      }).join('') + '</div><p class="campaign-caption" translate="no" dir="auto">' + esc(slot.caption || '') + '</p><p>Offer: ' + esc(slot.offer || 'Unspecified') + ' · CTA: ' + esc(slot.cta || 'Unspecified') + '</p><p class="campaign-evidence">' + esc(slot.cta_url || 'No CTA link specified') + '</p></article>';
    }).join('');
    dialog.innerHTML = '<div class="campaign-review-header"><div><p class="campaign-eyebrow">EXACT VERSION REVIEW</p><h2 id="campaign-review-title">Review &amp; schedule</h2></div><button type="button" class="campaign-button" id="campaign-review-close">Close</button></div><p>' + esc(cycle.title) + ' · version ' + esc(cycle.version) + ' · ' + esc(cycle.timezone) + '</p><p class="campaign-evidence">' + esc(cycle.preview_digest) + '</p><p>Review every image and watch each video. This approval applies only to the captions, assets, and times below.</p><div>' + preview + '</div><form id="campaign-review-form"><fieldset><legend>Review method</legend><label class="campaign-check"><input type="radio" name="review_mode" value="automated_pass"' + (!strict ? ' disabled' : ' checked') + '> Current automated audits' + (!strict ? ' · unavailable' : '') + '</label><label class="campaign-check"><input type="radio" name="review_mode" value="owner_reviewed_with_warnings"' + (!manual ? ' disabled' : !strict ? ' checked' : '') + '> Owner reviewed media &amp; warnings' + (!manual ? ' · unavailable' : '') + '</label></fieldset><div id="campaign-warning-acks"><h3>Review warnings</h3>' + (warnings.length ? warnings.map(function (warning) { return '<label class="campaign-check"><input type="checkbox" data-warning-id="' + esc(warning.id) + '">' + esc(warning.detail || warning.message || warning.code) + '</label>'; }).join('') : '<p>No warnings returned for this version.</p>') + '</div><label class="campaign-check campaign-exact-check"><input type="checkbox" id="campaign-exact-ack">I reviewed every caption and media asset above, watched each video, and approve this exact version and its dates and times.</label><p id="campaign-review-feedback" role="status" aria-live="polite"></p><button type="submit" id="campaign-confirm" class="campaign-button primary" disabled>Approve this version &amp; schedule</button><p class="campaign-review-note">Approval is recorded only after the server accepts this exact version. It does not prove Instagram delivery.</p></form>';
    document.body.appendChild(dialog);
    document.getElementById('campaign-review-close').addEventListener('click', function () { dialog.close(); });
    var form = document.getElementById('campaign-review-form'), requestId = crypto.randomUUID();
    function sync() {
      var selected = form.querySelector('[name="review_mode"]:checked'), warningMode = selected && selected.value === 'owner_reviewed_with_warnings';
      document.getElementById('campaign-warning-acks').hidden = !warningMode;
      var allWarnings = !warningMode || warnings.every(function (w) { return !!w.id && Array.from(form.querySelectorAll('[data-warning-id]')).some(function (input) { return input.dataset.warningId === w.id && input.checked; }); });
      document.getElementById('campaign-confirm').disabled = state.busy || state.needsRefresh || !selected || !document.getElementById('campaign-exact-ack').checked || !allWarnings;
    }
    form.addEventListener('change', sync);
    form.addEventListener('submit', function (event) {
      event.preventDefault(); sync(); if (document.getElementById('campaign-confirm').disabled) return;
      var mode = form.querySelector('[name="review_mode"]:checked').value;
      perform('approve_schedule', { expected_manifest_hash: cycle.preview_digest, request_id: requestId, review_mode: mode, acknowledge_exact_preview: true, acknowledged_warning_ids: mode === 'owner_reviewed_with_warnings' ? warnings.map(function (w) { return w.id; }) : [] }, document.getElementById('campaign-review-feedback'));
    });
    dialog.showModal(); sync(); document.getElementById('campaign-review-close').focus();
  }
  function acceptSavedView(data) {
    if (!data || !data.ok || !data.campaign || !Array.isArray(data.posts)) throw new Error(data && data.error || 'Save could not be confirmed.');
    state.readiness = data.readiness || {};
    state.cycle = Object.assign({}, data.campaign, { slots: data.posts, preview_digest: data.manifest_hash, blockers: state.readiness.blockers || [], warnings: state.readiness.warnings || [] });
    var index = state.cycles.findIndex(function (c) { return c.id === data.campaign.id; }); if (index < 0) state.cycles.unshift(state.cycle); else state.cycles[index] = state.cycle;
    history.replaceState(null, '', '?id=' + encodeURIComponent(data.campaign.id));
  }
  async function hashText(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }
  async function saveCaptions() {
    if (!dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh || ['draft', 'paused'].indexOf(state.cycle.state) < 0) return;
    var changes = Object.keys(state.edits).map(function (id) { var slot = state.cycle.slots.find(function (s) { return s.slot_id === id; }); return { slot_id: id, post_id: slot && slot.post_id, caption: state.edits[id], expected_revision_snapshot: slot && slot.revision_snapshot }; });
    if (changes.some(function (p) { return !p.post_id || !p.expected_revision_snapshot || !p.caption.trim(); })) { say('Each edit needs a saved draft and its current revision. Refresh before editing missing records.'); return; }
    state.busy = true; syncActions();
    try {
      for (var i = 0; i < changes.length; i += 10) {
        var batch = changes.slice(i, i + 10), version = state.cycle.version;
        var requestId = 'captions_' + await hashText(JSON.stringify([state.cycle.id, version, batch]));
        var data = await Hub.api(API, { method: 'POST', body: { op: 'save_captions', id: state.cycle.id, expected_version: version, request_id: requestId, posts: batch.map(function (p) { return { post_id: p.post_id, caption: p.caption, expected_revision_snapshot: p.expected_revision_snapshot }; }) } });
        acceptSavedView(data); batch.forEach(function (p) { delete state.edits[p.slot_id]; });
      }
      render(); say('Caption changes saved. Previous validation and review no longer apply to the edited version.');
    } catch (error) { state.needsRefresh = true; say('Save outcome needs a fresh readback. Export remaining changes, then refresh before retrying. ' + error.message); }
    finally { state.busy = false; syncActions(); }
  }
  async function createNextCycle() {
    if (dirty() || mediaPending() || state.busy || state.loading || state.needsRefresh) return;
    var input = document.getElementById('campaign-next-date'); if (!input || !input.reportValidity()) return;
    var start = input.value, signature = state.cycle.id + ':' + start;
    if (!state.nextRequest || state.nextRequest.signature !== signature) state.nextRequest = { signature: signature, id: crypto.randomUUID() };
    state.busy = true; syncActions();
    try {
      var data = await Hub.api(API, { method: 'POST', body: { op: 'next_cycle', id: state.cycle.id, start_date: start, request_id: state.nextRequest.id } });
      acceptSavedView(data); state.nextRequest = null; render(); say('New draft cycle saved. It has no copied media, approvals or schedule.');
    } catch (error) { state.needsRefresh = true; say('Next-cycle outcome is unknown. Refresh and check the campaign list before retrying. ' + error.message); }
    finally { state.busy = false; syncActions(); }
  }
  function parseDraftPlan(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.slots) || value.slots.length < 30 || value.slots.length > 180) throw new Error('Choose a 30-day plan with 30–180 slots.');
    var start = value.start_date || value.proposed_start_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || typeof value.title !== 'string' || !value.title.trim()) throw new Error('The plan needs a title and start date.');
    var days = new Set(), ids = new Set();
    var slots = value.slots.map(function (s) {
      if (!s || typeof s.slot_id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(s.slot_id) || ids.has(s.slot_id) || !Number.isInteger(s.day_offset) || s.day_offset < 0 || s.day_offset > 29 || !['feed', 'story', 'reel'].includes(s.channel) || typeof s.caption !== 'string' || !s.caption.trim() || s.caption.length > 2200) throw new Error('Every slot needs a unique ID, day, format and complete caption.');
      days.add(s.day_offset); ids.add(s.slot_id);
      return { slot_id: s.slot_id, day_offset: s.day_offset, time: s.time, channel: s.channel, post_id: null, objective: s.objective, creative_angle: s.creative_angle, offer: s.offer, cta: s.cta, cta_url: s.cta_url || s.canonical_destination, utm_campaign: s.utm_campaign, language: s.language, caption: s.caption };
    });
    if (days.size !== 30) throw new Error('Every one of the 30 days needs at least one slot.');
    return { title: value.title.trim(), start_date: start, slots: slots };
  }
  async function importDraftPlan(file) {
    if (!file || dirty() || mediaPending() || state.busy || state.loading) return;
    if (file.size > 512 * 1024) { say('The JSON plan must be smaller than 512 KB.'); return; }
    var plan, raw;
    try { raw = await file.text(); plan = parseDraftPlan(JSON.parse(raw)); } catch (error) { say('Plan not imported. ' + error.message); return; }
    var old = document.getElementById('campaign-import-dialog'); if (old) old.remove();
    var dialog = document.createElement('dialog'); dialog.id = 'campaign-import-dialog'; dialog.className = 'campaign-review-dialog'; dialog.setAttribute('aria-labelledby', 'campaign-import-title');
    dialog.innerHTML = '<h3 id="campaign-import-title">Save this draft plan?</h3><p class="campaign-import-summary">' + esc(plan.title) + '\n' + esc(plan.start_date) + ' · 30 days · ' + plan.slots.length + ' caption drafts</p><p>Media, approval and schedule values in the file are ignored. This creates private drafts only. If an import stops, select the same unchanged file to resume.</p><div class="campaign-import-choices"><button type="button" id="campaign-import-cancel" class="campaign-button">Cancel</button><button type="button" id="campaign-import-confirm" class="campaign-button primary">Save draft plan</button></div>';
    document.body.appendChild(dialog); dialog.querySelector('#campaign-import-cancel').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('#campaign-import-confirm').addEventListener('click', async function () {
      if (state.busy) return; state.busy = true; syncActions(); this.disabled = true; dialog.querySelector('#campaign-import-cancel').disabled = true;
      try {
        var digest = await hashText(raw), creation = { op: 'create', request_id: 'plan_' + digest, title: plan.title, start_date: plan.start_date, slots: plan.slots.map(function (s) { var copy = Object.assign({}, s); delete copy.caption; return copy; }) };
        acceptSavedView(await Hub.api(API, { method: 'POST', body: creation }));
        var pending = plan.slots.filter(function (s) { var saved = state.cycle.slots.find(function (p) { return p.slot_id === s.slot_id; }); if (saved && saved.post_id && saved.caption !== s.caption) throw new Error('A previously imported caption was changed. Use the current saved campaign instead.'); return !saved || !saved.post_id; });
        for (var i = 0; i < pending.length; i += 10) {
          var batch = pending.slice(i, i + 10).map(function (s) { return { slot_id: s.slot_id, caption: s.caption }; });
          var request = 'stage_' + await hashText(JSON.stringify([digest, batch]));
          acceptSavedView(await Hub.api(API, { method: 'POST', body: { op: 'stage_captions', id: state.cycle.id, expected_version: state.cycle.version, request_id: request, posts: batch } }));
          say('Saving caption drafts: ' + (plan.slots.length - pending.length + Math.min(i + 10, pending.length)) + ' of ' + plan.slots.length + '…');
        }
        dialog.close(); render(); say(plan.slots.length + ' caption drafts saved. Add the finished media before review and scheduling.');
      } catch (error) { dialog.close(); state.needsRefresh = true; if (state.cycle) render(); say('Import stopped safely. Some drafts may already be saved. Refresh, then select the same unchanged file to resume. ' + error.message); }
      finally { state.busy = false; syncActions(); }
    });
    dialog.showModal(); document.getElementById('campaign-import-cancel').focus();
  }
  function exportManifest() {
    var cycle = state.cycle;
    var payload = { kind: 'anejo-campaign-review', exported_at: new Date().toISOString(), cycle_id: cycle.id, version: cycle.version, timezone: cycle.timezone, source_preview_digest: cycle.preview_digest || null, approval: null, caption_suggestions_unsaved: dirty(), requires_new_server_preview: dirty(), slots: (cycle.slots || []).map(function (s) { return Object.assign({}, s, { caption: caption(s) }); }) };
    var url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'anejo-' + String(cycle.id).replace(/[^a-z0-9_-]/gi, '-') + '-review.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say('Review manifest exported. It is not an approval or a scheduled campaign.');
  }
  function error(message) { root.setAttribute('aria-busy', 'false'); root.innerHTML = '<div class="campaign-state" role="alert"><h3>Campaign could not load</h3><p>' + esc(message || 'Try refreshing. Your campaign status has not been verified.') + '</p></div>'; }
  async function loadCycle(id) {
    if (state.loading || dirty() || mediaPending()) return;
    var request = ++state.request; state.loading = true; root.setAttribute('aria-busy', 'true'); document.getElementById('campaign-reload').disabled = true;
    try {
      var data = await Hub.api(API + '?id=' + encodeURIComponent(id));
      if (request !== state.request) return;
      if (!data || !data.ok || !data.campaign || !Array.isArray(data.posts)) { error(data && data.error); return; }
      state.readiness = data.readiness || {}; state.needsRefresh = false;
      state.cycle = Object.assign({}, data.campaign, { slots: data.posts, preview_digest: data.manifest_hash, blockers: state.readiness.blockers || [], warnings: state.readiness.warnings || [] }); if (!state.cycles.some(function (c) { return c.id === data.campaign.id; })) state.cycles.unshift(state.cycle);
      history.replaceState(null, '', '?id=' + encodeURIComponent(data.campaign.id)); render();
    } catch (_) { error(); } finally { state.loading = false; document.getElementById('campaign-reload').disabled = false; syncActions(); }
  }
  async function load() {
    if (state.busy || mediaPending()) return;
    if (dirty()) { say('Export your unsaved caption suggestions before refreshing.'); return; }
    if (state.loading) return;
    root.setAttribute('aria-busy', 'true'); document.getElementById('campaign-reload').disabled = true;
    try {
      var data = await Hub.api(API);
      if (!data || !data.ok || !Array.isArray(data.campaigns)) { error(data && data.error); return; }
      state.cycles = data.campaigns;
      var id = new URLSearchParams(location.search).get('id');
      if (id || data.campaigns.length) { await loadCycle(id || data.campaigns[0].id); return; }
      root.setAttribute('aria-busy', 'false'); root.innerHTML = '<div class="campaign-state"><h3>No campaign has been drafted yet.</h3><p>A saved 30-day plan will appear here with its captions, media, suggested times, and review details.</p><a class="campaign-button" href="/hub/owner/marketing.html#teach-team">Open Marketing</a></div>';
    } catch (_) { error(); } finally { document.getElementById('campaign-reload').disabled = false; }
  }
  document.getElementById('campaign-reload').addEventListener('click', load);
  document.getElementById('campaign-import').addEventListener('click', function () { if (state.busy || dirty()) return; var input = document.getElementById('campaign-plan-file'); input.value = ''; input.click(); });
  document.getElementById('campaign-plan-file').addEventListener('change', function (event) { importDraftPlan(event.target.files[0]); });
  window.addEventListener('beforeunload', function (event) { if (!dirty() && !state.busy && !mediaPending()) return; event.preventDefault(); event.returnValue = ''; });
  // This owner-only guard intentionally matches the campaign API, including cold navigation.
  Owner.init('marketing', load);
  window.CampaignReview = { counts: counts, category: category, safeUrl: safeUrl, approvalCurrent: approvalCurrent, parseDraftPlan: parseDraftPlan, state: state };
})();
