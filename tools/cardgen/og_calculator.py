from PIL import Image, ImageDraw, ImageFont
import math
S='/private/tmp/claude-501/-Users-aiagent-Documents-Claude-Code/acae989f-0e00-48e2-8948-b916258e6b12/scratchpad'
W,H=1200,630
BG=(10,24,10); BG2=(13,31,13); GOLD=(200,188,110); BRONZE=(192,132,24); CREAM=(245,242,236); MUT=(245,242,236,150)
img=Image.new('RGB',(W,H),BG)
d=ImageDraw.Draw(img,'RGBA')
# soft radial glow top-center like the site
for r in range(600,0,-4):
    a=int(18*(1-r/600))
    d.ellipse([W*0.72-r, H*0.5-r, W*0.72+r, H*0.5+r], fill=(200,188,110,a//6))
def F(path,size,wght=None):
    f=ImageFont.truetype(path,size)
    if wght:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f
corm=lambda s,w=600:F(f'{S}/cormorant.ttf',s,w)
jose=lambda s,w=400:F(f'{S}/josefin.ttf',s,w)
# gold frame (brand card language)
d.rectangle([26,26,W-26,H-26],outline=GOLD+(90,),width=2)
d.rectangle([34,34,W-34,H-34],outline=GOLD+(40,),width=1)
# ---- left text block ----
x=86
d.text((x,96),'A Ñ E J O   ·   F R E E   T O O L',font=jose(24,600),fill=BRONZE)
d.text((x,140),'Macro',font=corm(110,600),fill=CREAM)
d.text((x,248),'Calculator',font=corm(110,600),fill=GOLD)
d.text((x,392),'Your daily protein, carbs & fat —',font=jose(30,300),fill=CREAM)
d.text((x,432),'and a bowl plan built for your goal.',font=jose(30,300),fill=CREAM)
d.text((x,498),'10 seconds · no sign-up',font=jose(24,500),fill=BRONZE)
# ---- right: macro donut ring ----
cx,cy,R,r_in=905,305,175,118
segs=[('PROTEIN',0.40,GOLD),('CARBS',0.35,CREAM),('FAT',0.25,BRONZE)]
start=-90
for name,frac,col in segs:
    end=start+frac*360
    d.arc([cx-R,cy-R,cx+R,cy+R],start,end-3,fill=col,width=R-r_in)
    start=end
# inner disc + center numbers
d.ellipse([cx-r_in+18,cy-r_in+18,cx+r_in-18,cy+r_in-18],fill=BG2)
t='2,050'
w=d.textlength(t,font=corm(72,600)); d.text((cx-w/2,cy-62),t,font=corm(72,600),fill=CREAM)
t='CALORIES / DAY'
w=d.textlength(t,font=jose(20,600)); d.text((cx-w/2,cy+22),t,font=jose(20,600),fill=GOLD)
# legend under ring
leg=[('PROTEIN','165g',GOLD),('CARBS','210g',CREAM),('FAT','60g',BRONZE)]
lx=cx-232; ly=cy+R+42
for name,g,col in leg:
    d.ellipse([lx,ly+6,lx+16,ly+22],fill=col)
    d.text((lx+26,ly+2),name,font=jose(22,600),fill=CREAM)
    d.text((lx+26,ly+30),g,font=corm(34,600),fill=col)
    lx+=160
img.save(f'{S}/og_calculator.png')
print('saved',img.size)
