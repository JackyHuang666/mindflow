"""從原始插畫產生渲染用的圖：python3 prep.py（在 intro/src 執行）
img/src1.jpg 女媧造人、img/src2.jpg 五色補天（使用者提供，1672×941）、../../scenes/main.jpg 主畫面
輸出 img/p1.jpg p2.jpg（放大 2 倍＋銳利化）、p2_beam.png（光帶範圍）、p2_crack.png（裂縫亮邊）、p2_fill.jpg（模糊底）、
p3.jpg（main.jpg 縮成 4096）、p3_blur.jpg（雲霧中隱約的學院）；p3_keep.png（前景平台，手繪，已附）"""
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance
from scipy import ndimage as nd
D = "img/"
def up(src, dst):
    im = Image.open(src).convert("RGB"); w, h = im.size
    im.resize((w * 2, h * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2)).save(dst, quality=94)
up(D + "src1.jpg", D + "p1.jpg"); up(D + "src2.jpg", D + "p2.jpg")
a = np.asarray(Image.open(D + "src2.jpg").convert("RGB")).astype(np.float32) / 255; H, W, _ = a.shape
V = a.max(2); Y = np.mgrid[0:H, 0:W][0] / H; r, g, b = a[..., 0], a[..., 1], a[..., 2]
cm = np.clip((V - 0.65) / 0.2, 0, 1) * ((r > g) & (g > b) & (r > 0.65)) * np.clip((0.5 - Y) / 0.15, 0, 1)
cm = np.clip(nd.gaussian_filter(cm.astype(np.float32), 3) * 1.5, 0, 1)
Image.fromarray((cm * 255).astype(np.uint8)).save(D + "p2_crack.png")
p = Image.new("L", (W, H), 0); ImageDraw.Draw(p).polygon([(0.355 * W, 0.505 * H), (0.665 * W, 0.505 * H), (0.59 * W, 0.2 * H), (0.43 * W, 0.2 * H)], fill=255)
p.filter(ImageFilter.GaussianBlur(26)).save(D + "p2_beam.png")
Image.open(D + "p2.jpg").filter(ImageFilter.GaussianBlur(30)).save(D + "p2_fill.jpg", quality=90)
m = Image.open("../../scenes/main.jpg").convert("RGB").resize((4096, 2304), Image.LANCZOS); m.save(D + "p3.jpg", quality=93)
bl = ImageEnhance.Color(m.resize((1024, 576), Image.LANCZOS).filter(ImageFilter.GaussianBlur(22))).enhance(0.7)
bl.resize((2048, 1152), Image.BICUBIC).save(D + "p3_blur.jpg", quality=90)
print("ok")
