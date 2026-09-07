// Compositing stays deterministic: the original brand pixels are never regenerated.
let logo;
export async function loadBrand() {
  logo = new Image(); logo.src = '/assets/img/logo_full.png'; await logo.decode();
}
export function decoration(ctx, pattern, color, size = 640) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.globalAlpha = .25;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = size/2 + Math.cos(a)*size*.43, y = size/2 + Math.sin(a)*size*.43;
    ctx.save(); ctx.translate(x,y); ctx.rotate(a);
    if (pattern === 'hearts') { ctx.beginPath(); ctx.moveTo(0,9); ctx.bezierCurveTo(-23,-5,-12,-22,0,-9); ctx.bezierCurveTo(12,-22,23,-5,0,9); ctx.fill(); }
    else if (pattern === 'stars') { ctx.beginPath(); for(let j=0;j<10;j++){const r=j%2?5:13;ctx.lineTo(Math.cos(j*Math.PI/5)*r,Math.sin(j*Math.PI/5)*r);}ctx.closePath();ctx.fill(); }
    else if (pattern === 'flowers') { for(let j=0;j<5;j++){ctx.rotate(Math.PI*2/5);ctx.beginPath();ctx.ellipse(8,0,9,5,0,0,Math.PI*2);ctx.fill();} }
    else if (pattern === 'botanical' || pattern === 'fall') { ctx.beginPath();ctx.ellipse(0,0,pattern==='fall'?20:15,7,.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-19,-8);ctx.lineTo(19,8);ctx.stroke(); }
    ctx.restore();
  } ctx.restore();
}
export function paintSurface(canvas, variant, surface, assets) {
  const c = canvas.getContext('2d'), s = canvas.width;
  c.clearRect(0,0,s,s); c.save();
  if (surface === 'label' || surface === 'pick') { c.beginPath(); c.arc(s/2,s/2,s*.485,0,2*Math.PI); c.clip(); }
  c.fillStyle=variant.theme.colors[surface]; c.fillRect(0,0,s,s);
  const themeArt=assets.get(variant.theme.artworkAttachmentId)?.image;
  if(themeArt){c.globalAlpha=.35;c.drawImage(themeArt,0,0,s,s);c.globalAlpha=1;}
  decoration(c,variant.theme.pattern,variant.theme.colors.logo,s);
  for(const art of variant.personalization.artworks.filter(a=>a.surface===surface)){
    const im=assets.get(art.attachmentId)?.image; if(!im)continue;
    c.save();c.translate(art.x/10000*s,art.y/10000*s);c.rotate(art.rotation*Math.PI/180);
    const w=s*.6*art.scale,h=w*im.height/im.width;c.drawImage(im,-w/2,-h/2,w,h);c.restore();
  }
  const placement=variant.personalization.textPlacements.find(p=>p.surface===surface);
  const message=variant.personalization[surface+'Text']||'';
  if(placement && message){c.save();c.translate(s*placement.x,s*placement.y);c.rotate(placement.rotation*Math.PI/180);c.fillStyle=variant.theme.colors.logo;c.font=`${Math.round(s*.041*placement.scale)}px Georgia`;c.textAlign='center';c.textBaseline='middle';c.fillText(message,0,0,s*.88);c.restore();}
  // Brand lockup: mask its original alpha in a separate canvas, recolor only.
  // Cropping the FIT tagline below y=696 does not alter the wordmark or emblem.
  if(logo){const mask=document.createElement('canvas');mask.width=750;mask.height=696;const m=mask.getContext('2d');m.drawImage(logo,0,0);m.globalCompositeOperation='source-in';m.fillStyle=variant.theme.colors.logo;m.fillRect(0,0,750,696);
    c.fillStyle=variant.theme.colors[surface];c.globalAlpha=.97;c.beginPath();c.roundRect(s*.30,s*.21,s*.40,s*.40,18);c.fill();c.globalAlpha=1;c.drawImage(mask,s*.33,s*.225,s*.34,s*.316);
    c.fillStyle=variant.theme.colors.logo;c.font=`${s*.019}px Georgia`;c.textAlign='center';c.fillText('C A T E R I N G  C O.',s/2,s*.58);
  }
  c.strokeStyle=variant.theme.colors.logo;c.lineWidth=1.8;
  if(surface==='label'||surface==='pick'){c.beginPath();c.arc(s/2,s/2,s*.467,0,2*Math.PI);c.stroke();}else c.strokeRect(s*.035,s*.035,s*.93,s*.93);
  c.restore();return canvas;
}
