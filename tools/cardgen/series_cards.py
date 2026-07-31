# Añejo brand card generator — the §10/§11 system in pixels: matte dark forest green, thin gold
# rule, Cormorant serif headlines, Josefin uppercase kickers, emblem. 1080×1350 (4:5) — feed-max.
from PIL import Image, ImageDraw, ImageFont
import textwrap, sys

BG=(9,20,10); BG2=(12,26,13); GOLD=(200,188,110); BRONZE=(192,132,24); CREAM=(245,242,236); MUTED=(169,164,140)
W,H=1080,1350
def F(path,size,var=None):
    f=ImageFont.truetype(path,size)
    if var:
        try: f.set_variation_by_axes([var])
        except Exception: pass
    return f

def card(out, kicker, title, body_blocks, footer="ANEJOCATERINGCO.COM", num=None, title_size=118, emblem=True):
    im=Image.new("RGB",(W,H),BG)
    d=ImageDraw.Draw(im)
    # subtle vertical vignette
    for y in range(H):
        t=abs(y-H*0.35)/(H*0.9)
        c=tuple(int(a+(b-a)*t) for a,b in zip(BG2,BG))
        d.line([(0,y),(W,y)],fill=c)
    # gold frame
    m=42
    d.rectangle([m,m,W-m,H-m],outline=(*GOLD,),width=2)
    y=150
    if emblem:
        try:
            em=Image.open("emblem.png").convert("RGBA")
            eh=110; ew=int(em.width*eh/em.height); em=em.resize((ew,eh))
            im.paste(em,((W-ew)//2,y),em); y+=eh+26
        except Exception: pass
    kf=F("josefin.ttf",30,500)
    ks=" ".join(kicker.upper())
    kw=d.textlength(ks,font=kf); d.text(((W-kw)/2,y),ks,font=kf,fill=BRONZE); y+=64
    tf=F("corm.ttf",title_size,600)
    for line in title.split("\n"):
        tw=d.textlength(line,font=tf); d.text(((W-tw)/2,y),line,font=tf,fill=CREAM); y+=int(title_size*1.08)
    y+=8
    d.line([(W/2-70,y),(W/2+70,y)],fill=BRONZE,width=3); y+=44
    bf=F("josefin.ttf",34,300); bfb=F("josefin.ttf",34,600); itf=F("corm-it.ttf",40,500)
    for kind,txt in body_blocks:
        if kind=="gap": y+=int(txt); continue
        font = itf if kind=="it" else (bfb if kind=="b" else bf)
        col = GOLD if kind=="b" else (MUTED if kind=="mut" else CREAM)
        if kind=="it": col=GOLD
        wrap = 40 if kind!="it" else 34
        for line in textwrap.wrap(txt,wrap):
            lw=d.textlength(line,font=font); d.text(((W-lw)/2,y),line,font=font,fill=col)
            y+=int(font.size*1.42)
        y+=10
    ff=F("josefin.ttf",26,400)
    fs=" · ".join([footer]) ; fw=d.textlength(fs,font=ff)
    d.text(((W-fw)/2,H-116),fs,font=ff,fill=MUTED)
    if num:
        nf=F("josefin.ttf",28,500); ns=num; nw=d.textlength(ns,font=nf)
        d.text((W-m-24-nw,m+22),ns,font=nf,fill=GOLD)
    im.save(out,"JPEG",quality=90)
    print("wrote",out)
