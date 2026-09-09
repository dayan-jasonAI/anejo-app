(function(){
  const photos=document.querySelectorAll('.family-backdrop img'),button=document.querySelector('.family-pause');
  if(!button||photos.length<2)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=motion.matches,index=0;
  button.setAttribute('translate','no');
  function label(){const value=paused?'Play background':'Pause background';button.textContent=window.AnejoI18n?.text?window.AnejoI18n.text(value):value;button.setAttribute('aria-pressed',String(paused));}
  button.addEventListener('click',()=>{paused=!paused;label()});
  motion.addEventListener('change',e=>{paused=e.matches;label()});
  document.addEventListener('anejo:langchange',label);label();
  setInterval(()=>{if(paused||document.hidden)return;const next=(index+1)%photos.length;if(!photos[next].complete||!photos[next].naturalWidth)return;photos[index].classList.remove('is-active');photos[next].classList.add('is-active');index=next;},6500);
})();
