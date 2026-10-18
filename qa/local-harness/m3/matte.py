import sys
from PIL import Image; import numpy as np
from scipy import ndimage
name=sys.argv[1]
src=f'public/brand/bot-{name}-fullbody.png'
a=np.array(Image.open(src).convert('RGBA')).astype(float)
before=Image.open(f'public/brand/bot-{name}-fullbody.webp').convert('RGBA')
op0=a[...,3]>=128
# outline colour: darkest opaque pixels' median
lum=a[...,:3].mean(-1)
dark=op0&(lum<60)
NAVY=np.median(a[...,:3][dark],axis=0) if dark.sum()>100 else np.array([18,24,38.])
opaque=op0
yy,xx=np.ogrid[-10:11,-10:11]; disk=(xx*xx+yy*yy)<=100
sil=ndimage.binary_fill_holes(ndimage.binary_closing(np.pad(opaque,12),structure=disk))[12:-12,12:-12]
sil=ndimage.binary_dilation(sil,iterations=2)
inside=sil&(a[...,3]<255)
f=a[...,3][inside]/255
for c in range(3): a[...,c][inside]=a[...,c][inside]*f+NAVY[c]*(1-f)
a[...,3][inside]=255
lum=a[...,:3].mean(-1); sat=a[...,:3].max(-1)-a[...,:3].min(-1)
navyish=(np.abs(a[...,:3]-NAVY).sum(-1)<40)
near=ndimage.binary_dilation(navyish,iterations=2)
light=(lum>200)&(sat<35)
spk=near&light&sil&(ndimage.uniform_filter(light.astype(float),5)<0.5)
for c in range(3): a[...,c][spk]=NAVY[c]
dist=ndimage.distance_transform_edt(~sil); edge=(~sil)&(dist<1.5)
for c in range(3): a[...,c][edge]=NAVY[c]
a[...,3][edge]=110
out=Image.fromarray(a.clip(0,255).astype('uint8'),'RGBA')
out.save(f'/tmp/m3/{name}.png',optimize=True); out.save(f'/tmp/m3/{name}.webp',quality=90,method=6)
W=400; tiles=[]
for bg in [(255,255,255,255),(17,24,39,255)]:
  for img in [before,out]:
    c=Image.new('RGBA',img.size,bg); c.alpha_composite(img); h=int(img.height*W/img.width); tiles.append(c.resize((W,h),Image.LANCZOS).convert('RGB'))
g=Image.new('RGB',(2*W,2*tiles[0].height))
for i,t in enumerate(tiles): g.paste(t,((i%2)*W,(i//2)*tiles[0].height))
g.save(f'/tmp/m3/grid-{name}.png'); print(name,'navy',NAVY.round(),'specks',int(spk.sum()),'transparent-inside-before',int((sil&~op0).sum()))
