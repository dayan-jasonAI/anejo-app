(function () {
  'use strict';
  var Hub = window.Hub, Kitchen = window.Kitchen;
  var root = document.getElementById('inventory-production');
  if (!root || !Hub || !Kitchen) return;
  var esc = Hub.esc;
  var data = null, inventory = [], owner = false;

  function failText(response, fallback) {
    return (response && response.error) || fallback || 'Could not complete this action.';
  }
  function dateTime(value) {
    if (!value) return '';
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
  }
  function itemById(id) {
    return inventory.find(function (item) { return String(item.id) === String(id); });
  }
  function menuName(id) {
    var item = (data.menu || []).find(function (entry) { return String(entry.id) === String(id); });
    return item ? item.name : id;
  }
  function requirementLabel(requirement) {
    var item = itemById(requirement.inventory_id);
    var name = item ? item.name : requirement.inventory_id;
    var basis = requirement.basis === 'on_hand' ? 'on hand' : requirement.basis === 'count_quantity' ? 'count quantity' : 'total weight (g)';
    return name + ' · ' + basis + (requirement.basis === 'on_hand' ? ' (' + (requirement.unit || (item && item.unit) || 'unit not set') + ')' : '') +
      ' · ' + requirement.per_unit + ' per finished item · ' + requirement.kind;
  }
  function statusPill(label, tone) {
    return '<span class="inv-badge' + (tone ? ' ' + tone : '') + '">' + esc(label) + '</span>';
  }
  function requirementRow(requirement, index) {
    requirement = requirement || {};
    var selectedId = requirement.inventory_id || '';
    var selectedBasis = requirement.basis || '';
    var selectedKind = requirement.kind || '';
    var basisUnit = requirement.unit || '';
    return '<div class="ip-req" data-req-row>' +
      '<div class="inv-field"><label for="ip-item-' + index + '">Inventory item</label><select id="ip-item-' + index + '" data-req-item><option value="">Choose item</option>' +
      inventory.map(function (item) { return '<option value="' + esc(item.id) + '"' + (String(item.id) === String(selectedId) ? ' selected' : '') + '>' + esc(item.name) + (item.unit ? ' · ' + esc(item.unit) : '') + '</option>'; }).join('') + '</select></div>' +
      '<div class="inv-field"><label for="ip-basis-' + index + '">Stock quantity to use</label><select id="ip-basis-' + index + '" data-req-basis><option value="">Choose measure</option>' +
      ['on_hand','count_quantity','total_weight_grams'].map(function (basis) { var label = basis === 'on_hand' ? 'On hand' : basis === 'count_quantity' ? 'Count quantity' : 'Total weight (grams)'; return '<option value="' + basis + '"' + (basis === selectedBasis ? ' selected' : '') + '>' + label + '</option>'; }).join('') + '</select></div>' +
      '<div class="inv-field"><label for="ip-kind-' + index + '">Requirement type</label><select id="ip-kind-' + index + '" data-req-kind><option value="">Choose type</option><option value="ingredient"' + (selectedKind === 'ingredient' ? ' selected' : '') + '>Ingredient</option><option value="packaging"' + (selectedKind === 'packaging' ? ' selected' : '') + '>Packaging</option></select></div>' +
      '<div class="inv-field"><label for="ip-amount-' + index + '">Amount per finished item</label><input id="ip-amount-' + index + '" data-req-amount type="number" min="0.000001" step="any" inputmode="decimal" value="' + (requirement.per_unit == null ? '' : esc(requirement.per_unit)) + '"></div>' +
      '<div class="inv-field ip-unit-field" data-unit-wrap' + (selectedBasis === 'on_hand' ? '' : ' hidden') + '><label for="ip-unit-' + index + '">Exact on-hand unit</label><input id="ip-unit-' + index + '" data-req-unit type="text" maxlength="16" value="' + esc(basisUnit) + '" placeholder="Select item unit exactly"></div>' +
      '<button class="btn ghost ip-remove" type="button" data-remove-req aria-label="Remove requirement ' + (index + 1) + '">Remove</button></div>';
  }
  function policyForm(opportunity) {
    var policy = opportunity && opportunity.policy || null;
    var requirements = policy && Array.isArray(opportunity.requirements) ? opportunity.requirements : [];
    var menuId = policy && policy.menu_item_id || (opportunity && opportunity.menu_item_id) || '';
    var recipeId = policy && policy.recipe_id || '';
    var isEditing = !!policy;
    var publishedRecipes = (data.recipes || []).filter(function (recipe) { return recipe.status === 'published'; });
    return '<form class="ip-policy" data-policy-form data-menu-id="' + esc(menuId) + '">' +
      '<div class="ip-form-head"><h3>' + (isEditing ? 'Review production plan' : 'Create production plan') + '</h3><p>Enter and confirm actual recipe quantities and packaging for one finished item. A photo does not set these amounts.</p></div>' +
      '<div class="ip-grid">' +
      '<div class="inv-field"><label for="ip-menu">Menu item</label><select id="ip-menu" data-policy-menu><option value="">Choose menu item</option>' + (data.menu || []).map(function (item) { return '<option value="' + esc(item.id) + '"' + (String(item.id) === String(menuId) ? ' selected' : '') + '>' + esc(item.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="inv-field"><label for="ip-recipe">Published recipe</label><select id="ip-recipe" data-policy-recipe><option value="">Choose published recipe</option>' + publishedRecipes.map(function (recipe) { return '<option value="' + esc(recipe.id) + '"' + (String(recipe.id) === String(recipeId) ? ' selected' : '') + '>' + esc(recipe.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ip-requirements-head"><div><h4>Ingredient and packaging amounts</h4><p>Add at least one of each. Values are required and have no suggested quantity.</p></div><button class="btn ghost" type="button" data-add-req>Add requirement</button></div>' +
      '<div class="ip-requirements" data-requirements>' + requirements.map(requirementRow).join('') + '</div>' +
      '<div class="ip-grid ip-numbers">' +
      '<div class="inv-field"><label for="ip-target">Finished-item target</label><input id="ip-target" data-policy-target type="number" min="1" max="9999" step="1" inputmode="numeric" value="' + (policy ? esc(policy.target_count) : '') + '"></div>' +
      '<div class="inv-field"><label for="ip-min">Minimum batch</label><input id="ip-min" data-policy-min type="number" min="1" max="9999" step="1" inputmode="numeric" value="' + (policy ? esc(policy.min_batch) : '') + '"></div>' +
      '<div class="inv-field"><label for="ip-max">Maximum batch</label><input id="ip-max" data-policy-max type="number" min="1" max="9999" step="1" inputmode="numeric" value="' + (policy ? esc(policy.max_batch) : '') + '"></div>' +
      '<div class="inv-field"><label for="ip-fresh">Stock count freshness (hours)</label><input id="ip-fresh" data-policy-fresh type="number" min="1" max="168" step="1" inputmode="numeric" value="' + (policy ? esc(policy.stock_max_age_hours) : '') + '"></div>' +
      '<div class="inv-field"><label for="ip-assignee">Assign kitchen staff (optional)</label><select id="ip-assignee" data-policy-assignee><option value="">No specific assignee</option>' + (data.staff || []).map(function (staff) { return '<option value="' + esc(staff.id) + '"' + (policy && String(policy.assigned_staff_id || '') === String(staff.id) ? ' selected' : '') + '>' + esc(staff.name || staff.id) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ip-toggles"><label><input data-policy-enabled type="checkbox"' + (policy && !!policy.enabled ? ' checked' : '') + '> Allow this reviewed plan to queue eligible production work</label>' +
      '<label><input data-policy-relist type="checkbox"' + (policy && !!policy.auto_relist ? ' checked' : '') + '> Relist the menu item after a completed batch</label></div>' +
      '<label class="ip-confirm"><input data-policy-confirm type="checkbox"> I reviewed the recipe, packaging, exact units, current count basis, target, and batch limits.</label>' +
      '<div class="inv-status" data-policy-status role="status" aria-live="polite"></div>' +
      '<div class="ip-actions"><button class="btn gold" type="submit">Save reviewed plan</button>' + (isEditing ? '<button class="btn ghost" type="button" data-cancel-editor>Close editor</button>' : '') + '</div>' +
      '<input type="hidden" data-policy-revision value="' + (policy ? esc(policy.revision) : '') + '"></form>';
  }
  function renderOpportunity(opportunity) {
    var reasons = Array.isArray(opportunity.reasons) ? opportunity.reasons : [];
    var allowed = owner;
    var label = !opportunity.eligible ? 'Needs attention' : opportunity.enabled ? 'Ready to queue' : 'Eligible · plan off';
    return '<article class="card ip-opportunity"><div class="ip-op-head"><div><h3>' + esc(opportunity.name || menuName(opportunity.menu_item_id)) + '</h3><p>Suggested batch: ' + esc(opportunity.qty == null ? 'Unavailable' : opportunity.qty) + ' · ' + (opportunity.enabled ? 'Plan enabled' : 'Plan off') + '</p></div>' + statusPill(label, opportunity.eligible && opportunity.enabled ? '' : 'warn') + '</div>' +
      (reasons.length ? '<ul class="ip-reasons">' + reasons.map(function (reason) { return '<li>' + esc(reason) + '</li>'; }).join('') + '</ul>' : '<p class="ip-clear">' + (opportunity.enabled ? 'Fresh stock, recipe, and target checks allow this batch.' : 'Stock checks pass; this plan remains off until an owner enables it.') + '</p>') +
      '<details class="ip-detail"><summary>Reviewed requirements and stock basis</summary><ul>' + (opportunity.requirements || []).map(function (r) { var stock = (opportunity.stock || []).find(function (s) { return String(s.id) === String(r.inventory_id); }); return '<li>' + esc(requirementLabel(r)) + (stock ? ' · available ' + esc(stock.available) + ' · counted ' + esc(dateTime(stock.counted_at)) + (stock.expires_on ? ' · expires ' + esc(stock.expires_on) : '') : '') + '</li>'; }).join('') + '</ul></details>' +
      (allowed ? '<div class="ip-actions">' + (opportunity.eligible && Number(opportunity.qty) > 0 ? '<button class="btn gold" type="button" data-queue-one="' + esc(opportunity.menu_item_id) + '">Approve this batch</button>' : '') + '<button class="btn ghost" type="button" data-edit-policy="' + esc(opportunity.menu_item_id) + '">Review plan</button></div>' : '') + '</article>';
  }
  function taskCard(task) {
    var state = task.status === 'queued' ? 'Queued · stock reserved for planning' : task.status === 'preparing' ? 'Preparing · stock still reserved' : String(task.status || 'Status unavailable');
    var details = task.requirements || [];
    if (!details.length && task.requirements_json) { try { details = JSON.parse(task.requirements_json); } catch (_) { details = []; } }
    var result = '<article class="card ip-task"><div class="ip-task-top"><div><h3>' + esc(menuName(task.menu_item_id)) + '</h3><p>' + esc(state) + ' · planned ' + esc(task.qty) + '</p></div>' + statusPill(task.status || 'unknown', task.status === 'preparing' ? 'warn' : '') + '</div>' +
      '<p class="ip-task-note">A reservation is a planning record. Stock is not consumed and finished food is not counted until completion is recorded.</p>' +
      (task.status === 'completed' ? '<p class="ip-small">Recorded yield: ' + esc(task.actual_qty == null ? 'Unavailable' : task.actual_qty) + (task.note ? ' · ' + esc(task.note) : '') + (task.completed_at ? ' · ' + esc(dateTime(task.completed_at)) : '') + '</p>' : '') +
      (task.assigned_staff_id ? '<p class="ip-small">Assigned staff: ' + esc((data.staff || []).find(function (s) { return String(s.id) === String(task.assigned_staff_id); })?.name || task.assigned_staff_id) + '</p>' : '') +
      '<details class="ip-detail"><summary>Reserved requirements</summary><ul>' + details.map(function (r) { return '<li>' + esc(requirementLabel(r)) + '</li>'; }).join('') + '</ul></details>';
    if (task.status === 'queued') {
      result += '<div class="ip-actions"><button class="btn gold" type="button" data-task-action="start" data-task-id="' + esc(task.id) + '" data-version="' + esc(task.version) + '">Start production</button>' +
        (owner ? '<button class="btn ghost" type="button" data-task-action="cancel" data-task-id="' + esc(task.id) + '" data-version="' + esc(task.version) + '">Cancel reservation</button>' : '') + '</div>';
    } else if (task.status === 'preparing') {
      result += '<form class="ip-complete" data-complete-form data-task-id="' + esc(task.id) + '" data-version="' + esc(task.version) + '">' +
        '<div class="ip-grid"><div class="inv-field"><label for="ip-yield-' + esc(task.id) + '">Actual finished quantity</label><input id="ip-yield-' + esc(task.id) + '" type="number" min="0" max="' + esc(task.qty) + '" step="1" inputmode="numeric" data-actual-qty required></div>' +
        '<div class="inv-field"><label for="ip-note-' + esc(task.id) + '">Shortfall or completion note</label><textarea id="ip-note-' + esc(task.id) + '" data-task-note maxlength="1000" rows="2" placeholder="Required when yield is below plan"></textarea></div></div>' +
        '<p class="ip-small">Ingredient amounts are reserved for the planned batch. Any shortfall must be explained.</p><div class="inv-status" data-task-status role="status" aria-live="polite"></div><button class="btn gold" type="submit">Record completion</button></form>';
    }
    result += '</article>';
    return result;
  }
  function editorFor(menuId) {
    var opportunity = (data.opportunities || []).find(function (o) { return String(o.menu_item_id) === String(menuId); });
    if (!opportunity) opportunity = { menu_item_id:menuId, policy:null, requirements:[] };
    return policyForm(opportunity);
  }
  function render() {
    var policies = Array.isArray(data.policies) ? data.policies : [];
    var opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
    var tasks = Array.isArray(data.tasks) ? data.tasks : [];
    var recent = Array.isArray(data.recent_tasks) ? data.recent_tasks : [];
    root.innerHTML = '<section class="ip-panel" aria-labelledby="ip-title"><div class="ip-panel-head"><div><h2 id="ip-title">Production planning</h2><p>Owner-reviewed recipes turn fresh, explicitly counted stock into a queued kitchen task.</p></div>' +
      (owner ? '<div class="ip-header-actions"><button class="btn ghost" type="button" data-new-policy>Set up a plan</button><button class="btn gold" type="button" data-reconcile>Check stock and queue eligible work</button></div>' : '') + '</div>' +
      (owner ? '<p class="ip-caution">Plans start disabled. Review real ingredient and packaging quantities before enabling any plan. A queued reservation is not a finished item.</p>' : '<p class="ip-caution">Production plans are reviewed and enabled by an owner. You can work queued kitchen tasks below.</p>') +
      (owner ? '<div data-editor-host></div>' : '') +
      '<div class="ip-section-head"><h3>Open kitchen tasks</h3><span>' + tasks.length + '</span></div>' +
      (tasks.length ? '<div class="ip-stack">' + tasks.map(taskCard).join('') + '</div>' : '<div class="hub-empty">No open production tasks.</div>') +
      (recent.length ? '<details class="ip-plans"><summary>Recent completed or cancelled batches (' + recent.length + ')</summary><div class="ip-stack">' + recent.map(taskCard).join('') + '</div></details>' : '') +
      '<div class="ip-section-head"><h3>Production opportunities</h3><span>' + opportunities.length + '</span></div>' +
      (opportunities.length ? '<div class="ip-stack">' + opportunities.map(renderOpportunity).join('') + '</div>' : '<div class="hub-empty">No reviewed production plans yet.</div>') +
      (policies.length && owner ? '<details class="ip-plans"><summary>Saved plans (' + policies.length + ')</summary><ul>' + policies.map(function (p) { return '<li>' + esc(menuName(p.menu_item_id)) + ' · ' + (p.enabled ? 'enabled' : 'off') + ' · revision ' + esc(p.revision) + '</li>'; }).join('') + '</ul></details>' : '') +
      '<div class="inv-status" data-ip-status role="status" aria-live="polite"></div></section>';
    bind();
  }
  function load() {
    root.innerHTML = '<div class="hub-loading">Loading production plans, recipes, and tasks…</div>';
    Promise.all([Kitchen.get('/api/hub/kitchen/inventory-production'), Kitchen.get('/api/hub/kitchen/inventory')]).then(function (responses) {
      var production = responses[0], stock = responses[1];
      if (!production || production.error || production._networkError || production._status || !Array.isArray(production.opportunities) || !Array.isArray(production.tasks) || !Array.isArray(production.menu) || !Array.isArray(production.recipes) || !Array.isArray(production.policies) || !Array.isArray(production.staff)) {
        root.innerHTML = '<div class="hub-empty inv-error" role="alert">' + esc(failText(production, 'Production status could not be loaded.')) + ' Saved inventory remains unchanged.</div>'; return;
      }
      if (!stock || stock.error || stock._networkError || stock._status || !Array.isArray(stock.items)) {
        root.innerHTML = '<div class="hub-empty inv-error" role="alert">' + esc(failText(stock, 'Inventory picker could not be loaded.')) + ' Production policy editing is unavailable.</div>'; return;
      }
      data = production; inventory = stock.items; owner = production.actor_role === 'owner'; render();
    });
  }
  function bind() {
    var newButton = root.querySelector('[data-new-policy]');
    if (newButton) newButton.addEventListener('click', function () {
      var host = root.querySelector('[data-editor-host]');
      host.innerHTML = policyForm({ menu_item_id:'', policy:null, requirements:[] });
      host.scrollIntoView({ behavior:'smooth', block:'start' }); bindEditor(host.querySelector('[data-policy-form]'));
    });
    var reconcileButton = root.querySelector('[data-reconcile]');
    if (reconcileButton) reconcileButton.addEventListener('click', function () {
      reconcileButton.disabled=true;
      var status=root.querySelector('[data-ip-status]'); status.textContent='Checking freshness, stock, and reservations…';
      Kitchen.post('/api/hub/kitchen/inventory-production',{action:'reconcile'}).then(function (response) {
        if (response && response.ok) { var count=(response.created || []).length; status.textContent=count ? count + ' eligible batch task(s) queued.' : 'No eligible batches were queued.'; load(); }
        else { reconcileButton.disabled=false; status.textContent=failText(response,'Could not check production eligibility.'); status.classList.add('inv-error'); }
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-edit-policy]'), function (button) {
      button.addEventListener('click', function () {
        var host = root.querySelector('[data-editor-host]');
        host.innerHTML = editorFor(button.getAttribute('data-edit-policy'));
        host.scrollIntoView({ behavior:'smooth', block:'start' }); bindEditor(host.querySelector('[data-policy-form]'));
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-queue-one]'), function (button) {
      button.addEventListener('click', function () {
        button.disabled=true;
        Kitchen.post('/api/hub/kitchen/inventory-production',{action:'queue',menu_item_id:button.getAttribute('data-queue-one')}).then(function (response) {
          if (response && response.ok) load();
          else { button.disabled=false; var status=root.querySelector('[data-ip-status]'); if(status){status.textContent=failText(response,'This batch was not queued. Refresh stock and review the plan.');status.classList.add('inv-error');} }
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-task-action]'), function (button) {
      button.addEventListener('click', function () { taskAction(button); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-complete-form]'), function (form) {
      form.addEventListener('submit', function (event) { event.preventDefault(); completeTask(form); });
    });
  }
  function bindEditor(form) {
    if (!form) return;
    var rows = form.querySelector('[data-requirements]');
    form.querySelector('[data-add-req]').addEventListener('click', function () {
      rows.insertAdjacentHTML('beforeend', requirementRow(null, rows.querySelectorAll('[data-req-row]').length));
      bindRequirementRows(form);
    });
    var close = form.querySelector('[data-cancel-editor]');
    if (close) close.addEventListener('click', function () { form.remove(); });
    bindRequirementRows(form);
    form.addEventListener('submit', function (event) { event.preventDefault(); savePolicy(form); });
  }
  function bindRequirementRows(form) {
    Array.prototype.forEach.call(form.querySelectorAll('[data-req-row]'), function (row) {
      var basis = row.querySelector('[data-req-basis]'), wrap = row.querySelector('[data-unit-wrap]'), unit = row.querySelector('[data-req-unit]'), itemSelect = row.querySelector('[data-req-item]');
      function updateBasis() {
        var needsUnit = basis.value === 'on_hand'; wrap.hidden = !needsUnit;
        if (needsUnit && itemSelect.value) { var selected = itemById(itemSelect.value); unit.value = selected && selected.unit ? selected.unit : ''; }
      }
      basis.addEventListener('change', updateBasis); itemSelect.addEventListener('change', updateBasis); updateBasis();
      row.querySelector('[data-remove-req]').addEventListener('click', function () { row.remove(); });
    });
  }
  function collectRequirements(form) {
    var selected = [], rows = form.querySelectorAll('[data-req-row]');
    Array.prototype.forEach.call(rows, function (row) {
      selected.push({ inventory_id:row.querySelector('[data-req-item]').value, basis:row.querySelector('[data-req-basis]').value,
        kind:row.querySelector('[data-req-kind]').value, per_unit:row.querySelector('[data-req-amount]').value === '' ? null : Number(row.querySelector('[data-req-amount]').value),
        unit:row.querySelector('[data-req-unit]').value.trim() });
    });
    var seen = {};
    for (var i=0;i<selected.length;i++) {
      var r=selected[i];
      if (!r.inventory_id || !r.basis || !r.kind || !Number.isFinite(r.per_unit) || r.per_unit <= 0) return { error:'Complete every requirement with an item, stock basis, type, and positive amount.' };
      if (seen[r.inventory_id]) return { error:'Use each inventory item only once in this plan.' };
      seen[r.inventory_id]=true;
      if (r.basis === 'on_hand') {
        var item=itemById(r.inventory_id);
        if (!r.unit || !item || r.unit !== String(item.unit || '')) return { error:'The on-hand unit must exactly match the selected inventory item.' };
      } else r.unit = null;
    }
    if (selected.length < 2 || !selected.some(function (r) { return r.kind === 'ingredient'; }) || !selected.some(function (r) { return r.kind === 'packaging'; })) return { error:'Add at least one ingredient and one packaging requirement.' };
    return { requirements:selected };
  }
  function integer(form, selector, label, max) {
    var raw=form.querySelector(selector).value, value=Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < 1 || value > max) return { error:label + ' must be a whole number from 1 to ' + max + '.' };
    return { value:value };
  }
  function savePolicy(form) {
    var status=form.querySelector('[data-policy-status]');
    var menu=form.querySelector('[data-policy-menu]').value, recipe=form.querySelector('[data-policy-recipe]').value;
    if (!menu || !recipe) { status.textContent='Choose a menu item and a published recipe.'; status.classList.add('inv-error'); return; }
    var req=collectRequirements(form); if (req.error) { status.textContent=req.error; status.classList.add('inv-error'); return; }
    var target=integer(form,'[data-policy-target]','Target',9999), min=integer(form,'[data-policy-min]','Minimum batch',9999), max=integer(form,'[data-policy-max]','Maximum batch',9999), freshness=integer(form,'[data-policy-fresh]','Freshness window',168);
    var problem=target.error||min.error||max.error||freshness.error;
    if (!problem && (min.value > max.value || max.value > target.value)) problem='Use minimum batch ≤ maximum batch ≤ target.';
    if (problem) { status.textContent=problem; status.classList.add('inv-error'); return; }
    if (!form.querySelector('[data-policy-confirm]').checked) { status.textContent='Review the quantities and check the confirmation before saving.'; status.classList.add('inv-error'); form.querySelector('[data-policy-confirm]').focus(); return; }
    var button=form.querySelector('[type="submit"]'); button.disabled=true; status.classList.remove('inv-error'); status.textContent='Saving owner-reviewed plan…';
    var body={action:'policy',reviewed:true,menu_item_id:menu,recipe_id:recipe,requirements:req.requirements,target_count:target.value,min_batch:min.value,max_batch:max.value,stock_max_age_hours:freshness.value,
      assigned_staff_id:form.querySelector('[data-policy-assignee]').value||null,enabled:form.querySelector('[data-policy-enabled]').checked,auto_relist:form.querySelector('[data-policy-relist]').checked};
    var revision=form.querySelector('[data-policy-revision]').value; if (revision) body.expected_revision=Number(revision);
    Kitchen.post('/api/hub/kitchen/inventory-production',body).then(function (response) {
      button.disabled=false;
      if (response && response.ok) { status.textContent='Plan saved and review recorded. Refreshing opportunities…'; load(); }
      else { status.textContent=failText(response,'The plan was not saved.'); status.classList.add('inv-error'); }
    });
  }
  function taskAction(button) {
    var action=button.getAttribute('data-task-action');
    if (action==='cancel' && !window.confirm('Cancel this queued reservation? No stock has been consumed.')) return;
    button.disabled=true;
    Kitchen.post('/api/hub/kitchen/inventory-production',{action:action,id:button.getAttribute('data-task-id'),expected_version:Number(button.getAttribute('data-version'))}).then(function (response) {
      if (response && response.ok) load();
      else { button.disabled=false; var status=root.querySelector('[data-ip-status]'); if(status){status.textContent=failText(response);status.classList.add('inv-error');} }
    });
  }
  function completeTask(form) {
    var qtyField=form.querySelector('[data-actual-qty]'), qtyRaw=qtyField.value, qty=Number(qtyRaw), note=form.querySelector('[data-task-note]').value.trim(), status=form.querySelector('[data-task-status]');
    var planned=Number(qtyField.max);
    if (qtyRaw === '' || !Number.isInteger(qty) || qty<0 || qty>planned) { qtyField.focus(); status.textContent='Enter a whole finished quantity between zero and ' + planned + '.'; status.classList.add('inv-error'); return; }
    if (qty<planned && !note) { form.querySelector('[data-task-note]').focus(); status.textContent='Explain the shortfall before recording completion.'; status.classList.add('inv-error'); return; }
    var button=form.querySelector('[type="submit"]'); button.disabled=true; status.classList.remove('inv-error'); status.textContent='Recording completed yield and stock use…';
    Kitchen.post('/api/hub/kitchen/inventory-production',{action:'complete',id:form.getAttribute('data-task-id'),expected_version:Number(form.getAttribute('data-version')),actual_qty:qty,note:note}).then(function (response) {
      if (response && response.ok) { status.textContent='Completion recorded.'; document.dispatchEvent(new CustomEvent('inventory:refresh')); }
      else { button.disabled=false; status.textContent=failText(response,'Completion was not recorded.'); status.classList.add('inv-error'); }
    });
  }
  document.addEventListener('inventory:changed', load);
  load();
})();
