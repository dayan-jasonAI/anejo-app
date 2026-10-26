/* Owner-only campaign review. Caption suggestions live in this tab only.
   A downloaded review is never an approval record or a scheduling instruction. */
(function () {
  'use strict';
  var API = '/api/hub/owner/social-campaigns';
  var state = { cycles: [], cycle: null, readiness: {}, filter: 'all', view: 'list', edits: {}, loading: false, busy: false, needsRefresh: false, request: 0 };
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
    return '<article class="campaign-card" id="slot-' + key + '" data-slot="' + key + '" tabindex="-1"><div class="campaign-visual">' + mediaHtml(slot) + '<span class="campaign-day">' + esc(dateLabel(slot, true)) + '</span></div><div class="campaign-card-content"><div class="campaign-card-top"><span class="campaign-label">' + esc(slot.channel || 'Instagram') + ' · ' + esc(slot.media_type || 'Format unset') + '</span><span class="campaign-badge ' + (kind === 'blocked' ? 'attention' : /scheduled|published/.test(kind) ? 'live' : '') + '">' + esc(label(slot)) + '</span></div><h3>' + esc(title(slot)) + '</h3><p class="campaign-time">' + esc(dateLabel(slot)) + ' · ' + esc(timeLabel(slot)) + '</p><p class="campaign-caption" translate="no" dir="auto">' + esc(caption(slot) || 'Caption not written yet.') + '</p><button type="button" class="campaign-button campaign-open" data-open="' + key + '">Review post</button><details><summary>Post details &amp; caption</summary><dl class="campaign-fields"><div><dt>Language</dt><dd>' + esc(slot.language || slot.lang || 'As written · preserved') + '</dd></div><div><dt>Offer</dt><dd>' + esc(offer) + '</dd></div><div><dt>Call to action</dt><dd>' + esc(cta) + (link ? '<br><a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a>' : '<br>Link not specified') + '</dd></div><div><dt>Media · ' + (slot.media || []).length + ' asset(s)</dt>' + (media || '<dd>Not attached</dd>') + '</div><div><dt>Audit</dt><dd>' + esc(slot.audit_status || 'Not audited') + (slot.audit_current === true || slot.audit_current === 1 ? ' · current snapshot' : ' · current audit not verified') + '</dd></div></dl>' + ((slot.blockers || []).length ? '<details><summary>' + slot.blockers.length + ' item(s) to resolve</summary><ul class="campaign-fields">' + slot.blockers.map(function (b) { return '<li>' + esc(typeof b === 'string' ? b : b.message || b.code || JSON.stringify(b)) + '</li>'; }).join('') + '</ul></details>' : '') + '<label class="campaign-edit-label" for="caption-' + key + '">Caption suggestion · local only</label><textarea id="caption-' + key + '" data-caption="' + key + '" translate="no" dir="auto" maxlength="2200"' + (!slot.post_id ? ' disabled' : '') + '>' + esc(caption(slot)) + '</textarea><p class="campaign-edit-note">Suggestions are unsaved. Export them for a new review; they do not update or approve this campaign.</p></details></div></article>';
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
  }
  function renderDirty() {
    var notice = document.getElementById('campaign-unsaved'); notice.hidden = !dirty();
    notice.textContent = Object.keys(state.edits).length + ' unsaved caption suggestion(s). Export before leaving; the saved campaign is unchanged.';
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
    return !dirty() && !state.busy && !state.loading && !state.needsRefresh && !!state.cycle.preview_digest && ['draft', 'paused'].indexOf(state.cycle.state) >= 0 && (state.cycle.validation || {}).state === 'complete' && (state.readiness.strict_ready === true || state.readiness.owner_review_ready === true);
  }
  function syncActions() {
    var review = document.getElementById('campaign-review'), validate = document.getElementById('campaign-validate'), pause = document.getElementById('campaign-pause');
    if (!review) return;
    document.getElementById('campaign-reload').disabled = state.busy || state.loading;
    document.getElementById('campaign-select').disabled = state.busy || state.loading;
    review.disabled = !canSchedule();
    validate.disabled = dirty() || state.busy || state.needsRefresh || ['draft', 'paused'].indexOf(state.cycle.state) < 0;
    pause.disabled = dirty() || state.busy || state.needsRefresh || state.cycle.state !== 'scheduled';
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
  }
  async function perform(op, extra, feedback) {
    if (state.busy || state.needsRefresh || dirty()) return;
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
  function exportManifest() {
    var cycle = state.cycle;
    var payload = { kind: 'anejo-campaign-review', exported_at: new Date().toISOString(), cycle_id: cycle.id, version: cycle.version, timezone: cycle.timezone, source_preview_digest: cycle.preview_digest || null, approval: null, caption_suggestions_unsaved: dirty(), requires_new_server_preview: dirty(), slots: (cycle.slots || []).map(function (s) { return Object.assign({}, s, { caption: caption(s) }); }) };
    var url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'anejo-' + String(cycle.id).replace(/[^a-z0-9_-]/gi, '-') + '-review.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say('Review manifest exported. It is not an approval or a scheduled campaign.');
  }
  function error(message) { root.setAttribute('aria-busy', 'false'); root.innerHTML = '<div class="campaign-state" role="alert"><h3>Campaign could not load</h3><p>' + esc(message || 'Try refreshing. Your campaign status has not been verified.') + '</p></div>'; }
  async function loadCycle(id) {
    if (state.loading || dirty()) return;
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
    if (state.busy) return;
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
  window.addEventListener('beforeunload', function (event) { if (!dirty() && !state.busy) return; event.preventDefault(); event.returnValue = ''; });
  // This owner-only guard intentionally matches the campaign API, including cold navigation.
  Owner.init('marketing', load);
  window.CampaignReview = { counts: counts, category: category, safeUrl: safeUrl, approvalCurrent: approvalCurrent, state: state };
})();
