"""Gera thumbnails JPEG coloridos variados (base64) para a preview do redesign.
Escreve preview_assets.json com: photos[], media_thumbs[], notif_image."""
import base64, io, json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = '/home/z/my-project/scripts/preview_assets.json'
W = H = 256

def grad(c1, c2, w=W, h=H):
    img = Image.new('RGB', (w, h), c1)
    top = Image.new('RGB', (w, h), c2)
    mask = Image.new('L', (w, h))
    for x in range(w):
        mask.paste(int(255 * x / w), (x, 0, x + 1, h))
    img.paste(top, (0, 0), mask)
    return img

def add_circle(img, color, pos, r):
    d = ImageDraw.Draw(img)
    d.ellipse([pos[0]-r, pos[1]-r, pos[0]+r, pos[1]+r], fill=color)

def label(img, text):
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception:
        f = ImageFont.load_default()
    d = ImageDraw.Draw(img)
    bbox = d.textbbox((0,0), text, font=f)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    d.rectangle([8, 8, 12+tw, 12+th], fill=(0,0,0,180))
    d.text((10, 10), text, font=f, fill=(255,255,255))

def to_b64_jpeg(img, q=70):
    buf = io.BytesIO()
    img.convert('RGB').save(buf, 'JPEG', quality=q)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

# 8 "fotos" para a galeria — gradientes + formas, cores variadas
photos = []
palettes = [
    ((255,140,80),(255,90,60), 'Praia'),
    ((90,180,255),(60,120,220), 'Céu'),
    ((180,120,220),(120,80,200), 'Sol'),
    ((120,220,150),(60,180,90),  'Parque'),
    ((255,200,90),(240,160,50),  'Pôr-do-sol'),
    ((220,100,140),(180,60,110), 'Flor'),
    ((100,200,220),(60,160,190), 'Mar'),
    ((255,160,120),(220,110,80), 'Areia'),
]
for i,(c1,c2,name) in enumerate(palettes):
    img = grad(c1,c2)
    add_circle(img, (255,255,230,200), (W-60, 60), 30)  # "sol"
    add_circle(img, (255,255,255,120), (90, H-70), 45)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    photos.append({'b64': to_b64_jpeg(img), 'name': f'IMG_{1000+i}.jpg', 'label': name})

# 4 thumbnails menores para notifications (imagens partilhadas no chat)
notif_imgs = []
for i in range(4):
    c1 = palettes[i][0]; c2 = palettes[i][1]
    img = grad(c1,c2,W,W)
    add_circle(img, (255,255,255), (W//2, W//2), 50)
    notif_imgs.append(to_b64_jpeg(img, q=60))

result = {
    'photos': photos,           # 8 fotos para galeria
    'notif_images': notif_imgs, # 4 imagens para notifications
}
with open(OUT, 'w') as f:
    json.dump(result, f)
print(f'OK: {len(photos)} fotos, {len(notif_imgs)} imgs notif -> {OUT}')
print('tamanho ficheiro:', os.path.getsize(OUT), 'bytes')
