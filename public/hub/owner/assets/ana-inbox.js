/* Read-only Ana review: loading or refreshing never sends a reply. */
(function () {
  'use strict';
  function add(parent, tag, text) {
    var node = document.createElement(tag);
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }
  var states = {
    sent: 'Provider accepted this reply; recipient delivery or reading is not verified.',
    claimed: 'Send claimed; outcome pending or interrupted. Do not resend.',
    unknown: 'Delivery outcome unknown. Check Instagram before any further reply.',
    failed: 'Attempt failed. No automatic retry; review the recorded error.'
  };
  function render(root, data) {
    root.replaceChildren();
    if (!data || data.ok !== true || !Array.isArray(data.items)) {
      add(root, 'p', 'Inbox unavailable. No empty-queue or delivery status can be verified.');
      return;
    }
    add(root, 'p', 'Saved drafts and reply receipts. This view does not send or enable automatic replies.');
    add(root, 'p', 'Snapshot checked: ' + new Date().toLocaleString() + '. Latest 100 conversations and 200 reply attempts; this is not complete history.');
    if (data.drafts_read_status !== 'available') add(root, 'p', 'Draft lookup unavailable; an empty list does not mean no pending drafts.');
    if (data.escalations_read_status !== 'available') add(root, 'p', 'Escalation lookup unavailable.');
    if (data.reply_attempt_history !== 'available') add(root, 'p', 'Reply receipts unavailable. Delivery cannot be verified here.');
    data.items.forEach(function (thread) {
      var section = add(root, 'section', '');
      add(section, 'h3', thread.username ? '@' + thread.username : thread.subject || 'Instagram conversation');
      add(section, 'p', thread.kind === 'comment' ? 'Public comment' : 'Direct message');
      add(section, 'p', 'Latest inbound: ' + (thread.last_inbound || 'Not recorded'));
      (thread.drafts || []).forEach(function (draft) {
        add(section, 'h4', 'Saved draft — not proof of sending');
        add(section, 'p', draft.body || 'Empty draft');
      });
      (thread.escalations || []).forEach(function (entry) { add(section, 'p', 'Needs review: ' + entry.body); });
      (thread.reply_attempts || []).forEach(function (attempt) {
        add(section, 'p', states[attempt.state] || 'Unrecognized reply state; outcome unverified.');
        add(section, 'p', 'Receipt: ' + attempt.id + ' · ' + (attempt.completed_at || attempt.created_at ? new Date(attempt.completed_at || attempt.created_at).toLocaleString() : 'Time unavailable'));
        if (attempt.provider_message_id) add(section, 'p', 'Provider reference: ' + attempt.provider_message_id);
        if (attempt.error_code) add(section, 'p', 'Recorded error: ' + attempt.error_code);
      });
      var link = add(section, 'a', 'Open conversation');
      link.href = '/hub/comms.html#t=' + encodeURIComponent(thread.id);
    });
    if (!data.items.length) add(root, 'p', 'No Instagram conversations returned in this snapshot.');
  }
  function mount(root) {
    if (!root) return;
    var busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      root.replaceChildren();
      add(root, 'p', 'Loading saved drafts and reply receipts…');
      var data;
      try { data = await Hub.api('/api/hub/owner/social-inbox'); } catch { data = null; }
      render(root, data);
      var refresh = add(root, 'button', 'Refresh saved status');
      refresh.type = 'button';
      refresh.className = 'btn ghost';
      refresh.addEventListener('click', load);
      busy = false;
    }
    return load();
  }
  window.AnejoAnaInbox = { mount: mount, render: render };
})();
