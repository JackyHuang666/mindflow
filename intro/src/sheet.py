import sys,glob
from PIL import Image,ImageDraw
d=sys.argv[1]; out=sys.argv[2] if len(sys.argv)>2 else 'sheet.jpg'; W=int(sys.argv[3]) if len(sys.argv)>3 else 480
fs=sorted(glob.glob(d+'/f_*.png'),key=lambda s:float(s.split('_')[-1][:-4]))
H=W*9//16;cols=3
sh=Image.new('RGB',(W*cols,H*((len(fs)+cols-1)//cols)))
for i,f in enumerate(fs):
  im=Image.open(f).convert('RGB').resize((W,H));dr=ImageDraw.Draw(im);dr.text((6,6),f.split('_')[-1][:-4],fill=(255,255,0))
  sh.paste(im,((i%cols)*W,(i//cols)*H))
sh.save(out,quality=88)
