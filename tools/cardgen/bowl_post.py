# Brand-treated bowl post images (1080x1350, 4:5 feed-max) from the real photography.
# The Lead's drafts arrive with art direction but no pixels, and Workers cannot render at
# runtime — so every bowl gets ONE canonical, on-brand post image staged in R2 ahead of time
# and the executor attaches it by name. The owner can always override with the 📷 upload button.
#
# Treatment follows the brief: full round bowl visible, centered, dark matte surround, gold
# frame, emblem, and the "bright and dark coexisting" light Dayan ruled on — the photo keeps its
# brightness while the surround stays cellar-dark.
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BG=(9,20,10); GOLD=(200,188,110); BRONZE=(192,132,24); CREAM=(245,242,236)
W,H=1080,1350
def F(name,size,wght=None):
    f=ImageFont.truetype(os.path.join(HERE,'fonts',name),size)
    if wght:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f

def build(bowl, out):
    photo = Image.open(os.path.join(REPO,'public','assets','img',f'bowl_{bowl}.jpg')).convert('RGB')
    im = Image.new('RGB',(W,H),BG)
    d = ImageDraw.Draw(im)
    # Photo occupies the upper 4/5 as a square crop — full round bowl, front and center.
    side = W - 140
    s = min(photo.width, photo.height)
    sq = photo.crop(((photo.width-s)//2,(photo.height-s)//2,(photo.width+s)//2,(photo.height+s)//2)).resize((side,side), Image.LANCZOS)
    sq = ImageEnhance.Color(sq).enhance(1.06)     # ingredients bright and high-quality
    im.paste(sq,(70,96))
    # Gold hairline around the photo, then the outer brand frame.
    d.rectangle([70,96,70+side,96+side],outline=GOLD,width=2)
    d.rectangle([26,26,W-26,H-26],outline=GOLD,width=2)
    # Emblem above the name
    y = 96+side+34
    try:
        em = Image.open(os.path.join(REPO,'public','assets','img','emblem.png')).convert('RGBA')
        eh=58; ew=int(em.width*eh/em.height); em=em.resize((ew,eh))
        im.paste(em,((W-ew)//2,y),em); y+=eh+12
    except Exception: pass
    name = bowl.upper()
    tf = F('CormorantGaramond.ttf',78,600)
    tw = d.textlength(name,font=tf); d.text(((W-tw)/2,y),name,font=tf,fill=CREAM); y+=92
    kf = F('JosefinSans.ttf',22,500)
    k = ' '.join('ANEJOCATERINGCO.COM')
    kw = d.textlength(k,font=kf); d.text(((W-kw)/2,y),k,font=kf,fill=BRONZE)
    im.save(out,'JPEG',quality=92)
    return out

if __name__ == '__main__':
    outdir = sys.argv[1] if len(sys.argv)>1 else '/tmp/bowlposts'
    os.makedirs(outdir,exist_ok=True)
    for b in ['coco','ligero','congreen','fuego','vida','mar','raiz','fuerza']:
        try: print(build(b, os.path.join(outdir,f'{b}.jpg')))
        except FileNotFoundError as e: print('skip',b,e)
