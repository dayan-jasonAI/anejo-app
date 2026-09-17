/* Reference-based photo polish: preview and explicit selection, never a post mutation. */
(function () {
  'use strict';
  function t(en, es) { return window.AnejoLang && window.AnejoLang.get() === 'es' ? es : en; }
  function node(tag, text) { var n = document.createElement(tag); if (text) n.textContent = text; return n; }
  window.MarketingPhotoEnhance = {
    open: function (options) {
      var photo = options.photo, opener = document.activeElement;
      var dialog = node('dialog'); dialog.className = 'marketing-photo-enhance';
      var title = node('h2', t('Polish your real photo', 'Mejora tu foto real')); title.id = 'photo-polish-title'; dialog.setAttribute('aria-labelledby', title.id);
      var note = node('p', t('Improve lighting, color and clarity while keeping the food, portions, packaging and event setting. AI can alter details: compare both images before using a copy.', 'Mejora luz, color y claridad conservando comida, porciones, empaque y entorno. La IA puede alterar detalles: compara ambas imágenes antes de usar una copia.'));
      var compare = node('div'); compare.className = 'photo-polish-compare';
      function frame(label, src) { var f = node('figure'); var img = node('img'); img.src = src; img.alt = label; f.append(img,node('figcaption',label)); return f; }
      var original = frame(t('Original — preserved', 'Original — conservado'),photo.url); compare.append(original);
      var label = node('label',t('Finish', 'Acabado')); var preset = node('select'); preset.setAttribute('aria-label',t('Photo finish','Acabado de foto'));
      [['natural','Natural polish / Mejora natural'],['bright','Bright and clean / Luminoso y limpio'],['warm','Warm editorial / Editorial cálido']].forEach(function (p) { var o=node('option',p[1]); o.value=p[0]; preset.append(o); }); label.append(preset);
      var status = node('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
      var generate=node('button',t('Generate a preview','Generar vista previa')); generate.type='button'; generate.className='btn gold';
      var budget=node('p',t('Uses the existing AI budget. Saves a separate AI-enhanced copy in Photos; never changes the original or publishes a post. JPEG, PNG and WebP photos only; camera RAW/HEIC are not supported.', 'Usa el presupuesto de IA. Guarda una copia mejorada con IA en Fotos; nunca cambia el original ni publica. Solo JPEG, PNG y WebP; RAW/HEIC no compatibles.')); budget.className='hint';
      var review=node('label'); review.hidden=true; var checkbox=node('input'); checkbox.type='checkbox'; review.append(checkbox,document.createTextNode(t(' I checked the food, quantities, packaging and printed text against the original.', ' Comparé comida, cantidades, empaque y textos impresos con el original.')));
      var use=node('button',t('Use this copy','Usar esta copia')); use.type='button'; use.className='btn gold'; use.hidden=true; use.disabled=true;
      var close=node('button',t('Close','Cerrar')); close.type='button'; close.className='btn ghost';
      dialog.append(title,note,compare,label,generate,budget,status,review,use,close); document.body.append(dialog); dialog.showModal();
      var result=null, busy=false, finished=false;
      return new Promise(function(resolve){
        function finish(value) { if(finished)return; finished=true; dialog.close(); dialog.remove(); if(opener && opener.isConnected)opener.focus(); resolve(value); }
        close.onclick=function(){finish(null);}; dialog.addEventListener('cancel',function(e){e.preventDefault();finish(null);});
        checkbox.onchange=function(){use.disabled=!checkbox.checked || busy;};
        generate.onclick=async function(){
          if(busy)return; busy=true; generate.disabled=true; preset.disabled=true; use.hidden=true; review.hidden=true; checkbox.checked=false;
          status.textContent=t('Preparing a separate preview. This can take a minute…','Preparando una vista previa aparte. Puede tardar un minuto…');
          try {
            var r=await Hub.api('/api/hub/owner/marketing-photo-enhance',{method:'POST',body:{media_key:photo.media_key,preset:preset.value}});
            if(!r||!r.ok||!r.photo)throw new Error(r&&r.error||t('Could not enhance this photo.','No se pudo mejorar esta foto.'));
            if(finished)return; result=r.photo;
            while(compare.children.length>1)compare.lastChild.remove();
            compare.append(frame(t('AI-enhanced copy — review required','Copia mejorada con IA — requiere revisión'),result.url));
            status.textContent=t('Copy saved in Photos. Inspect both at full size before using it.','Copia guardada en Fotos. Revisa ambas antes de usarla.');
            review.hidden=false; use.hidden=false; use.disabled=true;
          } catch(e){if(!finished)status.textContent=e.message;}
          finally{busy=false;if(!finished){generate.disabled=false;preset.disabled=false;}}
        };
        use.onclick=async function(){
          if(!result||!checkbox.checked||busy)return;busy=true;use.disabled=true;
          try { if(options.onUse)await options.onUse(result);finish(result); }
          catch(e){status.textContent=e.message;busy=false;use.disabled=false;}
        };
      });
    }
  };
})();
