(function () {
  'use strict';
  const api = '/api/hub/owner/social-recurrence';
  const frequencies = {
    daily: ['Every day', 'Todos los días'],
    alternate: ['Every other day', 'Cada dos días'],
    weekdays: ['Every weekday', 'De lunes a viernes'],
    custom: ['Specific weekdays', 'Días específicos'],
  };
  const words = {
    ...frequencies,
    title: ['Recurring Instagram posts', 'Publicaciones recurrentes de Instagram'],
    repeat: ['Repeat schedule', 'Programar repetición'],
    edit: ['Edit schedule', 'Editar programación'],
    timeZone: ['Times are in Eastern Time.', 'Los horarios son de la zona Este.'],
    frequency: ['Repeat', 'Repetición'],
    start: ['Start date', 'Fecha de inicio'],
    time: ['Post at', 'Hora de publicación'],
    end: ['Ends', 'Finaliza'],
    never: ['Never', 'Nunca'],
    until: ['On a date', 'En una fecha'],
    endDate: ['Last date (included)', 'Última fecha (incluida)'],
    pickDays: ['Choose days and times', 'Elige los días y horarios'],
    cancel: ['Cancel', 'Cancelar'],
    save: ['Schedule recurring posts', 'Programar publicaciones recurrentes'],
    saveEdit: ['Save schedule', 'Guardar programación'],
    publishNotice: ['The preview below will publish to Instagram at each scheduled time.', 'La vista previa se publicará en Instagram en cada horario programado.'],
    preview: ['Post preview', 'Vista previa'],
    loadingMedia: ['Loading preview…', 'Cargando vista previa…'],
    photo: ['Post photo', 'Foto de la publicación'],
    video: ['Post video', 'Video de la publicación'],
    story: ['Instagram Story', 'Historia de Instagram'],
    storyNote: ['For Stories, the photo or video is what appears on Instagram. Add any text to the media itself.', 'En las historias, Instagram muestra la foto o el video. Agrega cualquier texto al contenido visual.'],
    pause: ['Pause', 'Pausar'],
    resume: ['Resume', 'Reanudar'],
    stop: ['Stop repeating', 'Dejar de repetir'],
    stopQuestion: ['Stop all future posts in this series?', '¿Detener todas las publicaciones futuras de esta serie?'],
    active: ['Active', 'Activa'],
    paused: ['Paused', 'En pausa'],
    ended: ['Ended', 'Finalizada'],
    stopped: ['Stopped', 'Detenida'],
    next: ['Next post', 'Próxima publicación'],
    last: ['Latest occurrence', 'Última publicación programada'],
    missed: ['Missed slot', 'Horario omitido'],
    publishing: ['Publishing', 'Publicando'],
    published: ['Published', 'Publicada'],
    failed: ['Failed', 'Fallida'],
    empty: ['Choose “Repeat schedule” on a saved post to start a series.', 'Elige “Programar repetición” en una publicación guardada para iniciar una serie.'],
    saved: ['Recurring schedule saved.', 'Se guardó la programación recurrente.'],
    no_future_times: ['Choose a schedule with a future posting time.', 'Elige una programación con una hora de publicación futura.'],
    invalid_rule: ['Check your dates and choose at least one day and time.', 'Revisa las fechas y elige al menos un día y horario.'],
    recurrence_unavailable: ['Recurring schedules are temporarily unavailable. Try again.', 'La programación recurrente no está disponible temporalmente. Inténtalo de nuevo.'],
    post_unavailable: ['Choose a saved draft or an eligible published post.', 'Elige un borrador guardado o una publicación ya publicada que admita repetición.'],
    media_unavailable: ['A saved photo or video could not be loaded. Check the post media.', 'No se pudo cargar una foto o video guardado. Revisa el contenido de la publicación.'],
    media_format: ['Check that the media matches the Instagram format.', 'Verifica que el contenido coincida con el formato de Instagram.'],
    preview_changed: ['The saved post changed. Reopen the preview and review it again.', 'La publicación guardada cambió. Abre la vista previa y revísala de nuevo.'],
    series_exists_or_post_changed: ['This post already has a series or its status changed. Refresh the list.', 'Esta publicación ya tiene una serie o su estado cambió. Actualiza la lista.'],
    series_changed: ['This series changed. Review its current schedule and try again.', 'Esta serie cambió. Revisa el horario actual e inténtalo de nuevo.'],
  };
  const days = [['Sun','Dom'],['Mon','Lun'],['Tue','Mar'],['Wed','Mié'],['Thu','Jue'],['Fri','Vie'],['Sat','Sáb']];
  const weekdays = [1,2,3,4,5,6,0];
  const weekNames = [['Sunday','Domingo'],['Monday','Lunes'],['Tuesday','Martes'],['Wednesday','Miércoles'],['Thursday','Jueves'],['Friday','Viernes'],['Saturday','Sábado']];
  const lang = () => window.AnejoLang?.get() === 'es' ? 1 : 0;
  const t = key => (words[key] || words.recurrence_unavailable)[lang()];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = key => '<span data-repeat-copy="'+key+'">'+escape(t(key))+'</span>';
  const dateTime = at => new Intl.DateTimeFormat(lang() ? 'es-US' : 'en-US', {
    timeZone:'America/New_York',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',
  }).format(at);
  const date = value => new Intl.DateTimeFormat(lang() ? 'es-US' : 'en-US', {
    timeZone:'UTC',year:'numeric',month:'short',day:'numeric',
  }).format(new Date(value+'T00:00:00Z'));
  function easternToday() {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts();
    return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
  }
  function send(body) { return Hub.api(api,{method:'POST',body}); }

  let list = [];
  let section;
  let dialog;
  let busy = false;
  let report = '';
  let listError = '';

  function ruleLabel(rule) {
    const clock = value => {
      const [hour, minute] = value.split(':').map(Number);
      return new Intl.DateTimeFormat(lang() ? 'es-US' : 'en-US', {hour:'numeric',minute:'2-digit',timeZone:'UTC'})
        .format(Date.UTC(2000,0,1,hour,minute));
    };
    const times = rule.frequency === 'custom'
      ? weekdays.filter(day => rule.times[day]).map(day => days[day][lang()] + ' ' + clock(rule.times[day])).join(' · ')
      : t(rule.frequency) + ' · ' + clock(rule.time);
    return times + ' · ' + t('end') + ' ' + (rule.end ? date(rule.end) : t('never').toLowerCase());
  }

  function previewMarkup(snapshot) {
    const media = snapshot.media.map(item => {
      const src = '/api/hub/media/' + item.key.split('/').map(encodeURIComponent).join('/') + '?review_etag=' + encodeURIComponent(item.etag);
      return /\.(mp4|mov)$/i.test(item.key)
        ? '<video controls playsinline preload="metadata" src="'+escape(src)+'" aria-label="'+escape(t('video'))+'" data-repeat-aria="video"></video>'
        : '<img src="'+escape(src)+'" alt="'+escape(t('photo'))+'" data-repeat-alt="photo">';
    }).join('');
    return '<div class="repeat-media">'+media+'</div>' +
      (snapshot.caption ? '<p class="repeat-caption">'+escape(snapshot.caption)+'</p>' : '') +
      (snapshot.type === 'STORIES' ? '<p class="hint">'+copy('storyNote')+'</p>' : '');
  }

  function paint() {
    if (!section?.isConnected) return;
    section.innerHTML = '<h2>'+escape(t('title'))+'</h2><p class="hint">'+escape(t('timeZone'))+'</p>' +
      '<p class="hint" role="status">'+(report ? escape(t(report)) : '')+'</p>' +
      (listError ? '<p class="hint" role="alert">'+escape(t(listError))+'</p>' :
        list.length ? list.map(row => {
          const open = row.status === 'active' || row.status === 'paused';
          const actions = open ? '<div class="acts"><button class="btn ghost" type="button" data-repeat-op="edit">'+escape(t('edit'))+'</button>' +
            '<button class="btn ghost" type="button" data-repeat-op="'+(row.status === 'active' ? 'pause' : 'resume')+'">'+escape(t(row.status === 'active' ? 'pause' : 'resume'))+'</button>' +
            '<button class="btn ghost" type="button" data-repeat-op="stop">'+escape(t('stop'))+'</button></div>' : '';
          return '<article class="post" data-repeat-id="'+escape(row.id)+'"><div class="post-head"><b>'+
            escape(row.snapshot.type === 'STORIES' ? t('story') : (row.snapshot.caption.slice(0,90) || 'Instagram'))+
            '</b><span class="tag">'+escape(t(row.status))+'</span></div><p>'+escape(ruleLabel(row.rule))+'</p>'+
            (row.next_at ? '<p><strong>'+escape(t('next'))+'</strong> · '+escape(dateTime(row.next_at))+'</p>' : '')+
            (row.last_at ? '<p class="hint">'+escape(t('last')+' · '+dateTime(row.last_at)+' · '+t(row.last_status))+'</p>' : '')+
            (row.missed_at && (!row.last_at || row.missed_at > row.last_at) ? '<p class="hint">'+escape(t('missed')+' · '+dateTime(row.missed_at))+'</p>' : '')+
            '<details><summary>'+escape(t('preview'))+'</summary>'+previewMarkup(row.snapshot)+'</details>'+actions+'</article>';
        }).join('') : '<p class="hint">'+escape(t('empty'))+'</p>');
  }

  async function refresh() {
    const target = section;
    if (!target?.isConnected) return;
    const result = await Hub.api(api);
    if (section !== target || !target.isConnected) return;
    listError = result?.ok ? '' : 'recurrence_unavailable';
    if (result?.ok) list = result.series;
    paint();
  }

  function paintDialog() {
    if (!dialog?.open) return;
    for (const node of dialog.querySelectorAll('[data-repeat-copy]')) node.textContent = t(node.dataset.repeatCopy);
    for (const node of dialog.querySelectorAll('[data-repeat-day]')) node.textContent = weekNames[Number(node.dataset.repeatDay)][lang()];
    for (const node of dialog.querySelectorAll('[data-repeat-alt]')) node.alt = t(node.dataset.repeatAlt);
    for (const node of dialog.querySelectorAll('[data-repeat-aria]')) node.setAttribute('aria-label', t(node.dataset.repeatAria));
    dialog.querySelector('[role="alert"]').textContent = dialog.dataset.error ? t(dialog.dataset.error) : '';
  }

  function showEditor({ id, version, snapshot, hash, rule }, trigger) {
    if (dialog?.open) return;
    dialog = document.createElement('dialog');
    dialog.className = 'repeat-dialog';
    dialog.setAttribute('translate','no');
    dialog.setAttribute('aria-labelledby','repeat-editor-title');
    dialog.innerHTML = '<form><h2 id="repeat-editor-title">'+copy(id ? 'edit' : 'repeat')+'</h2><p class="hint">'+copy('timeZone')+'</p>'+
      '<div class="form-row"><label for="repeat-frequency">'+copy('frequency')+'</label><select id="repeat-frequency" name="frequency">'+
      Object.keys(frequencies).map(key => '<option value="'+key+'" data-repeat-copy="'+key+'">'+escape(t(key))+'</option>').join('')+'</select></div>'+
      '<div class="form-two"><div class="form-row"><label for="repeat-start">'+copy('start')+'</label><input id="repeat-start" name="start" type="date" required></div>'+
      '<div class="form-row" data-repeat-time><label for="repeat-time">'+copy('time')+'</label><input id="repeat-time" name="time" type="time"></div></div>'+
      '<fieldset data-repeat-days><legend>'+copy('pickDays')+'</legend>'+weekdays.map(day =>
        '<div class="repeat-day"><label><input type="checkbox" name="day'+day+'"><span id="repeat-day-'+day+'" data-repeat-day="'+day+'">'+weekNames[day][lang()]+'</span></label>'+
      '<input type="time" name="time'+day+'" aria-labelledby="repeat-day-'+day+'"></div>').join('')+'</fieldset>'+
      '<div class="form-two"><div class="form-row"><label for="repeat-end-mode">'+copy('end')+'</label><select id="repeat-end-mode" name="endMode">'+
      '<option value="never" data-repeat-copy="never">'+escape(t('never'))+'</option><option value="until" data-repeat-copy="until">'+escape(t('until'))+'</option></select></div>'+
      '<div class="form-row" data-repeat-end><label for="repeat-end">'+copy('endDate')+'</label><input id="repeat-end" type="date" name="end"></div></div>'+
      '<p class="hint">'+copy('publishNotice')+'</p>'+previewMarkup(snapshot)+'<p class="hint" role="alert"></p>'+
      '<div class="acts"><button class="btn ghost" type="button" data-repeat-cancel>'+copy('cancel')+'</button>'+
      '<button class="btn gold" type="submit">'+copy(id ? 'saveEdit' : 'save')+'</button></div></form>';
    document.body.append(dialog);
    const editor = dialog;
    const form = editor.querySelector('form');
    const fields = form.elements;
    const submit = form.querySelector('[type="submit"]');
    if (!id) {
      submit.disabled = true;
      editor.dataset.error = 'loadingMedia';
      const media = [...editor.querySelectorAll('.repeat-media img,.repeat-media video')];
      function mediaReady() {
        if (media.every(node => node.matches('img') ? node.naturalWidth > 0 : node.readyState > 0)) {
          submit.disabled = false;
          delete editor.dataset.error;
          paintDialog();
        }
      }
      for (const item of media) {
        item.addEventListener(item.matches('img') ? 'load' : 'loadedmetadata',mediaReady);
        item.addEventListener('error',() => { editor.dataset.error = 'media_unavailable'; paintDialog(); });
      }
      mediaReady();
    }
    fields.frequency.value = rule?.frequency || 'daily';
    fields.start.value = rule?.start || easternToday();
    fields.time.value = rule?.time || '09:00';
    fields.endMode.value = rule?.end ? 'until' : 'never';
    fields.end.value = rule?.end || '';
    for (const day of weekdays) {
      fields['day'+day].checked = Boolean(rule?.times?.[day]);
      fields['time'+day].value = rule?.times?.[day] || '09:00';
    }
    function sync() {
      const custom = fields.frequency.value === 'custom';
      form.querySelector('[data-repeat-time]').hidden = custom;
      form.querySelector('[data-repeat-days]').hidden = !custom;
      fields.time.disabled = custom;
      fields.time.required = !custom;
      for (const day of weekdays) {
        fields['time'+day].disabled = !custom || !fields['day'+day].checked;
        fields['time'+day].required = !fields['time'+day].disabled;
      }
      fields.end.disabled = fields.endMode.value === 'never';
      fields.end.required = !fields.end.disabled;
      fields.end.min = fields.start.value;
      form.querySelector('[data-repeat-end]').hidden = fields.end.disabled;
    }
    form.addEventListener('change',sync);
    editor.addEventListener('close',() => { editor.remove(); if (dialog === editor) dialog = null; trigger?.focus(); });
    editor.querySelector('[data-repeat-cancel]').onclick = () => editor.close();
    form.onsubmit = async event => {
      event.preventDefault();
      const recurrence = {frequency:fields.frequency.value,start:fields.start.value,end:fields.end.disabled ? null : fields.end.value};
      if (recurrence.frequency === 'custom') {
        recurrence.times = Object.fromEntries(weekdays.filter(day => fields['day'+day].checked).map(day => [day,fields['time'+day].value]));
      } else recurrence.time = fields.time.value;
      if (submit.disabled) return;
      submit.disabled = true;
      const body = id ? {op:'edit',id,version} : {op:'create',post_id:trigger.dataset.repeatPost,preview_hash:hash};
      try {
        const result = await send({...body,rule:recurrence});
        if (!result?.ok) { editor.dataset.error = result?.error || 'recurrence_unavailable'; paintDialog(); return; }
        editor.close();
        report = 'saved';
        await refresh();
        section?.querySelector('h2')?.scrollIntoView({block:'nearest'});
      } finally { submit.disabled = false; }
    };
    sync();
    editor.showModal();
    paintDialog();
  }

  async function open(postId, trigger) {
    if (dialog?.open || busy) return;
    busy = true;
    trigger.dataset.repeatPost = postId;
    try {
      const result = await Hub.api(api+'?post='+encodeURIComponent(postId));
      if (result?.ok) showEditor(result,trigger);
      else Hub.toast(t(result?.error));
    } finally { busy = false; }
  }

  function mount(node) {
    section = node;
    if (!section) return;
    section.onclick = async event => {
      const button = event.target.closest('[data-repeat-op]');
      if (!button || busy) return;
      const row = list.find(entry => entry.id === button.closest('[data-repeat-id]').dataset.repeatId);
      if (!row) return;
      const op = button.dataset.repeatOp;
      if (op === 'edit') { showEditor(row,button); return; }
      if (op === 'stop' && !window.confirm(t('stopQuestion'))) return;
      busy = true;
      button.disabled = true;
      try {
        const result = await send({op,id:row.id,version:row.version});
        report = result?.ok ? 'saved' : result?.error;
        await refresh();
      } finally { busy = false; button.disabled = false; }
    };
    refresh();
  }

  document.addEventListener('anejo:langchange',() => { paint(); paintDialog(); });
  window.AnejoSocialRecurrence = { mount, open };
})();
