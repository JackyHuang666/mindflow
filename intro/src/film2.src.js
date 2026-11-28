/* SWT MindFlow 開場序章 v2 — 2.5D 插畫動畫（離線逐格渲染）
 * 底圖：img/p1.jpg（女媧造人）、img/p2.jpg（五色補天）、img/p3.jpg（主畫面 main.jpg）
 * Three.js 只用來合成：分層視差、流動、銀河旋轉、光帶點燃、裂縫修補、雲海中學院浮現、粒子與光暈，以及後製。
 * window.renderAt(t) 畫出第 t 秒。
 */
(function () {
  "use strict";
  const Q = Object.fromEntries(new URLSearchParams(location.search));
  const W = +Q.w || 1920, H = +Q.h || 1080, PXS = H / 1080;
  const T = THREE;
  let seed = 1128;
  function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), sat = x => clamp(x, 0, 1);
  const smooth = (a, b, x) => { x = sat((x - a) / (b - a)); return x * x * (3 - 2 * x); };
  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const gauss = (t, c, s) => Math.exp(-0.5 * ((t - c) / s) * ((t - c) / s));
  const NOISE = `/*NOISE*/`;

  // ---------- 渲染與後製 ----------
  const renderer = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputEncoding = T.LinearEncoding; renderer.toneMapping = T.NoToneMapping;
  document.body.appendChild(renderer.domElement);
  const rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
  const composer = new T.EffectComposer(renderer, rt);
  const cam = new T.OrthographicCamera(0, 1, 1, 0, -10, 10);
  const renderPass = new T.RenderPass(new T.Scene(), cam); composer.addPass(renderPass);
  const VS = "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
  const rays = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uLight: { value: new T.Vector2(0.5, 0.5) }, uStr: { value: 0 }, uThr: { value: 1.0 }, uSeed: { value: 0 } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 uLight;uniform float uStr,uThr,uSeed;varying vec2 vUv;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){vec3 base=texture2D(tDiffuse,vUv).rgb;if(uStr<=0.001){gl_FragColor=vec4(base,1.);return;}
vec2 d=(vUv-uLight)*(0.8/40.0);vec2 c=vUv-d*hash12(vUv*1000.+uSeed);float il=1.;vec3 acc=vec3(0.);
for(int i=0;i<40;i++){c-=d;vec3 s=max(texture2D(tDiffuse,c).rgb-vec3(uThr),0.);acc+=s*il;il*=.955;}
gl_FragColor=vec4(base+acc*uStr/40.0,1.);}`
  });
  composer.addPass(rays);
  const bloom = new T.UnrealBloomPass(new T.Vector2(W, H), 0.5, 0.5, 1.0); composer.addPass(bloom);
  const finalPass = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uExp: { value: 1 }, uFlash: { value: new T.Vector3() }, uFade: { value: 1 }, uVig: { value: 0.35 }, uSeed: { value: 0 }, uDark: { value: 0 }, tT1: { value: null }, tT2: { value: null }, tT3: { value: null }, uO: { value: new T.Vector3() }, uRes: { value: new T.Vector2(W, H) } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse,tT1,tT2,tT3;uniform float uExp,uFade,uVig,uSeed,uDark;uniform vec3 uFlash,uO;uniform vec2 uRes;varying vec2 vUv;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec3 over(vec3 c,sampler2D t,float o,vec2 uv){if(o<=0.001)return c;vec4 s=texture2D(t,uv+vec2(0.,-(1.-o)*0.012));return mix(c,s.rgb,s.a*o);}
void main(){vec2 uv=vUv;vec2 dc=uv-.5;float r2=dot(dc,dc);
vec3 c;c.r=texture2D(tDiffuse,uv-dc*r2*0.006).r;c.g=texture2D(tDiffuse,uv).g;c.b=texture2D(tDiffuse,uv+dc*r2*0.006).b;
c=c*uExp+uFlash;
float m=max(c.r,max(c.g,c.b));
if(m>0.82){float nm=0.82+0.18*(1.-exp(-(m-0.82)/0.18));float ov=clamp((m-1.)/2.5,0.,1.);c=mix(c/m*nm,vec3(nm),ov*.85);}
c*=mix(1.,smoothstep(1.1,0.3,length(dc*vec2(1.,.82))*1.1),uVig);
c*=1.-uDark*smoothstep(0.55,0.0,length((dc-vec2(0.,0.1))*vec2(0.8,2.1)));
c=over(c,tT1,uO.x,uv);c=over(c,tT2,uO.y,uv);c=over(c,tT3,uO.z,uv);
c+=(hash12(uv*uRes+uSeed)-.5)*0.016;
c*=1.-uFade;gl_FragColor=vec4(clamp(c,0.,1.),1.);}`
  });
  composer.addPass(finalPass);

  // ---------- 共用 ----------
  const time = { value: 0 };
  const loader = new T.TextureLoader();
  function tex(src) { return new Promise(res => loader.load(src, t => { t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.anisotropy = 8; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; res(t); })); }
  // 粒子（螢幕座標，y 向上，尺寸以 1080p 像素計）
  const PV = `attribute float aSize;attribute vec3 aColor;attribute float aAlpha;uniform float uS;varying vec3 vC;varying float vA;
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(aSize*uS,1.,512.);vC=aColor;vA=aAlpha*min(aSize*uS*aSize*uS,1.);}`;
  const PF = `varying vec3 vC;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c)*2.;if(d>1.)discard;float a=exp(-d*d*5.)*0.8+exp(-d*d*40.)*0.5;a*=smoothstep(1.,.8,d);gl_FragColor=vec4(vC*a*vA,1.);}`;
  const PSU = { value: PXS };
  class PS {
    constructor(n, scene) {
      this.n = n; this.i = 0; const g = new T.BufferGeometry();
      this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.s = new Float32Array(n); this.a = new Float32Array(n);
      g.setAttribute("position", new T.BufferAttribute(this.p, 3)); g.setAttribute("aColor", new T.BufferAttribute(this.c, 3)); g.setAttribute("aSize", new T.BufferAttribute(this.s, 1)); g.setAttribute("aAlpha", new T.BufferAttribute(this.a, 1));
      this.g = g; const m = new T.ShaderMaterial({ uniforms: { uS: PSU }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending });
      this.o = new T.Points(g, m); this.o.frustumCulled = false; this.o.renderOrder = 5; scene.add(this.o);
      this.r = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) this.r[i] = rnd();
    }
    begin() { this.i = 0; }
    add(x, y, col, size, alpha) { if (this.i >= this.n) return; const i = this.i++, j = i * 3; this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = 0; this.c[j] = col[0]; this.c[j + 1] = col[1]; this.c[j + 2] = col[2]; this.s[i] = size; this.a[i] = alpha; }
    end() { for (let k = this.i; k < this.n; k++) this.a[k] = 0; for (const k of ["position", "aColor", "aSize", "aAlpha"]) this.g.attributes[k].needsUpdate = true; }
  }
  const hex = h => { const c = new T.Color(h); return [c.r, c.g, c.b]; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const C5 = ["#2fe0cf", "#ff4a3a", "#ffc63a", "#ffffff", "#9a5cff"].map(hex);
  const GOLD = hex("#ffd28a"), WARM = hex("#fff0d0");
  // 鏡頭：圖片座標（x 向右、y 向下，0–1）→ 螢幕座標（y 向上）
  function Cam() { return { z: 1, cx: 0.5, cy: 0.5, px: 0, py: 0 }; }
  function clampCam(c) { const m = 0.5 / c.z + 0.012; c.cx = clamp(c.cx, m, 1 - m); c.cy = clamp(c.cy, m, 1 - m); return c; }
  function toS(c, ix, iy, depth) { const d = (depth == null ? 0.5 : depth) - 0.5; return [(ix - c.cx - c.px * d) * c.z + 0.5, ((1 - iy) - (1 - c.cy) - c.py * d) * c.z + 0.5]; }
  function keys(K, t) { let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++; const a = K[i], b = K[i + 1]; const u = ease(sat((t - a[0]) / (b[0] - a[0]))); return { z: lerp(a[1], b[1], u), cx: lerp(a[2], b[2], u), cy: lerp(a[3], b[3], u) }; }
  function plate(fs, uniforms) {
    const m = new T.ShaderMaterial({ uniforms: Object.assign({ uTime: time, uZoom: { value: 1 }, uCenter: { value: new T.Vector2(0.5, 0.5) }, uPar: { value: new T.Vector2() } }, uniforms), vertexShader: VS,
      fragmentShader: `uniform float uTime,uZoom;uniform vec2 uCenter,uPar;varying vec2 vUv;${NOISE}
vec2 cam(vec2 s,float d){return vec2(uCenter.x,1.-uCenter.y)+(s-.5)/uZoom+uPar*(d-.5);}
${fs}`, depthTest: false, depthWrite: false });
    const q = new T.Mesh(new T.PlaneGeometry(1, 1), m); q.position.set(0.5, 0.5, 0); q.renderOrder = 0; return { q, m };
  }
  function setCam(pl, c) { pl.m.uniforms.uZoom.value = c.z; pl.m.uniforms.uCenter.value.set(c.cx, c.cy); pl.m.uniforms.uPar.value.set(c.px, -c.py); }

  // ---------- 場景 1：女媧造人 ----------
  const S1 = { scene: new T.Scene() };
  const CLAY = [0.522, 0.575], KID = [0.507, 0.39], GAL = [0.825, 0.255];
  // ---------- 場景 2：五色補天 ----------
  const S2 = { scene: new T.Scene() };
  const HANDS = [[0.392, 0.505], [0.612, 0.505]], CRACK = [0.515, 0.15];
  // ---------- 場景 3/4：學院誕生、品牌 ----------
  const S3 = { scene: new T.Scene() };
  const HALL = [0.5, 0.40];
  const BLD = [[0.80, 0.25], [0.17, 0.47], [0.80, 0.27], [0.19, 0.24], [0.76, 0.43]];
  // 地→右前樓、水→左玻璃館、火→右金殿、風→左上林間圓頂、光→右紫晶穹頂
  BLD[0] = [0.79, 0.62]; BLD[2] = [0.80, 0.27];
  const ELEM = ["#ffb347", "#3aa8ff", "#ff5a2e", "#3fe0a8", "#fff0c0"].map(hex);

  async function build() {
    const [t1, t2, t2f, t2b, t2c, t3, t3k, t3b] = await Promise.all(["img/p1.jpg", "img/p2.jpg", "img/p2_fill.jpg", "img/p2_beam.png", "img/p2_crack.png", "img/p3.jpg", "img/p3_keep.png", "img/p3_blur.jpg"].map(tex));
    // S1
    S1.pl = plate(`uniform sampler2D tImg;uniform vec2 uGal;uniform float uSwirl;
void main(){vec2 s=vUv;float d=smoothstep(.8,.3,s.x);vec2 uv=cam(s,d);
 uv+=vec2(snoise(vec3(uv*5.,uTime*.4)),snoise(vec3(uv*5.+7.,uTime*.4)))*.0014*(.3+d);
 vec2 gc=vec2(uGal.x,1.-uGal.y);vec2 g=uv-gc;g.x*=1.777;float r=length(g);float a=uSwirl*smoothstep(.17,0.,r);float c=cos(a),sn=sin(a);g=mat2(c,-sn,sn,c)*g;g.x/=1.777;
 vec3 col=texture2D(tImg,gc+g).rgb;
 float l=dot(col,vec3(.3,.59,.11));float tw=sin(uTime*(2.+hash12(floor(uv*500.))*5.)+hash12(floor(uv*500.)+3.)*40.);
 col*=1.+(1.-d)*smoothstep(.72,.95,l)*.35*tw;
 gl_FragColor=vec4(col,1.);}`, { tImg: { value: t1 }, uGal: { value: new T.Vector2(GAL[0], GAL[1]) }, uSwirl: { value: 0 } });
    S1.scene.add(S1.pl.q); S1.ps = new PS(5200, S1.scene);
    // S2
    S2.pl = plate(`uniform sampler2D tImg,tFill,tBeam,tCrack;uniform float uFront,uOpen,uHeal,uGold,uDorm;
void main(){vec2 s=vUv;float d=smoothstep(.55,0.,s.y);vec2 uv=cam(s,d);
 uv+=vec2(snoise(vec3(uv*4.,uTime*.5)),snoise(vec3(uv*4.+3.,uTime*.5)))*.0018*(1.-d);
 vec3 col=texture2D(tImg,uv).rgb;vec3 fl=texture2D(tFill,uv).rgb;float bm=texture2D(tBeam,uv).r;float cm=texture2D(tCrack,uv).r;
 float yd=1.-uv.y;
 float ign=smoothstep(uFront-.02,uFront+.02,yd);
 vec3 dorm=mix(col,vec3(dot(col,vec3(.33)))*vec3(.62,.58,.78),.65)*.72;
 col=mix(col,dorm,bm*(1.-ign)*uDorm);
 float fr=exp(-abs(yd-uFront)*90.)*bm*step(.001,uDorm)*step(uFront,.515);
 col+=vec3(2.2,1.9,1.5)*fr*.9;
 col+=col*bm*ign*.25*(.6+.4*sin(yd*80.+uTime*25.))*step(.001,uDorm);
 float fl2=.8+.2*sin(uTime*37.)*sin(uTime*23.+1.);
 col*=1.+cm*(mix(-.45,.25*fl2,uOpen))*(1.-uHeal);
 col=mix(col,vec3(1.9,1.55,1.)*(.7+.5*cm),cm*uHeal*.85);
 vec2 cc=vec2(.515,1.-.15);vec2 q=uv-cc;q.x*=1.777;float dd=length(q);
 col+=vec3(1.5,1.1,.6)*uGold*exp(-dd*3.5)*.45;
 col=mix(col,col*1.08+vec3(.06,.045,.015),uGold);
 gl_FragColor=vec4(col,1.);}`, { tImg: { value: t2 }, tFill: { value: t2f }, tBeam: { value: t2b }, tCrack: { value: t2c }, uFront: { value: 0.53 }, uOpen: { value: 0 }, uHeal: { value: 0 }, uGold: { value: 0 }, uDorm: { value: 1 } });
    S2.scene.add(S2.pl.q); S2.ps = new PS(5200, S2.scene);
    // S3
    S3.pl = plate(`uniform sampler2D tImg,tKeep,tBlur;uniform float uRev,uEdge,uSeed,uRing,uMist,uWarm,uDay;
vec3 clouds(vec2 uv){vec3 b=texture2D(tBlur,uv).rgb;float yd=1.-uv.y;
 vec2 m=uv*vec2(2.2,3.)+vec2(uTime*.03,0.);float f=fbm(vec3(m,uTime*.05));float f2=fbm3(vec3(m*2.3+4.,uTime*.08));
 float mist=clamp(.58+.45*f+.2*f2,0.,1.)*smoothstep(.1,.3,yd);
 vec3 mc=mix(vec3(.9,.88,.96),vec3(1.04,1.,.93),clamp(f*1.5+.5,0.,1.));
 mc+=vec3(.12,.08,.02)*exp(-length((uv-vec2(.5,.62))*vec2(1.5,2.5))*2.);
 vec3 col=mix(b*mix(.95,1.05,uDay)+.05,mc,mist*.85);
 return col*uWarm;}
void main(){vec2 s=vUv;float d=smoothstep(.7,.05,s.y);vec2 uv=cam(s,d);
 uv+=vec2(snoise(vec3(uv*3.,uTime*.3)),snoise(vec3(uv*3.+9.,uTime*.3)))*.0008;
 vec3 img=texture2D(tImg,uv).rgb;float yd=1.-uv.y;
 vec2 p=uv-vec2(.5,1.-.42);p.x*=1.777;p.y*=1.35;float dist=length(p);
 float n=fbm3(vec3(uv*4.5,uSeed))*.09+fbm3(vec3(uv*14.,uSeed+3.))*.025;
 float e=dist+n;
 float rv=smoothstep(uRev,uRev-.06,e);
 float keep=texture2D(tKeep,uv).r;
 vec2 rq=(uv-vec2(.5,1.-.08))/vec2(.34,.13);
 float sky=smoothstep(.15,.11,yd)*smoothstep(1.15,1.4,length(rq));
 float vis=max(rv,max(keep,sky));
 vec3 cl=clouds(uv);
 vec2 mq=(uv-vec2(.5,1.-.44))*vec2(1.777,4.2);float ml=abs(length(mq)-uRing*.32);
 cl+=vec3(1.6,1.3,.7)*exp(-ml*60.)*step(.001,uRing)*1.2+vec3(1.4,1.1,.6)*exp(-length(mq)*5.)*uRing*.6;
 vec3 col=mix(cl,img,vis);
 float band=exp(-abs(e-uRev+.03)*42.)*(1.-max(keep,sky))*uEdge;
 col+=vec3(1.1,2.0,2.6)*band*1.6+vec3(1.5,1.2,.6)*band*band*1.2;
 col=mix(col,col*.6+vec3(.55,.75,1.)*.4,smoothstep(uRev-.12,uRev-.02,e)*rv*uEdge*.6);
 float mist=uMist*smoothstep(.35,.95,yd)*(.5+.5*fbm3(vec3(uv*3.,uTime*.1)))*(1.-keep);
 col=mix(col,vec3(.95,.96,1.),clamp(mist,0.,1.)*.75);
 gl_FragColor=vec4(col,1.);}`, { tImg: { value: t3 }, tKeep: { value: t3k }, tBlur: { value: t3b }, uRev: { value: -0.2 }, uEdge: { value: 1 }, uSeed: { value: 3.7 }, uRing: { value: 0 }, uMist: { value: 0 }, uWarm: { value: 1 }, uDay: { value: 0 } });
    S3.scene.add(S3.pl.q); S3.ps = new PS(6000, S3.scene);
    buildText();
  }

  // ---------- 時間軸 ----------
  function updS1(t) {
    const c = clampCam(Object.assign(Cam(), keys([[0, 1.04, 0.5, 0.5], [1.4, 1.12, 0.5, 0.5], [3.0, 1.28, 0.505, 0.48]], t)));
    c.px = 0.012 * Math.sin(t * 0.6) + 0.01 * t / 3; c.py = 0.004 * Math.sin(t * 0.5);
    setCam(S1.pl, c); S1.pl.m.uniforms.uSwirl.value = t * 0.22;
    const ps = S1.ps; ps.begin();
    const S = (ix, iy, dp) => toS(c, ix, iy, dp == null ? smooth(0.8, 0.3, ix) : dp);
    // 星塵（背景緩慢飄動）
    for (let i = 0; i < 900; i++) { const r = ps.r; const ix = r[i], iy = (r[i + 900] + t * 0.004 * (0.5 + r[i + 1800])) % 1; const [x, y] = S(ix, iy, 0.2); ps.add(x, y, i % 3 ? WARM : [0.7, 0.8, 1.2], 2 + 4 * r[i + 2700], 0.35 + 0.35 * Math.sin(t * (1 + 3 * r[i + 2700]) + i)); }
    // 金色光流：繞著女媧的弧線
    for (let i = 0; i < 1400; i++) {
      const st = i % 3, u = (ps.r[i * 2 % ps.n] + t * (0.05 + 0.02 * st)) % 1, a = u * Math.PI * 2 * 1.2 + st * 2.1 + t * 0.4;
      const ix = 0.33 + Math.cos(a) * (0.26 + 0.05 * st), iy = 0.55 + Math.sin(a) * (0.36 + 0.04 * st) + 0.04 * Math.sin(u * 9 + st);
      const [x, y] = S(ix, iy, 0.7); ps.add(x, y, st === 2 ? [0.9, 1.2, 1.6] : [1.6, 1.25, 0.7], 3 + 5 * ps.r[(i + 7) % ps.n], Math.sin(u * Math.PI) * 0.6);
    }
    // 五色光點匯入黏土
    const e = ease(sat(t / 1.4));
    C5.forEach((col, k) => {
      const a = k * 1.2566 + t * 2.4, rr = lerp(0.16, 0.012, e) * (1 - smooth(1.3, 1.5, t));
      const ix = CLAY[0] + Math.cos(a) * rr, iy = CLAY[1] - 0.02 + Math.sin(a) * rr * 0.55;
      const [x, y] = S(ix, iy, 0.75), on = smooth(0.0, 0.35, t) * (1 - smooth(1.35, 1.55, t));
      ps.add(x, y, mul(col, 2.2), 26 * c.z, on); ps.add(x, y, mul(col, 0.9), 80 * c.z, on * 0.7);
      for (let j = 1; j < 30; j++) { const a2 = a - j * 0.06, r2 = lerp(0.16, 0.012, ease(sat((t - j * 0.012) / 1.4))); const [x2, y2] = S(CLAY[0] + Math.cos(a2) * r2, CLAY[1] - 0.02 + Math.sin(a2) * r2 * 0.55, 0.75); ps.add(x2, y2, mul(col, 1.6), 10 * c.z * (1 - j / 30), on * (1 - j / 30)); }
    });
    // 黏土光暈（合一後發光、揉捏脈動）
    const [cxs, cys] = S(CLAY[0], CLAY[1] - 0.01, 0.75);
    const glowK = smooth(1.2, 2.1, t) * (1 + 0.15 * Math.sin(t * 11));
    ps.add(cxs, cys, [1.6, 1.3, 0.9], 220 * c.z * (0.4 + glowK), 0.25 + 0.45 * glowK);
    ps.add(cxs, cys, [2.2, 1.9, 1.5], 70 * c.z * (0.5 + glowK), 0.3 + 0.6 * glowK);
    // 生命能量：黏土 → 小人
    const [kx, ky] = S(KID[0], KID[1], 0.7);
    for (let i = 0; i < 300; i++) { const u = (ps.r[i + 11] + t * 1.1) % 1; const ix = lerp(CLAY[0], KID[0], u) + Math.sin(u * 12 + i) * 0.012 * (1 - u), iy = lerp(CLAY[1] - 0.03, KID[1] + 0.04, u); const [x, y] = S(ix, iy, 0.72); ps.add(x, y, mul(C5[i % 5], 2.0), 5 * c.z, Math.sin(u * Math.PI) * smooth(1.9, 2.2, t)); }
    const kg = smooth(2.1, 2.9, t);
    ps.add(kx, ky, [1.8, 1.5, 1.1], 260 * c.z * (0.3 + kg), kg * 0.6 + 0.1 * Math.sin(t * 16) * kg);
    ps.add(kx, ky, [2.6, 2.3, 1.9], 60 * c.z * (0.5 + kg), kg);
    ps.end();
    return { ray: [kx, ky], str: 0.15 + 0.6 * kg, thr: 1.0 };
  }
  function updS2(t) {
    const c = clampCam(Object.assign(Cam(), keys([[3.0, 1.25, 0.5, 0.6], [3.8, 1.2, 0.5, 0.55], [4.9, 1.1, 0.505, 0.45], [5.5, 1.04, 0.5, 0.48], [6.0, 1.03, 0.5, 0.5]], t)));
    const shk = 0.0025 * smooth(3.0, 3.2, t) * (1 - smooth(3.8, 4.3, t)) + 0.004 * gauss(t, 5.36, 0.1);
    c.cx += shk * Math.sin(t * 53); c.cy += shk * Math.sin(t * 41 + 1); c.px = 0.008 * Math.sin(t * 0.7); c.py = 0.01 * (t - 3) / 3;
    setCam(S2.pl, c);
    const u = S2.pl.m.uniforms;
    const open = smooth(3.0, 3.5, t), heal = smooth(4.85, 5.4, t), gold = smooth(5.25, 5.95, t);
    const front = lerp(0.53, 0.14, ease(sat((t - 3.62) / (4.95 - 3.62))));
    u.uFront.value = front; u.uOpen.value = open; u.uHeal.value = heal; u.uGold.value = gold; u.uDorm.value = 1;
    const ps = S2.ps; ps.begin();
    const S = (ix, iy, dp) => toS(c, ix, iy, dp == null ? 0.5 : dp);
    // 手上凝聚五色
    HANDS.forEach((h, hi) => {
      const [hx, hy] = S(h[0], h[1] - 0.01, 0.8), g = smooth(3.05, 3.5, t) * (1 - smooth(3.75, 4.1, t) * 0.7);
      ps.add(hx, hy, [2, 1.8, 1.4], 120 * c.z, g * 0.8);
      C5.forEach((col, k) => { const a = k * 1.2566 + t * 8 + hi; const r = 0.035 * (1 - smooth(3.1, 3.62, t)) + 0.006; const [x, y] = S(h[0] + Math.cos(a) * r, h[1] - 0.01 + Math.sin(a) * r * 1.6, 0.8); ps.add(x, y, mul(col, 2.2), 22 * c.z, smooth(3.05, 3.3, t) * (1 - smooth(3.65, 3.85, t))); });
    });
    // 光帶前端火花
    if (t > 3.6 && t < 5.1) for (let i = 0; i < 700; i++) { const r = ps.r; const ix = 0.4 + 0.2 * r[i] + 0.04 * Math.sin(front * 20 + i); const iy = front + r[i + 700] * 0.05 - 0.01; const [x, y] = S(ix, iy, 0.3); ps.add(x, y, mul(C5[i % 5], 2), 4 + 6 * r[i + 1400], (1 - r[i + 700]) * 0.9); }
    // 裂縫灑落火星
    for (let i = 0; i < 600; i++) { const r = ps.r; const f = (r[i + 2000] + t * 0.35) % 1; const ix = 0.05 + r[i + 2600] * 0.9, iy = 0.08 + 0.15 * Math.abs(Math.sin(ix * 7)) + f * 0.35; const [x, y] = S(ix, iy, 0.2); ps.add(x, y, [2.2, 0.9, 0.35], 3 + 4 * r[i + 3200], open * (1 - heal) * (1 - f) * 0.8); }
    // 補天：金色光點與光環
    const [kx, ky] = S(CRACK[0], CRACK[1], 0.2);
    ps.add(kx, ky, [2.4, 2.0, 1.4], 500 * c.z, gauss(t, 5.38, 0.15) * 1.0 + gold * 0.12);
    const rr = smooth(5.3, 6.0, t);
    if (t > 5.3) for (let i = 0; i < 240; i++) { const a = i / 240 * Math.PI * 2; const R = 0.02 + rr * 0.9; ps.add(kx + Math.cos(a) * R * 0.5625, ky + Math.sin(a) * R * 0.5, [2.2, 1.8, 1.1], 14, (1 - rr) * 0.9); }
    for (let i = 0; i < 500; i++) { const r = ps.r; const f = (r[i + 4000] + t * 0.25) % 1; const [x, y] = S(r[i + 4500], r[i + 4100] - f * 0.2 + 0.2, 0.3); ps.add(x, y, [1.9, 1.6, 1.0], 3 + 5 * r[i + 4700], gold * Math.sin(f * Math.PI)); }
    ps.end();
    return { ray: [kx, ky], str: 0.2 + 1.4 * gauss(t, 5.4, 0.15) + 0.4 * (front < 0.5 && t < 5 ? 1 : 0) * 0.5, thr: 1.0 };
  }
  function orbPos(k, t) {
    const a0 = -Math.PI / 2 + k * Math.PI * 2 / 5;
    if (t < 7.4) { const e = ease(sat((t - 6.0) / 1.4)); const a = a0 + (1 - e) * 2.4; return [HALL[0] + Math.cos(a) * lerp(0.42, 0.2, e), lerp(-0.12, HALL[1] + Math.sin(a) * 0.07, e)]; }
    if (t < 8.0) { const e = ease(sat((t - 7.4) / 0.6)); const a = a0 + (t - 7.4) * 4; return [HALL[0] + Math.cos(a) * lerp(0.2, 0.004, e), HALL[1] + Math.sin(a) * lerp(0.07, 0.002, e)]; }
    if (t < 8.35) return HALL.slice();
    const B = [BLD[0][0], BLD[0][1] - 0.075];
    if (k === 1) { B[0] = BLD[1][0]; B[1] = BLD[1][1] - 0.075; } else if (k === 2) { B[0] = BLD[2][0]; B[1] = BLD[2][1] - 0.075; } else if (k === 3) { B[0] = BLD[3][0]; B[1] = BLD[3][1] - 0.075; } else if (k === 4) { B[0] = BLD[4][0]; B[1] = BLD[4][1] - 0.075; }
    const hov = [B[0], B[1] + 0.008 * Math.sin(t * 2 + k)];
    if (t < 9.6) { const e = ease(sat((t - 8.35) / 1.25)); return [lerp(HALL[0], hov[0], e), lerp(HALL[1], hov[1], e) - Math.sin(Math.PI * e) * 0.12]; }
    const a = a0 + 0.35 * Math.max(0, t - 10.9), orb = [0.5 + Math.cos(a) * 0.37, 0.43 + Math.sin(a) * 0.1];
    const e2 = ease(sat((t - 10.9) / 1.1)); return [lerp(hov[0], orb[0], e2), lerp(hov[1], orb[1], e2)];
  }
  function updS3(t) {
    const c = clampCam(Object.assign(Cam(), keys([[6.0, 1.34, 0.5, 0.34], [8.0, 1.24, 0.5, 0.4], [10.0, 1.08, 0.5, 0.47], [11.0, 1.02, 0.5, 0.5], [15.0, 1.05, 0.5, 0.5]], t)));
    c.px = 0.012 * Math.sin(t * 0.45 + 1) * (1 - smooth(11, 12, t) * 0.5); c.py = 0.006 * Math.sin(t * 0.35);
    c.cx += 0.0018 * gauss(t, 8.05, 0.12) * Math.sin(t * 60);
    setCam(S3.pl, c);
    const u = S3.pl.m.uniforms;
    u.uRev.value = t < 8.0 ? -0.2 : lerp(0.0, 1.45, ease(sat((t - 8.0) / 2.5)));
    u.uEdge.value = 1 - smooth(10.2, 10.9, t); u.uWarm.value = lerp(0.9, 1.02, smooth(8.0, 10.0, t)); u.uDay.value = smooth(8.0, 10.0, t);
    u.uRing.value = smooth(7.3, 8.0, t) * (t < 8.4 ? 1 : 1 - smooth(8.0, 8.6, t));
    u.uMist.value = smooth(8.4, 9.2, t) * (1 - smooth(9.6, 11.0, t)) * 0.0;
    const ps = S3.ps; ps.begin();
    const S = (ix, iy, dp) => toS(c, ix, iy, dp == null ? smooth(0.3, 0.95, iy) : dp);
    const zs = c.z;
    // 光塵
    for (let i = 0; i < 500; i++) { const r = ps.r; const ix = r[i], iy = (r[i + 500] - t * 0.006 * (0.5 + r[i + 1000]) + 2) % 1; const [x, y] = S(ix, iy, 0.5); ps.add(x, y, [1.4, 1.3, 1.0], 2 + 4 * r[i + 1500], 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + i))); }
    // 元素光球
    const vis = !(t >= 8.0 && t < 8.35);
    ELEM.forEach((col, k) => {
      if (!vis) return;
      const p = orbPos(k, t), [x, y] = S(p[0], p[1], 0.55);
      const inten = 1 + 0.6 * smooth(7.4, 8.0, t);
      ps.add(x, y, mul(col, 0.45), 320 * zs, 0.8 * inten); ps.add(x, y, mul(col, 1.0), 120 * zs, inten); ps.add(x, y, mul(col, 1.6), 46 * zs, 1); ps.add(x, y, [2.4, 2.4, 2.4], 16 * zs, 1);
      for (let j = 1; j <= 40; j++) { const lag = j * 0.014; if (t - lag < 6.0 || (t - lag >= 7.99 && t - lag < 8.36)) break; const q = orbPos(k, t - lag), [x2, y2] = S(q[0], q[1], 0.55); ps.add(x2, y2, mul(col, 1.8), 20 * zs * (1 - j / 42), (1 - j / 41) * 0.8); }
      for (let i = 0; i < 70; i++) {
        const r1 = ps.r[(k * 70 + i) % ps.n], r2 = ps.r[(k * 70 + i + 900) % ps.n], r3 = ps.r[(k * 70 + i + 1900) % ps.n];
        let dx, dy, sz = 7, al = 0.9, cc = mul(col, 2.2);
        if (k === 2) { const life = (r1 + t * 1.3) % 1; dx = (r2 - 0.5) * 30 * (1 - life); dy = life * 70; sz = 10 * (1 - life) + 2; al = 1 - life; cc = [2.6, 1.1 + 0.7 * (1 - life), 0.3]; }
        else if (k === 1) { const a = r1 * 6.283 + t * (1.6 + r2); dx = Math.cos(a) * 45; dy = Math.sin(a) * 14 + Math.sin(a * 2 + t) * 6; }
        else if (k === 3) { const a = r1 * 6.283 + t * (3 + 2 * r2); const rr = 18 + r3 * 40; dx = Math.cos(a) * rr; dy = Math.sin(a) * rr * 0.5 + (r2 - 0.5) * 20; sz = 5; }
        else if (k === 0) { const a = r1 * 6.283 + t * 0.9; const rr = 28 + 18 * r3; dx = Math.cos(a) * rr; dy = Math.sin(a) * rr * 0.4; sz = 8; cc = [2.0, 1.3, 0.5]; }
        else { const life = (r1 + t * 0.8) % 1; const a = r2 * 6.283; dx = Math.cos(a) * life * 70; dy = Math.sin(a) * life * 70; sz = 8 * (1 - life) + 2; al = 1 - life; cc = [2.6, 2.4, 1.9]; }
        ps.add(x + dx * zs / 1920, y + dy * zs / 1080, cc, sz * zs, al);
      }
    });
    // 匯聚光點與爆發
    const [hx, hy] = S(HALL[0], HALL[1], 0.55);
    ps.add(hx, hy, [2.4, 2.1, 1.6], 160 * zs, smooth(7.5, 8.0, t) * (t < 8.05 ? 1 : 0));
    ps.add(hx, hy, [2.6, 2.3, 1.8], 900 * zs * smooth(7.95, 8.6, t), gauss(t, 8.08, 0.18) * 1.1);
    const sk = smooth(8.0, 8.9, t);
    if (t > 8.0 && t < 9.0) for (let i = 0; i < 260; i++) { const a = i / 260 * Math.PI * 2; ps.add(hx + Math.cos(a) * sk * 0.75, hy + Math.sin(a) * sk * 0.18, [1.4, 2.2, 2.8], 16, (1 - sk)); }
    // 學院生成時往上升的五色能量
    const on = smooth(8.0, 8.4, t) * (1 - smooth(10.2, 11.0, t));
    for (let i = 0; i < 1200; i++) { const r = ps.r; const life = (r[i + 2000] + t * 0.5) % 1; const ix = 0.08 + r[i + 3000] * 0.84, iy0 = 0.35 + r[i + 4000] * 0.45; const [x, y] = S(ix, iy0 - life * 0.25, 0.5); ps.add(x, y, mul(ELEM[i % 5], 2.0), 4 + 5 * r[i + 5000], Math.sin(life * Math.PI) * on * 0.8); }
    ps.end();
    const [sx, sy] = S(0.5, 0.13, 0.4);
    return { ray: t < 9 ? [hx, hy] : [sx, sy], str: 0.1 + 1.0 * gauss(t, 8.08, 0.25), thr: 1.0 };
  }

  // ---------- 品牌文字 ----------
  function textCanvas(draw) { const c = document.createElement("canvas"); c.width = 1920; c.height = 1080; const g = c.getContext("2d"); draw(g); const tx = new T.CanvasTexture(c); tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; return tx; }
  function buildText() {
    const gold = g => { const gr = g.createLinearGradient(0, 210, 0, 345); gr.addColorStop(0, "#fff6d6"); gr.addColorStop(0.45, "#ffd77e"); gr.addColorStop(1, "#d8963a"); return gr; };
    finalPass.uniforms.tT1.value = textCanvas(g => {
      g.textAlign = "center"; g.font = "700 128px Cardo"; g.letterSpacing = "6px";
      g.shadowColor = "rgba(20,8,40,.85)"; g.shadowBlur = 28; g.fillStyle = "#2a1a10"; g.fillText("SWT MindFlow", 960, 330);
      g.shadowColor = "rgba(255,190,90,.55)"; g.shadowBlur = 30; g.fillStyle = gold(g); g.fillText("SWT MindFlow", 960, 330);
      g.shadowBlur = 0; g.lineWidth = 1.2; g.strokeStyle = "rgba(255,250,230,.6)"; g.strokeText("SWT MindFlow", 960, 330);
    });
    finalPass.uniforms.tT2.value = textCanvas(g => {
      g.textAlign = "center"; const y = 378; const lg = g.createLinearGradient(560, 0, 1360, 0); lg.addColorStop(0, "rgba(255,210,130,0)"); lg.addColorStop(0.5, "rgba(255,215,140,.95)"); lg.addColorStop(1, "rgba(255,210,130,0)");
      g.fillStyle = lg; g.fillRect(560, y - 1.5, 800, 3);
      ["#2fe0cf", "#ff5a3e", "#ffc63a", "#ffffff", "#9a6cff"].forEach((c, i) => { g.shadowColor = c; g.shadowBlur = 14; g.fillStyle = c; g.beginPath(); g.arc(960 + (i - 2) * 46, y, 7, 0, 6.283); g.fill(); });
      g.font = '700 104px "Noto Serif CJK TC"'; g.letterSpacing = "26px";
      g.shadowColor = "rgba(20,8,40,.9)"; g.shadowBlur = 26; g.fillStyle = "#fffaf0"; g.fillText("身心智慧學院", 973, 508);
      g.shadowColor = "rgba(255,200,110,.5)"; g.shadowBlur = 30; g.fillText("身心智慧學院", 973, 508);
    });
    finalPass.uniforms.tT3.value = textCanvas(g => {
      g.textAlign = "center"; g.font = '600 46px "Noto Serif CJK TC"'; g.letterSpacing = "8px";
      g.shadowColor = "rgba(15,6,30,.95)"; g.shadowBlur = 20; g.fillStyle = "#fff3d2"; g.fillText("創造自己・探索智慧・成就無限可能", 964, 596); g.fillText("創造自己・探索智慧・成就無限可能", 964, 596);
    });
  }

  window.renderAt = function (t) {
    time.value = t;
    let S, info;
    if (t < 3.0) { S = S1; info = updS1(t); } else if (t < 6.0) { S = S2; info = updS2(t); } else { S = S3; info = updS3(t); }
    renderPass.scene = S.scene;
    rays.uniforms.uLight.value.set(info.ray[0], info.ray[1]); rays.uniforms.uStr.value = Q.norays ? 0 : info.str; rays.uniforms.uThr.value = info.thr; rays.uniforms.uSeed.value = (t * 30) % 97;
    const fl = 6 * gauss(t, 2.99, 0.07) + 1.6 * gauss(t, 5.37, 0.09) + 4.2 * gauss(t, 6.0, 0.07) + 1.4 * gauss(t, 8.06, 0.1);
    finalPass.uniforms.uFlash.value.set(fl, fl * 0.9, fl * 0.75);
    finalPass.uniforms.uFade.value = 1 - smooth(0.0, 0.55, t);
    finalPass.uniforms.uDark.value = 0.5 * smooth(10.9, 11.9, t);
    finalPass.uniforms.uSeed.value = (t * 213.9) % 101;
    finalPass.uniforms.uO.value.set(smooth(11.25, 11.95, t), smooth(11.8, 12.5, t), smooth(12.4, 13.1, t));
    bloom.strength = 0.45; bloom.threshold = 1.0;
    composer.render();
  };
  window.filmReady = (async function () {
    try { await Promise.all([document.fonts.load('700 104px "Noto Serif CJK TC"', "身心智慧學院創造自己探索成就無限可能・"), document.fonts.load('600 46px "Noto Serif CJK TC"', "創造自己"), document.fonts.load("700 128px Cardo", "SWT MindFlow")]); } catch (e) { }
    await build();
    [0.5, 3.5, 9].forEach(t => window.renderAt(t));
    return true;
  })();
})();
