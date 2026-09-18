/* Manual evidence and proposed text only. There is intentionally no Google send action. */
(function () {
  'use strict';
  var root, editing = null, requestId = null, busy = false;
  function el(tag,text) { var n=document.createElement(tag); if(text)n.textContent=text; return n; }
  function field(id) { return document.getElementById(id); }
  function status(text) { field('review-status').textContent=text; }
  function reset() { editing=null;requestId=null;field('review-form').reset();field('review-submit').textContent='Save private draft';field('review-cancel').hidden=true; }
  function fill(d) { if(busy)return;editing=d;requestId=null;['review_text','proposed_reply','source_url','rating'].forEach(function(k){field(k).value=d[k] == null ? '' : d[k];});field('review-submit').textContent='Save changes';field('review-cancel').hidden=false;field('review_text').focus(); }
  function lock(value) { busy=value;root.querySelectorAll('button,input,textarea,select').forEach(function(n){n.disabled=value;}); }
  async function api(options) { var r=await Hub.api('/api/hub/owner/google-reviews',options);if(!r||!r.ok)throw new Error(r&&r.error||'Could not reach private draft storage.');return r; }
  async function load() {
    var list=field('review-list');
    try {
      var r=await api();list.replaceChildren();
      if(!r.drafts.length)list.append(el('p','No private drafts saved yet. This is not a live Google review inbox.'));
      r.drafts.forEach(function(d){var card=el('article');card.className='review-card';card.append(el('strong',d.status==='dismissed'?'Dismissed private draft':'Private proposed reply'),el('p','Manually supplied review · not verified against Google'),el('p',d.review_text),el('p','Proposed reply: '+d.proposed_reply));
        if(d.rating)card.append(el('p','Manually entered rating: '+d.rating+'/5'));
        if(d.source_url){var link=el('a','Open supplied Google link');link.href=d.source_url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
        if(d.status==='draft'){var actions=el('div');actions.className='review-actions';var edit=el('button','Edit draft');edit.type='button';edit.onclick=function(){fill(d);};var dismiss=el('button','Dismiss draft');dismiss.type='button';dismiss.onclick=async function(){if(busy)return;lock(true);try{await api({method:'POST',body:{op:'dismiss',id:d.id,version:d.version}});if(editing&&editing.id===d.id)reset();status('Draft dismissed. Nothing sent to Google.');await load();}catch(e){status(e.message);}finally{lock(false);}};actions.append(edit,dismiss);card.append(actions);}list.append(card);});
      field('review-storage').textContent='Private draft storage available · latest 100 local drafts.';
    }catch(e){list.replaceChildren();field('review-storage').textContent=e.message;}
  }
  Owner.init('marketing',function(){
    root=field('owner-root');root.textContent='';
    var title=el('h2','Google reviews — disconnected');root.append(title,el('p','Google review syncing and reply publishing are unavailable. Paste a review you have independently checked and prepare a private reply below. Saved text is not approved, published, or verified against Google.'));
    root.append(el('p','Before any future reply is sent, the Google connection, correct business/review, and exact final text need separate verification.'));
    var storage=el('p');storage.id='review-storage';storage.setAttribute('role','status');root.append(storage);
    var form=el('form');form.id='review-form';form.className='review-form';
    function input(name,label,tag,max){var l=el('label',label);l.htmlFor=name;var n=el(tag);n.id=name;if(max)n.maxLength=max;form.append(l,n);return n;}
    input('review_text','Manually supplied review text','textarea',5000).required=true;
    input('source_url','Google Maps/review link (optional; not verified)','input',2048).type='url';
    var rating=input('rating','Rating (optional)','select');[['','Not entered'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5']].forEach(function(v){var o=el('option',v[1]);o.value=v[0];rating.append(o);});
    input('proposed_reply','Proposed reply — private draft','textarea',3000).required=true;
    var starter=el('button','Use a simple reply starter');starter.type='button';starter.onclick=function(){if(field('proposed_reply').value.trim()&&!window.confirm('Replace the current proposed text?'))return;field('proposed_reply').value='Thank you for sharing your feedback.';};
    var save=el('button','Save private draft');save.id='review-submit';save.type='submit';var cancel=el('button','Cancel edit');cancel.id='review-cancel';cancel.type='button';cancel.hidden=true;cancel.onclick=reset;form.append(starter,save,cancel);root.append(form);
    var message=el('p');message.id='review-status';message.setAttribute('role','status');root.append(message);
    var refresh=el('button','Refresh saved drafts');refresh.type='button';refresh.onclick=function(){if(!busy)load();};root.append(refresh);var list=el('section');list.id='review-list';root.append(list);
    form.onsubmit=async function(e){e.preventDefault();if(busy)return;lock(true);var b={op:editing?'edit':'create',review_text:field('review_text').value,proposed_reply:field('proposed_reply').value,source_url:field('source_url').value,rating:field('rating').value?Number(field('rating').value):null};
      if(editing){b.id=editing.id;b.version=editing.version;}else{requestId=requestId||crypto.randomUUID();b.request_id=requestId;}
      try{await api({method:'POST',body:b});reset();status('Private draft saved. Nothing sent to Google.');await load();}catch(error){status(error.message);}finally{lock(false);}};
    load();
  },{roles:Owner.MARKETING_DESK});
})();
