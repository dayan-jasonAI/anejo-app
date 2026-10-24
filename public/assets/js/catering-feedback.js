(function () {
  'use strict';
  var byId=function(id){return document.getElementById(id);};
  var token=new URLSearchParams(window.location.search).get('t')||'';
  var form=byId('cf-form'),state=byId('cf-state'),error=byId('cf-error'),submit=byId('cf-submit'),busy=false;
  function googleLink(value){
    try{var url=new URL(value);if(url.protocol!=='https:'||!(['google.com','www.google.com','maps.google.com','maps.app.goo.gl','g.page'].includes(url.hostname)))return null;return url.href;}catch(_error){return null;}
  }
  function showReview(value){var url=googleLink(value);if(!url)return;byId('cf-google').href=url;byId('cf-public-review').hidden=false;}
  function paint(){
    var moods=[['sad','Needs care','M10 23 Q18 15 26 23'],['neutral','It was okay','M10 21 L26 21'],['happy','Loved it','M10 19 Q18 27 26 19']];
    byId('cf-moods').innerHTML=moods.map(function(m){return '<label><input type="radio" name="mood" value="'+m[0]+'"><span><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"></circle><path d="M12 13h.01 M24 13h.01 '+m[2]+'"></path></svg><span>'+m[1]+'</span></span></label>';}).join('');
    byId('cf-scores').innerHTML=Array.from({length:10},function(_unused,index){var n=index+1;return '<label><input type="radio" name="rating" value="'+n+'" aria-label="'+n+' out of 10"><span>'+n+'</span></label>';}).join('');
  }
  function sayUnavailable(message){form.hidden=true;byId('cf-title').textContent='A little help finding your invitation.';byId('cf-intro').textContent=message;state.textContent='Please use the private link in your Añejo email, or contact us about your event.';}
  async function load(){
    if(!/^[a-f0-9]{64}$/.test(token)){sayUnavailable('This feedback invitation is incomplete or unavailable.');return;}
    try{
      var response=await fetch('/api/catering-feedback?t='+encodeURIComponent(token),{cache:'no-store'}),data=await response.json();
      if(!response.ok||!data.ok)throw Error(data.error||'This invitation is not available right now.');
      var before=data.kind==='pre_event_checkin';
      byId('cf-title').innerHTML=before?'Before we set<br><em>your table.</em>':'How was<br><em>your Añejo moment?</em>';
      byId('cf-intro').textContent=data.prompt||(before?'A quick check-in before your gathering. Tell us how you are feeling and anything we should know.':'The food. The care. The little details. Tell us how your experience felt.');
      byId('cf-mood-label').textContent=before?'How are you feeling about your event?':'How was your experience?';
      byId('cf-again-field').hidden=before;
      byId('cf-scores').closest('fieldset').hidden=before;
      if(before){
        byId('cf-comment').placeholder='Any last details or concerns we should know before your event?';
        var beforeLabels={sad:'Need some help',neutral:'Feeling ready',happy:'Very excited'};
        form.querySelectorAll('input[name="mood"]').forEach(function(input){input.nextElementSibling.querySelector('span').textContent=beforeLabels[input.value];});
      }
      else showReview(data.google_review_url);
      state.textContent='';form.hidden=false;
    }catch(loadError){sayUnavailable(loadError.message||'We could not open your feedback invitation.');}
  }
  paint();
  byId('cf-comment').addEventListener('input',function(){byId('cf-count').textContent=this.value.length.toLocaleString()+' / 2,000';});
  form.addEventListener('submit',async function(event){
    event.preventDefault();if(busy)return;error.textContent='';
    var mood=form.querySelector('input[name="mood"]:checked'),rating=form.querySelector('input[name="rating"]:checked'),again=form.querySelector('input[name="would_again"]:checked');
    if(!mood&&!rating){error.textContent='Choose a feeling or a score so we know how it went.';form.querySelector('input[name="mood"]').focus();return;}
    var payload={t:token,comment:byId('cf-comment').value.trim()};if(mood)payload.mood=mood.value;if(rating)payload.rating=Number(rating.value);if(again)payload.would_again=again.value==='true';
    busy=true;submit.disabled=true;submit.textContent='Saving your feedback…';
    try{
      var response=await fetch('/api/catering-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();
      if(!response.ok||!data.ok)throw Error(data.error||'Your feedback was not saved. Please try again.');
      form.hidden=true;byId('cf-thanks').hidden=false;byId('cf-thanks').focus();
      if(!byId('cf-again-field').hidden)showReview(data.google_review_url);
    }catch(sendError){error.textContent=sendError.message||'We could not save your feedback. Please try again.';submit.disabled=false;submit.textContent='Share your feedback →';}
    finally{busy=false;}
  });
  load();
})();
