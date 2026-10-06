# Week 1 daily-lunch release packet — October 5, 2026

Status: local code and proposed owner configuration; not deployed and no production configuration modified.

Dayan confirmed October 5 Papa Añejo, October 6 chicken quesadillas, October 7 Chicken Caesar Wrap, October 8 pollito (existing product ID pechuguitas), October 9 fried rice. Supplied Caesar artwork is copied without visual alterations to `/assets/img/daily-lunch/chicken-caesar-wrap.png`. Its description lists pictured ingredients without inventing serving weight or wrap count.

Read-only production evidence: daily config version 1, four historical scheduled dates September 28–October 1, four products, no October 5–9 dates, cutoffs 11:00 and 19:00. `proposed-owner-config.json` is the exact optimistic-version owner-endpoint payload: preserves historical dates/settings/weekday templates, adds Caesar product and five explicitly confirmed dates. Existing weekday templates are retained because this approval concerns Week 1 dates, not every future week. No clinic/contract ordering record is changed.

Release order: ship and verify image/JS asset first; re-read owner config version before saving. If version remains 1, authorized operator may apply the proposed payload via existing owner endpoint. If changed, reconcile without overwriting concurrent dates/settings. Verify version 2 public products and dated meals afterward. This packet does not itself update D1.

At/after October 5 19:00 Eastern, existing rules reject October 6 preorder. UI now keeps tomorrow's meal visible and clearly says preorders are closed; purchase remains blocked until the delivery day. Extending tonight's cutoff or granting late-preorder free delivery requires Dayan's policy decision. No bypass introduced.

Validation: 30 focused daily-lunch/backend/UI tests passed. New cases prove tomorrow is selected after today's cutoff, closed preorder cannot be added, confirmed five dates/image exist, and 19:00 cutoff plus next-day opening remain enforced. Tests use fixtures and VM UI, not a real paid checkout. Actual production/UI/provider acceptance remains pending.
