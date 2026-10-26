/* Owner-only, read-only campaign review. Caption suggestions live in this tab only.
   A downloaded review is never an approval record or a scheduling instruction. */
(function () {
  'use strict';
  var API = '/api/hub/owner/social-campaigns';
  var state = { cycles: [], cycle: null, filter: 'all', view: 'list', edits: {}, loading: false, request: 0 };
  var root = document.getElementById('owner-root');
  var esc = Hub.esc;
  function say(text) { document.getElementById('campaign-feedback').textContent = text; }
  function safeUrl(value) {
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
  function mediaHtml(slot) {
    var first = (slot.media || [])[0], url = first && safeUrl(first.preview_url);
    if (!url) return '<p>Media not attached</p>';
    var video = /VIDEO|REELS/.test(String(slot.media_type || '').toUpperCase());
    return video ? '<video controls muted playsinline preload="metadata" src="' + esc(url) + '" aria-label="Video preview for ' + esc(dateLabel(slot)) + '"></video>' : '<img loading="lazy" src="' + esc(url) + '" alt="' + esc(first.alt || 'Campaign image for ' + dateLabel(slot)) + '">';
  }
  function card(slot) {
    var key = esc(slot.slot_id), kind = category(slot), offer = slot.offer || slot.offer_name || 'Not specified', cta = slot.cta || slot.cta_text || 'Not specified', link = safeUrl(slot.cta_url || slot.cta_link || '');
    var media = (slot.media || []).map(function (m, index) {
      var url = safeUrl(m.preview_url);
      return '<dd>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">View media ' + (index + 1) + '</a>' : 'Media URL unavailable') + '<span class="campaign-evidence">' + esc(m.key || '') + (m.sha256 ? ' · SHA-256 ' + esc(m.sha256) : '') + '</span></dd>';
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
        var group = months[month], last = 0;
        group.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (s) {
          var n = Number(String(s.date).slice(-2)), target = (Number.isFinite(date.getTime()) ? date.getUTCDay() : 0) + n - 1;
          while (last < target) { html += '<span aria-hidden="true"></span>'; last++; }
          html += card(s); last++;
        });
      });
    } else html = filtered.map(card).join('');
    list.innerHTML = html || '<p class="campaign-state">No posts in this view.</p>';
    document.getElementById('campaign-result').textContent = filtered.length + ' of ' + slots.length + ' planned posts · ' + state.cycle.timezone;
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
    document.getElementById('campaign-approval').textContent = dirty() ? 'New review required for caption suggestions' : 'Owner review required before scheduling';
  }
  function setViewButtons() { root.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); }); }
  function render() {
    var cycle = state.cycle, slots = cycle.slots || [], c = counts(slots);
    var blockers = [].concat((cycle.validation || {}).errors || [], cycle.blockers || []);
    var digest = cycle.preview_digest || '';
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = '<section class="campaign-summary"><div><h3>' + esc(cycle.title || 'Instagram campaign') + '</h3><p>' + esc(cycle.start_date || '') + ' — ' + esc(cycle.end_date || '') + ' · ' + esc(cycle.timezone || 'Timezone not set') + '</p><p>' + slots.length + ' planned posts · ' + c.scheduled + ' scheduled · ' + c.published + ' published</p></div><div class="campaign-stats" aria-label="Campaign post counts"><div><strong>' + c.ready + '</strong><span>Ready for review</span></div><div><strong>' + c.draft + '</strong><span>Draft</span></div><div><strong>' + c.blocked + '</strong><span>Needs attention</span></div></div></section><div class="campaign-toolbar"><div class="campaign-controls"><label>Campaign<select id="campaign-select">' + state.cycles.map(function (item) { return '<option value="' + esc(item.id) + '"' + (item.id === cycle.id ? ' selected' : '') + '>' + esc(item.title || item.start_date || item.id) + '</option>'; }).join('') + '</select></label><label>Show<select id="campaign-filter"><option value="all">All posts</option><option value="ready">Ready for review</option><option value="draft">Drafts</option><option value="blocked">Needs attention</option><option value="scheduled">Scheduled</option><option value="published">Published</option></select></label></div><div class="campaign-segment" role="group" aria-label="Campaign view"><button type="button" data-view="list" aria-pressed="true">List</button><button type="button" data-view="calendar" aria-pressed="false">Calendar</button></div></div><p id="campaign-unsaved" class="campaign-unsaved" role="status" hidden></p><p id="campaign-result" class="campaign-result" aria-live="polite"></p><div id="campaign-posts"></div><details class="campaign-audit"><summary>Readiness &amp; audit details' + (blockers.length ? ' · ' + blockers.length + ' item(s)' : '') + '</summary><ul><li>Validation: ' + esc((cycle.validation || {}).state || 'Not run') + '.</li><li>Dates marked suggested have not been scheduled.</li>' + blockers.map(function (b) { return '<li>' + esc(typeof b === 'string' ? b : b.message || b.code || JSON.stringify(b)) + '</li>'; }).join('') + '<li>Each post must have a current audit and the exact caption, assets, and time reviewed before scheduling.</li></ul></details><section class="campaign-footer"><div><h3 id="campaign-approval">Owner review required before scheduling</h3><p>This screen is a read-only preview. Review the full captions and every media asset, then give explicit approval for this exact version. Scheduling and provider acceptance require separate evidence.</p><p class="campaign-evidence">Preview digest: ' + esc(digest || 'Unavailable · approval cannot be bound') + '</p><button type="button" id="campaign-export" class="campaign-button primary">Export review manifest</button></div><div><h3>Next month</h3><p>Start with this month’s results and a fresh offer. The next cycle needs its own draft, media review, and approval.</p><a class="campaign-button" href="/hub/owner/marketing.html#teach-team">Plan with Marketing</a></div></section>';
    document.getElementById('campaign-filter').value = state.filter;
    document.getElementById('campaign-filter').addEventListener('change', function (event) { state.filter = event.target.value; renderPosts(); });
    document.getElementById('campaign-select').addEventListener('change', function (event) { if (dirty()) { event.target.value = cycle.id; say('Export your unsaved caption suggestions before switching campaigns.'); return; } loadCycle(event.target.value); });
    root.querySelectorAll('[data-view]').forEach(function (b) { b.addEventListener('click', function () { state.view = b.dataset.view; setViewButtons(); renderPosts(); }); });
    document.getElementById('campaign-export').addEventListener('click', exportManifest);
    setViewButtons(); renderPosts(); renderDirty();
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
      state.cycle = Object.assign({}, data.campaign, { slots: data.posts, preview_digest: data.manifest_hash, blockers: (data.readiness || {}).blockers || [] }); if (!state.cycles.some(function (c) { return c.id === data.campaign.id; })) state.cycles.unshift(state.cycle);
      history.replaceState(null, '', '?id=' + encodeURIComponent(data.campaign.id)); render();
    } catch (_) { error(); } finally { state.loading = false; document.getElementById('campaign-reload').disabled = false; }
  }
  async function load() {
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
  window.addEventListener('beforeunload', function (event) { if (!dirty()) return; event.preventDefault(); event.returnValue = ''; });
  // This owner-only guard intentionally matches the campaign API, including cold navigation.
  Owner.init('marketing', load);
  window.CampaignReview = { counts: counts, category: category, safeUrl: safeUrl, state: state };
})();
