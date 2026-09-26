/* Ana review: refresh and explicit local reconciliation never send a reply. */
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
  function render(root, data, reload) {
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
        if ((attempt.state === 'unknown' || attempt.state === 'claimed') && Number(attempt.has_acceptance_receipt) === 1) {
          add(section, 'p', 'A provider acknowledgment was saved. Check whether local records can be repaired without resending.');
          var recover = add(section, 'button', 'Recover saved acknowledgment');
          recover.type = 'button';
          var note = add(section, 'p', '');
          note.setAttribute('role', 'status');
          recover.addEventListener('click', async function () {
            if (recover.disabled) return;
            recover.disabled = true;
            note.textContent = 'Checking the saved acknowledgment; no reply is being sent…';
            try {
              var result = await Hub.api('/api/hub/owner/social-inbox', {method:'POST',body:{op:'reconcile',thread_id:thread.id,message_id:attempt.message_id,attempt_id:attempt.id}});
              note.textContent = result && result.reconciliation_only === true && result.sent === true
                ? 'Provider acceptance recorded locally. Recipient delivery remains unverified; no reply was resent.'
                : 'Recovery remains unverified. No reply was resent. Refresh saved status before further action.';
            } catch (_) {
              note.textContent = 'Recovery could not be verified. No reply was resent. Refresh saved status before further action.';
            }
            if (reload) await reload();
          });
        }
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
      render(root, data, load);
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
