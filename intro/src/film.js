/* SWT MindFlow 身心智慧學院 — 15 秒開場序章（離線逐格渲染用）
 * Three.js r128，全部以程式建模；window.renderAt(t) 畫出第 t 秒的一格。
 * 場景：1 女媧造人(0–3) 2 五色補天(3–6) 3 學院誕生(6–11) 4 品牌與邀請(11–15)
 */
(function () {
  "use strict";
  const Q = Object.fromEntries(new URLSearchParams(location.search));
  const W = +Q.w || 1920, H = +Q.h || 1080;
  const T = THREE;
  // 所有十六進位色碼視為 sRGB，轉成線性空間再計算光照（最後一道後製才做 gamma）
  { const sh = T.Color.prototype.setHex, ss = T.Color.prototype.setStyle;
    T.Color.prototype.setHex = function (h) { sh.call(this, h); return this.convertSRGBToLinear(); };
    T.Color.prototype.setStyle = function (st) { if (/^#/.test(st)) { ss.call(this, st); return this.convertSRGBToLinear(); } return ss.call(this, st); }; }
  let seed = 20261128;
  function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const R = (a, b) => a + (b - a) * rnd();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sat = x => clamp(x, 0, 1);
  const smooth = (a, b, x) => { x = sat((x - a) / (b - a)); return x * x * (3 - 2 * x); };
  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  const gauss = (t, c, s) => Math.exp(-0.5 * ((t - c) / s) * ((t - c) / s));

  // ---------- JS 雜訊（島嶼地形用）----------
  function h3(x, y, z) { let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
      L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
  }
  const vfbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.14;

  const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
 const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
 vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
 i=mod289(i);
 vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
 float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
 vec4 j=p-49.0*floor(p*ns.z*ns.z);
 vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
 vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
 vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
 return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return f;}
float fbm3(vec3 p){float f=0.,a=.5;for(int i=0;i<3;i++){f+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return f;}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
`;

  // ---------- 渲染器與後製 ----------
  const renderer = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.outputEncoding = T.LinearEncoding; renderer.toneMapping = T.NoToneMapping;
  document.body.appendChild(renderer.domElement);
  const GL2 = renderer.capabilities.isWebGL2;
  const rtOpts = { type: T.HalfFloatType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
  let rt;
  if (GL2 && !Q.nomsaa) { rt = new T.WebGLMultisampleRenderTarget(W, H, rtOpts); rt.samples = 4; } else rt = new T.WebGLRenderTarget(W, H, rtOpts);
  const composer = new T.EffectComposer(renderer, rt);
  const renderPass = new T.RenderPass(new T.Scene(), new T.PerspectiveCamera());
  composer.addPass(renderPass);

  const rays = new T.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uLight: { value: new T.Vector2(0.5, 0.5) }, uStr: { value: 0 }, uThr: { value: 1.0 }, uDecay: { value: 0.955 }, uDen: { value: 0.75 }, uSeed: { value: 0 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D tDiffuse;uniform vec2 uLight;uniform float uStr,uThr,uDecay,uDen,uSeed;varying vec2 vUv;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){vec3 base=texture2D(tDiffuse,vUv).rgb; if(uStr<=0.001){gl_FragColor=vec4(base,1.);return;}
vec2 d=(vUv-uLight)*(uDen/40.0); vec2 c=vUv-d*hash12(vUv*1000.+uSeed); float il=1.; vec3 acc=vec3(0.);
for(int i=0;i<40;i++){c-=d; vec3 s=texture2D(tDiffuse,c).rgb; s=max(s-vec3(uThr),0.); acc+=s*il; il*=uDecay;}
gl_FragColor=vec4(base+acc*uStr/40.0,1.);}`
  });
  composer.addPass(rays);
  const bloom = new T.UnrealBloomPass(new T.Vector2(W, H), 0.4, 0.45, 0.9);
  composer.addPass(bloom);

  function textCanvas(draw) { const c = document.createElement("canvas"); c.width = 1920; c.height = 1080; const g = c.getContext("2d"); draw(g); const tx = new T.CanvasTexture(c); tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; return tx; }
  const finalPass = new T.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uExp: { value: 1 }, uFlash: { value: new T.Vector3() }, uFade: { value: 1 }, uVig: { value: 0.55 }, uSeed: { value: 0 }, uDark: { value: 0 },
      tT1: { value: null }, tT2: { value: null }, tT3: { value: null }, uO: { value: new T.Vector3() }, uRes: { value: new T.Vector2(W, H) }
    },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D tDiffuse,tT1,tT2,tT3;uniform float uExp,uFade,uVig,uSeed,uDark;uniform vec3 uFlash,uO;uniform vec2 uRes;varying vec2 vUv;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}
vec3 over(vec3 c, sampler2D t, float o, vec2 uv){ if(o<=0.001) return c; vec4 s=texture2D(t, uv+vec2(0.,-(1.-o)*0.012)); return mix(c, s.rgb, s.a*o); }
void main(){vec2 uv=vUv; vec2 dc=uv-.5; float r2=dot(dc,dc);
vec3 col; col.r=texture2D(tDiffuse,uv-dc*r2*0.012).r; col.g=texture2D(tDiffuse,uv).g; col.b=texture2D(tDiffuse,uv+dc*r2*0.012).b;
col=col*uExp+uFlash;
col=aces(col);
col=pow(col,vec3(1./2.2));
float l=dot(col,vec3(.299,.587,.114));
col=mix(col, col*vec3(0.94,0.98,1.08), smoothstep(0.5,0.0,l)*0.6);
col=mix(col, col*vec3(1.05,1.0,0.92), smoothstep(0.5,1.0,l)*0.5);
col*=mix(1., smoothstep(1.05,0.3,length(dc*vec2(1.,.82))*1.15), uVig);
col*=1.-uDark*smoothstep(0.6,0.0,length((dc-vec2(0.,0.08))*vec2(0.8,2.0)));
col=over(col,tT1,uO.x,uv); col=over(col,tT2,uO.y,uv); col=over(col,tT3,uO.z,uv);
col+=(hash12(uv*uRes+uSeed)-.5)*0.028;
col*=1.-uFade;
gl_FragColor=vec4(clamp(col,0.,1.),1.);}`
  });
  composer.addPass(finalPass);

  // ---------- 共用素材 ----------
  const time = { value: 0 };
  const PX = { value: 1 };
  const GT = (function () { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,255,255,.6)"); gr.addColorStop(0.45, "rgba(255,255,255,.14)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new T.CanvasTexture(c); })();
  const FLARE = (function () { const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d"); g.translate(256, 256); for (let k = 0; k < 2; k++) { g.save(); g.rotate(k * Math.PI / 2); const gr = g.createLinearGradient(-256, 0, 256, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(-256, -3, 512, 6); g.restore(); } const gr2 = g.createRadialGradient(0, 0, 0, 0, 0, 90); gr2.addColorStop(0, "rgba(255,255,255,1)"); gr2.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr2; g.fillRect(-90, -90, 180, 180); return new T.CanvasTexture(c); })();
  const CLOUD = (function () { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); let s = 77; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 46; i++) { const x = 128 + (r() - 0.5) * 120, y = 140 + (r() - 0.5) * 60, rr = 25 + r() * 45; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, "rgba(255,255,255,.22)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } return new T.CanvasTexture(c); })();
  function glow(color, size, inten, tex) { const m = new T.SpriteMaterial({ map: tex || GT, color: new T.Color(color).multiplyScalar(inten || 1), blending: T.AdditiveBlending, depthWrite: false, transparent: true }); const s = new T.Sprite(m); s.scale.set(size, size, 1); return s; }
  const HDR = (hex, k) => new T.Color(hex).multiplyScalar(k);

  // 點粒子系統（CPU 更新）
  const PV = `attribute float aSize;attribute vec3 aColor;attribute float aAlpha;uniform float uPx;varying vec3 vC;varying float vA;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float ps=aSize*uPx/max(-mv.z,0.001);gl_PointSize=clamp(ps,1.,220.);vC=aColor;vA=aAlpha*min(ps*ps,1.);}`;
  const PF = `varying vec3 vC;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c)*2.;if(d>1.)discard;float a=exp(-d*d*5.)*0.8+exp(-d*d*40.)*0.6;gl_FragColor=vec4(vC*a*vA,1.);}`;
  class PS {
    constructor(n, parent) {
      this.n = n; const g = new T.BufferGeometry();
      this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.s = new Float32Array(n); this.a = new Float32Array(n);
      g.setAttribute("position", new T.BufferAttribute(this.p, 3)); g.setAttribute("aColor", new T.BufferAttribute(this.c, 3));
      g.setAttribute("aSize", new T.BufferAttribute(this.s, 1)); g.setAttribute("aAlpha", new T.BufferAttribute(this.a, 1));
      this.g = g;
      this.m = new T.ShaderMaterial({ uniforms: { uPx: PX }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      this.o = new T.Points(g, this.m); this.o.frustumCulled = false; parent.add(this.o);
      this.r = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) this.r[i] = rnd();
    }
    set(i, x, y, z, col, size, alpha) { const j = i * 3; this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.c[j] = col.r; this.c[j + 1] = col.g; this.c[j + 2] = col.b; this.s[i] = size; this.a[i] = alpha; }
    done() { for (const k of ["position", "aColor", "aSize", "aAlpha"]) this.g.attributes[k].needsUpdate = true; }
  }

  // 可變半徑管（每格可更新）
  function makeTube(n, m, mat, parent) {
    const pos = new Float32Array(n * (m + 1) * 3), uv = new Float32Array(n * (m + 1) * 2), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) { const k = i * (m + 1) + j; uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = j / m; }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setIndex(idx);
    const mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; parent.add(mesh);
    const tg = V3(), nn = V3(), bb = V3(), tmp = V3();
    return {
      mesh, update(P, Rr) {
        let prevN = null;
        for (let i = 0; i < n; i++) {
          const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; tg.subVectors(b, a).normalize();
          if (!prevN) { tmp.set(0, 1, 0); if (Math.abs(tg.dot(tmp)) > 0.9) tmp.set(1, 0, 0); nn.crossVectors(tg, tmp).normalize(); }
          else { nn.copy(prevN).sub(tmp.copy(tg).multiplyScalar(prevN.dot(tg))).normalize(); }
          prevN = (prevN || V3()).copy(nn); bb.crossVectors(tg, nn).normalize();
          for (let j = 0; j <= m; j++) {
            const an = (j / m) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an), k = (i * (m + 1) + j) * 3;
            pos[k] = P[i].x + (nn.x * c + bb.x * s) * Rr[i]; pos[k + 1] = P[i].y + (nn.y * c + bb.y * s) * Rr[i]; pos[k + 2] = P[i].z + (nn.z * c + bb.z * s) * Rr[i];
          }
        }
        g.attributes.position.needsUpdate = true; g.computeVertexNormals();
      }
    };
  }
  // 絲帶（披帛）
  function makeStrip(n, mat, parent) {
    const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n; i++) { uv[i * 4] = i / (n - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (n - 1); uv[i * 4 + 3] = 1; }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setIndex(idx);
    const mesh = new T.Mesh(g, mat); mesh.frustumCulled = false; parent.add(mesh);
    return { mesh, update(P, S, Wd) { for (let i = 0; i < n; i++) { const k = i * 6; pos[k] = P[i].x - S[i].x * Wd[i]; pos[k + 1] = P[i].y - S[i].y * Wd[i]; pos[k + 2] = P[i].z - S[i].z * Wd[i]; pos[k + 3] = P[i].x + S[i].x * Wd[i]; pos[k + 4] = P[i].y + S[i].y * Wd[i]; pos[k + 5] = P[i].z + S[i].z * Wd[i]; } g.attributes.position.needsUpdate = true; g.computeVertexNormals(); } };
  }

  // 神性材質：背光輪廓＋流光
  const SPV = `uniform float uTime,uFlutter;varying vec3 vN,vW;varying vec2 vUv;${NOISE}
void main(){vec3 p=position;
 if(uFlutter>0.){float b=clamp((1.42-p.y)/1.42,0.,1.);float a=atan(p.z,p.x);
  p+=normal*(sin(p.y*9.-uTime*3.2+a*3.)*0.01+snoise(vec3(p.x*3.,p.y*2.-uTime*.8,p.z*3.))*0.028)*b*uFlutter;
  p.y+=sin(a*7.+uTime*2.3)*0.03*b*b*b*uFlutter;}
 vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vUv=uv;gl_Position=projectionMatrix*viewMatrix*w;}`;
  const SPF = `uniform vec3 uBase,uRim,uFlowCol,uKey,uFillPos,uFillCol;uniform float uRimPow,uRimStr,uFlow,uTime,uOpacity,uScale,uGlow,uFill;varying vec3 vN,vW;varying vec2 vUv;${NOISE}
void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);if(dot(N,V)<0.)N=-N;
 float fr=pow(1.-clamp(dot(N,V),0.,1.),uRimPow);
 float dif=clamp(dot(N,normalize(uKey))*.5+.5,0.,1.);
 vec3 col=uBase*(0.18+0.82*dif*dif)+uRim*fr*uRimStr*(0.25+0.75*dif*dif);
 if(uFlow>0.){float fl=fbm3(vW*2.6+vec3(0.,-uTime*.55,uTime*.2));col+=uFlowCol*smoothstep(.2,.75,fl)*uFlow;}
 if(uScale>0.){vec2 sc=vec2(vUv.x*uScale,vUv.y*14.);vec2 f=fract(sc+vec2(0.,floor(sc.x)*.5));float s=smoothstep(.0,.3,f.y)*smoothstep(1.,.7,f.y)*smoothstep(0.,.3,f.x);col+=uRim*(1.-s)*.5*(0.3+fr);}
 if(uFill>0.){vec3 L=uFillPos-vW;float d=length(L);col+=uFillCol*uFill*0.22*pow(clamp(dot(N,L/d),0.,1.),2.)/(1.+d*d*400.);}
 col+=uRim*uGlow;
 gl_FragColor=vec4(col,uOpacity);
 #ifdef DBG
 gl_FragColor=vec4(fr,dif,0.,1.);
 #endif
}`;
  function spiritMat(o) {
    return new T.ShaderMaterial({
      uniforms: {
        uBase: { value: new T.Color(o.base) }, uRim: { value: HDR(o.rim, 1) }, uRimPow: { value: o.rimPow || 2.5 }, uRimStr: { value: o.rimStr || 2 },
        uFlowCol: { value: new T.Color(o.flow || 0) }, uFlow: { value: o.flowStr || 0 }, uKey: { value: (o.key || V3(-0.4, 0.75, -0.6)).clone().normalize() },
        uTime: time, uOpacity: { value: o.opacity == null ? 1 : o.opacity }, uFlutter: { value: o.flutter || 0 }, uScale: { value: o.scale || 0 }, uGlow: { value: o.glow || 0 },
        uFill: { value: 0 }, uFillPos: { value: V3() }, uFillCol: { value: new T.Color(1, 0.62, 0.35) }
      },
      vertexShader: SPV, fragmentShader: SPF, defines: Q.dbg ? { DBG: 1 } : {}, side: o.side == null ? T.DoubleSide : o.side,
      transparent: (o.opacity != null && o.opacity < 1) || !!o.blending, depthWrite: o.depthWrite == null ? true : o.depthWrite, blending: o.blending || T.NormalBlending
    });
  }

  // 星雲天球
  function makeNebula(o) {
    const m = new T.ShaderMaterial({
      uniforms: { uTime: time, uGold: { value: 0 }, uRed: { value: 0 }, cA: { value: new T.Color(o.a) }, cB: { value: new T.Color(o.b) }, cC: { value: new T.Color(o.c) }, cG: { value: HDR(o.g, 1) }, cR: { value: HDR("#ff3a1a", 1) }, uBright: { value: o.bright || 1 } },
      vertexShader: "varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform float uTime,uGold,uRed,uBright;uniform vec3 cA,cB,cC,cG,cR;varying vec3 vD;${NOISE}
void main(){vec3 d=normalize(vD);
 float n1=fbm(d*1.8+vec3(0.,uTime*.03,0.));
 float n2=fbm(d*4.2+vec3(n1*1.6,0.,uTime*.025));
 float neb=smoothstep(-.35,.75,n1*.75+n2*.45);
 vec3 col=mix(cA,cB,neb);
 col=mix(col,cC,smoothstep(.35,.9,n2)*.8);
 float vein=pow(1.-clamp(abs(n2-.18)*3.,0.,1.),12.);
 col+=cG*vein*(.5+uGold*1.6)*smoothstep(.3,.9,neb)*1.4;
 col*=.35+.9*neb;
 col=mix(col,cR*(.25+.6*neb),uRed*smoothstep(.2,.9,d.y*.5+.6)*.55);
 col=mix(col,cG*(.25+.9*neb)+vec3(.3,.15,.05),uGold*.6);
 gl_FragColor=vec4(col*uBright,1.);}`,
      side: T.BackSide, depthWrite: false
    });
    const s = new T.Mesh(new T.SphereGeometry(900, 64, 32), m); s.renderOrder = -10; return s;
  }
  function makeStars(parent, n, rad) {
    const ps = new PS(n, parent);
    const cols = [HDR("#ffffff", 1.6), HDR("#a9c6ff", 1.8), HDR("#ffd59a", 1.8)];
    for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); ps.set(i, Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad, cols[i % 3], (rnd() < 0.03 ? 5 : R(0.9, 2.6)) * rad / 600, 1); }
    ps.done(); ps.base = ps.a.slice();
    ps.tw = t => { for (let i = 0; i < n; i++) ps.a[i] = ps.base[i] * (0.55 + 0.45 * Math.sin(t * (1.5 + ps.r[i] * 4) + ps.r[i + n] * 40)); ps.g.attributes.aAlpha.needsUpdate = true; };
    return ps;
  }

  // ---------- 女媧 ----------
  function Goddess(parent) {
    const g = new T.Group(); parent.add(g);
    const gownMat = spiritMat({ base: "#2c2160", rim: "#ffc978", rimPow: 3.6, rimStr: 3.2, flow: "#55c8ff", flowStr: 0.4, flutter: 1 });
    const prof = [[0.04, 1.555], [0.058, 1.5], [0.14, 1.462], [0.185, 1.43], [0.19, 1.38], [0.165, 1.28], [0.14, 1.17], [0.128, 1.1], [0.15, 1.0], [0.19, 0.86], [0.245, 0.62], [0.32, 0.38], [0.41, 0.16], [0.52, 0.02], [0.5, -0.01]];
    const lg = new T.LatheGeometry(prof.map(p => new T.Vector2(p[0], p[1])), 96);
    const gown = new T.Mesh(lg, gownMat); gown.scale.set(1.08, 1, 0.82); g.add(gown);
    const silk = new T.Mesh(lg, spiritMat({ base: "#000000", rim: "#ff9fd0", rimPow: 3.0, rimStr: 0.7, flutter: 1.6, blending: T.AdditiveBlending, depthWrite: false }));
    silk.scale.set(1.15, 1.01, 0.9); g.add(silk);
    const skin = spiritMat({ base: "#6a4a40", rim: "#ffe3b0", rimPow: 3.5, rimStr: 2.2 });
    const head = new T.Mesh(new T.SphereGeometry(0.093, 48, 32), skin); head.position.set(0, 1.648, 0.006); head.scale.set(0.9, 1.12, 0.98); g.add(head);
    const hairM = spiritMat({ base: "#0d0a22", rim: "#a8b8ff", rimPow: 2.2, rimStr: 1.5 });
    const hair = new T.Mesh(new T.SphereGeometry(0.1, 40, 24), hairM); hair.position.set(0, 1.672, -0.022); hair.scale.set(0.98, 1.04, 1.02); g.add(hair);
    const bun = new T.Mesh(new T.SphereGeometry(0.062, 32, 20), hairM); bun.position.set(0, 1.792, -0.05); bun.scale.set(1, 1.25, 0.9); g.add(bun);
    const bun2 = new T.Mesh(new T.TorusGeometry(0.05, 0.022, 12, 40), hairM); bun2.position.set(0, 1.835, -0.05); g.add(bun2);
    const goldM = new T.MeshBasicMaterial({ color: HDR("#ffcf7a", 3.2) });
    for (let i = 0; i < 5; i++) { const s = new T.Mesh(new T.SphereGeometry(0.009, 12, 8), goldM); const a = -1.0 + i * 0.5; s.position.set(Math.sin(a) * 0.07, 1.8 + Math.cos(a) * 0.05, -0.01); g.add(s); }
    const pin = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.22, 6), goldM); pin.position.set(0, 1.8, -0.05); pin.rotation.z = 1.2; g.add(pin);
    const halo = new T.Mesh(new T.TorusGeometry(0.27, 0.0055, 8, 128), new T.MeshBasicMaterial({ color: HDR("#ffd58a", 3.5) })); halo.position.set(0, 1.7, -0.13); g.add(halo);
    const halo2 = new T.Mesh(new T.TorusGeometry(0.31, 0.0025, 8, 128), new T.MeshBasicMaterial({ color: HDR("#9fd8ff", 2.6) })); halo2.position.set(0, 1.7, -0.135); g.add(halo2);
    const backGlow = glow("#ffb35c", 2.6, 0.9); backGlow.position.set(0, 1.55, -0.5); g.add(backGlow);
    const backGlow2 = glow("#7d5cff", 6, 0.55); backGlow2.position.set(0, 1.1, -1.4); g.add(backGlow2);
    const sleeveM = spiritMat({ base: "#2c2160", rim: "#ffd08a", rimPow: 3.4, rimStr: 2.6, flow: "#55c8ff", flowStr: 0.3 });
    const armM = spiritMat({ base: "#3a2c70", rim: "#ffd08a", rimPow: 3.2, rimStr: 2.2 });
    const handM = skin;
    const arms = [-1, 1].map(() => ({ up: makeTube(10, 12, armM, g), fore: makeTube(10, 12, armM, g), sleeve: makeTube(14, 20, sleeveM, g), hand: (() => { const h = new T.Mesh(new T.SphereGeometry(0.027, 20, 14), handM); h.scale.set(1, 0.7, 1.35); g.add(h); return h; })() }));
    const ribM = new T.ShaderMaterial({
      uniforms: { uTime: time, uA: { value: HDR("#ffb0d0", 1.6) }, uB: { value: HDR("#8fe6ff", 1.6) }, uOp: { value: 1 } },
      vertexShader: "varying vec2 vUv;varying vec3 vN,vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: "uniform float uTime,uOp;uniform vec3 uA,uB;varying vec2 vUv;varying vec3 vN,vW;void main(){float e=abs(vUv.y-.5)*2.;vec3 V=normalize(cameraPosition-vW);float f=1.-abs(dot(normalize(vN),V));vec3 c=mix(uA,uB,vUv.x);float st=.65+.35*sin(vUv.x*60.-uTime*6.);float a=(.25+.75*pow(e,3.))*(.45+.8*f)*st*smoothstep(1.,.75,vUv.x)*smoothstep(0.,.05,vUv.x);gl_FragColor=vec4(c*a*uOp,1.);}",
      side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    const ribs = [makeStrip(150, ribM, g), makeStrip(150, ribM, g)];
    const tailM = spiritMat({ base: "#173040", rim: "#7ff0d8", rimPow: 2, rimStr: 2.2, scale: 70, flow: "#ffd27a", flowStr: 0.5 });
    const tail = makeTube(120, 18, tailM, g);
    const NT = 120, TP = [], TRr = [];
    for (let i = 0; i < NT; i++) { TP.push(V3()); TRr.push(0); }
    const NR = 150, RP = [], RS = [], RW = []; for (let i = 0; i < NR; i++) { RP.push(V3()); RS.push(V3()); RW.push(0); }
    const tg = V3(), sd = V3(), up = V3(0, 1, 0), q = new T.Quaternion();
    function armPts(side, pose, t) {
      // pose.hold: 0..1 捧著；pose.raise: 0..1 高舉；pose.c: 黏土中心；pose.k: 揉捏
      const sh = V3(side * 0.172, 1.425, -0.01);
      const ra = pose.raise || 0, k = pose.k || 0, sp = pose.spread == null ? 0.12 : pose.spread;
      const c = pose.c || V3(0, 1.27, 0.34);
      const wH = V3(c.x + side * (sp + 0.012 * Math.sin(t * 11 + (side > 0 ? 0 : 0.7)) * k), c.y - 0.012 + (pose.dy || 0), c.z - 0.01);
      const eH = V3(side * 0.27, 1.17, 0.1);
      const wR = V3(side * 0.31, 1.95, 0.17), eR = V3(side * 0.34, 1.64, 0.07);
      const w = wH.lerp(wR, ra), e = eH.lerp(eR, ra);
      return { sh, e, w };
    }
    function update(t, pose) {
      const A = [armPts(-1, pose, t), armPts(1, pose, t)];
      A.forEach((a, i) => {
        const P1 = [], R1 = [], P2 = [], R2 = [], P3 = [], R3 = [];
        for (let j = 0; j < 10; j++) { const s = j / 9; P1.push(a.sh.clone().lerp(a.e, s)); R1.push(0.047 - 0.008 * s); P2.push(a.e.clone().lerp(a.w, s)); R2.push(0.039 - 0.012 * s); }
        const droop = V3(0, -1, 0).multiplyScalar(1 - (pose.raise || 0) * 0.7);
        for (let j = 0; j < 14; j++) { const s = j / 13; const p = a.e.clone().lerp(a.w, 0.12 + s * 0.7); p.addScaledVector(droop, s * s * 0.05 + Math.sin(t * 2.2 + s * 3 + i) * 0.006 * s); P3.push(p); R3.push(0.044 + 0.034 * Math.pow(s, 1.5)); }
        arms[i].up.update(P1, R1); arms[i].fore.update(P2, R2); arms[i].sleeve.update(P3, R3); arms[i].hand.position.copy(a.w);
        arms[i].hand.lookAt(a.w.clone().add(a.w.clone().sub(a.e)));
      });
      // 蛇尾
      for (let i = 0; i < NT; i++) { const s = i / (NT - 1), an = s * 4.4 + 0.6 + Math.sin(t * 1.3 + s * 6) * 0.12, rs = 0.12 + 0.6 * s; TP[i].set(Math.cos(an) * rs, 0.3 - s * 1.75 + Math.sin(t * 1.7 + s * 9) * 0.02, Math.sin(an) * rs * 0.85 - 0.05); TRr[i] = 0.2 * Math.pow(1 - s, 0.85) + 0.006; }
      tail.update(TP, TRr);
      // 披帛
      [-1, 1].forEach((sg, ri) => {
        const a = A[ri];
        for (let i = 0; i < NR; i++) {
          const s = i / (NR - 1), p = RP[i];
          if (s < 0.22) { const u = s / 0.22; const st = V3(sg * 0.1, 1.47, -0.08); const mid = V3(sg * 0.26, 1.45, -0.06); p.copy(st).lerp(mid, u).lerp(mid.clone().lerp(a.e, u), u); p.y -= Math.sin(u * Math.PI) * 0.05; }
          else {
            const u = (s - 0.22) / 0.78 * 2.3;
            p.copy(a.e).add(V3(sg * (0.06 + 0.33 * u + 0.05 * Math.sin(u * 2.2 - t * 1.9 + ri)), -0.3 * u + 0.13 * Math.sin(u * 2.8 - t * 2.4 + sg) * Math.min(1, u), -0.5 * u + 0.17 * Math.cos(u * 2.3 - t * 2.0 + ri) * Math.min(1, u)));
            if (pose.raise) p.y += pose.raise * 0.25 * u;
          }
          RW[i] = 0.03 + 0.03 * Math.sin(Math.min(1, s * 1.3) * Math.PI) + 0.01;
        }
        for (let i = 0; i < NR; i++) {
          const a0 = RP[Math.max(0, i - 1)], b0 = RP[Math.min(NR - 1, i + 1)]; tg.subVectors(b0, a0).normalize();
          sd.crossVectors(tg, up).normalize(); const tw = (i / NR) * 3.2 + Math.sin(t * 1.4 + i * 0.05 + ri) * 0.7; q.setFromAxisAngle(tg, tw); sd.applyQuaternion(q); RS[i].copy(sd);
        }
        ribs[ri].update(RP, RS, RW);
      });
      halo.rotation.z = t * 0.2;
    }
    const mats = [gownMat, sleeveM, armM, skin, hairM, tailM];
    return { group: g, update, mats, ribM, halo, backGlow, A: (s, p, t) => armPts(s, p, t) };
  }

  // ---------- 場景 1：女媧造人 ----------
  const COLORS5 = ["#2fe0cf", "#ff4a3a", "#ffc63a", "#f6f2ff", "#8a5cff"];
  const S1 = { scene: new T.Scene(), cam: new T.PerspectiveCamera(36, W / H, 0.01, 3000) };
  (function () {
    const sc = S1.scene;
    S1.neb = makeNebula({ a: "#03041a", b: "#2a0f55", c: "#1b47a6", g: "#ffb347", bright: 1.15 }); sc.add(S1.neb);
    S1.stars = makeStars(sc, 3500, 600);
    S1.god = Goddess(sc);
    // 黏土
    const clayV = `uniform float uTime,uWob,uSeed;uniform vec3 uSq;varying vec3 vN,vW,vL;${NOISE}
void main(){vec3 p=position;float n=snoise(p*2.1+vec3(uSeed)+uTime*vec3(.9,.6,.7));p*=1.+n*uWob;p*=uSq;vL=position;vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
    const clayF = `uniform vec3 uCol,cA,cB,cC,cD,cE;uniform float uGlow,uMarble,uTime;varying vec3 vN,vW,vL;${NOISE}
void main(){vec3 N=normalize(vN);vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-clamp(dot(N,V),0.,1.),2.);
 vec3 base=uCol;
 if(uMarble>0.){float a=atan(vL.z,vL.x)+fbm3(vL*1.6+vec3(0.,uTime*.8,0.))*2.6+vL.y*2.;float b=fract(a/6.2831*5.+uTime*.15)*5.;
  vec3 m=b<1.?mix(cA,cB,smoothstep(.8,1.,b)):b<2.?mix(cB,cC,smoothstep(1.8,2.,b)):b<3.?mix(cC,cD,smoothstep(2.8,3.,b)):b<4.?mix(cD,cE,smoothstep(3.8,4.,b)):mix(cE,cA,smoothstep(4.8,5.,b));
  base=mix(base,m,uMarble);}
 float dif=clamp(dot(N,normalize(vec3(.3,.8,.6)))*.5+.5,0.,1.);
 vec3 col=base*(.25+.75*dif)*0.9+base*fr*1.6+base*uGlow;
 gl_FragColor=vec4(col,1.);}`;
    const cu = () => ({ cA: { value: HDR(COLORS5[0], 1) }, cB: { value: HDR(COLORS5[1], 1) }, cC: { value: HDR(COLORS5[2], 1) }, cD: { value: HDR(COLORS5[3], 0.9) }, cE: { value: HDR(COLORS5[4], 1) } });
    S1.blobs = COLORS5.map((c, i) => {
      const m = new T.ShaderMaterial({ uniforms: Object.assign({ uTime: time, uWob: { value: 0.22 }, uSeed: { value: i * 3.1 }, uSq: { value: V3(1, 1, 1) }, uCol: { value: HDR(c, 1) }, uGlow: { value: 0.3 }, uMarble: { value: 0 } }, cu()), vertexShader: clayV, fragmentShader: clayF });
      const b = new T.Mesh(new T.IcosahedronGeometry(1, 4), m); sc.add(b); const gl = glow(c, 0.16, 1.2); sc.add(gl); return { b, m, gl };
    });
    S1.ballM = new T.ShaderMaterial({ uniforms: Object.assign({ uTime: time, uWob: { value: 0.12 }, uSeed: { value: 9 }, uSq: { value: V3(1, 1, 1) }, uCol: { value: HDR("#ffd59a", 1) }, uGlow: { value: 0.3 }, uMarble: { value: 1 } }, cu()), vertexShader: clayV, fragmentShader: clayF });
    S1.ball = new T.Mesh(new T.IcosahedronGeometry(1, 5), S1.ballM); sc.add(S1.ball);
    S1.ballGlow = glow("#ffd9a0", 0.5, 1); sc.add(S1.ballGlow);
    // 人形（取樣點）
    const parts = [["s", V3(0, 0.215, 0), 0.023, 3], ["c", V3(0, 0.1, 0), V3(0, 0.178, 0), 0.03, 5], ["c", V3(-0.014, 0, 0), V3(-0.014, 0.1, 0), 0.012, 2], ["c", V3(0.014, 0, 0), V3(0.014, 0.1, 0), 0.012, 2], ["c", V3(-0.036, 0.176, 0), V3(-0.06, 0.1, 0.01), 0.01, 1.5], ["c", V3(0.036, 0.176, 0), V3(0.06, 0.1, 0.01), 0.01, 1.5]];
    const wsum = parts.reduce((a, p) => a + p[p.length - 1], 0);
    function samp() { let r = rnd() * wsum; let p = parts[0]; for (const q of parts) { r -= q[q.length - 1]; if (r <= 0) { p = q; break; } } const u = rnd() * 2 - 1, an = rnd() * 6.283, s = Math.sqrt(1 - u * u), d = V3(Math.cos(an) * s, u, Math.sin(an) * s); if (p[0] === "s") return p[1].clone().addScaledVector(d, p[2]); return p[1].clone().lerp(p[2], rnd()).addScaledVector(d, p[3]); }
    const NP = 4200; const g = new T.BufferGeometry(); const A = new Float32Array(NP * 3), B = new Float32Array(NP * 3), Cc = new Float32Array(NP * 3), Rn = new Float32Array(NP);
    for (let i = 0; i < NP; i++) { const u = rnd() * 2 - 1, an = rnd() * 6.283, s = Math.sqrt(1 - u * u); A[i * 3] = Math.cos(an) * s; A[i * 3 + 1] = u; A[i * 3 + 2] = Math.sin(an) * s; const b = samp(); B[i * 3] = b.x; B[i * 3 + 1] = b.y; B[i * 3 + 2] = b.z; const c = new T.Color(COLORS5[i % 5]); Cc[i * 3] = c.r; Cc[i * 3 + 1] = c.g; Cc[i * 3 + 2] = c.b; Rn[i] = rnd(); }
    g.setAttribute("position", new T.BufferAttribute(A, 3)); g.setAttribute("aB", new T.BufferAttribute(B, 3)); g.setAttribute("aCol", new T.BufferAttribute(Cc, 3)); g.setAttribute("aR", new T.BufferAttribute(Rn, 1));
    S1.morphM = new T.ShaderMaterial({
      uniforms: { uP: { value: 0 }, uPx: PX, uC: { value: V3() }, uBase: { value: V3() }, uR: { value: 0.062 }, uA: { value: 0 }, uTime: time },
      vertexShader: `attribute vec3 aB,aCol;attribute float aR;uniform float uP,uPx,uR,uA,uTime;uniform vec3 uC,uBase;varying vec3 vC;varying float vA;
void main(){float e=clamp(uP*1.35-aR*.35,0.,1.);e=e*e*(3.-2.*e);vec3 a=uC+position*uR;vec3 b=uBase+aB;vec3 m=mix(a,b,e);
 float sw=(1.-e)*e*4.;float an=(1.-e)*5.+aR*6.283;vec3 off=vec3(cos(an),sin(an*1.3)*.4,sin(an))*sw*.09*(0.5+aR);m+=off;
 vec4 mv=modelViewMatrix*vec4(m,1.);gl_Position=projectionMatrix*mv;float ps=(0.0032+0.002*aR)*uPx/max(-mv.z,.001);gl_PointSize=clamp(ps,1.,40.);
 vC=mix(aCol*1.8,vec3(2.4,1.9,1.3),e*.85)*(1.+.5*sin(uTime*20.+aR*30.));vA=uA*min(ps*ps,1.);}`,
      fragmentShader: PF, transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    S1.morph = new T.Points(g, S1.morphM); S1.morph.frustumCulled = false; sc.add(S1.morph);
    // 小人實體
    S1.kid = new T.Group(); sc.add(S1.kid);
    S1.kidM = spiritMat({ base: "#ffd7a8", rim: "#fff2d0", rimPow: 1.6, rimStr: 2.5, opacity: 0, glow: 0.5, depthWrite: false });
    for (const p of parts) { let mesh; if (p[0] === "s") { mesh = new T.Mesh(new T.SphereGeometry(p[2], 20, 14), S1.kidM); mesh.position.copy(p[1]); } else { const L = p[1].distanceTo(p[2]); mesh = new T.Mesh(new T.CylinderGeometry(p[3], p[3], L, 12, 1), S1.kidM); mesh.position.copy(p[1]).lerp(p[2], 0.5); mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), p[2].clone().sub(p[1]).normalize()); const c1 = new T.Mesh(new T.SphereGeometry(p[3], 12, 8), S1.kidM); c1.position.copy(p[1]); const c2 = c1.clone(); c2.position.copy(p[2]); S1.kid.add(c1, c2); } S1.kid.add(mesh); }
    S1.kidGlow = glow("#ffe2b0", 0.6, 1); sc.add(S1.kidGlow);
    S1.kidFlare = glow("#fff0d0", 0.9, 1, FLARE); sc.add(S1.kidFlare);
    // 金色光流
    S1.flow = new PS(4200, sc);
    S1.dust = new PS(700, sc);
  })();
  const S1KEYS = [
    { t: 0.0, p: [1.05, 1.32, 6.6], l: [0, 1.02, 0], f: 36 },
    { t: 1.2, p: [0.82, 1.42, 3.1], l: [0, 1.22, 0.12], f: 35 },
    { t: 2.15, p: [0.92, 1.33, 1.3], l: [0.0, 1.3, 0.28], f: 34 },
    { t: 3.0, p: [0.62, 1.28, 0.92], l: [0.0, 1.31, 0.36], f: 31 }
  ];
  function camPath(keys, t, cam) {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const k1 = keys[i], k2 = keys[i + 1], k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = sat((t - k1.t) / (k2.t - k1.t));
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    const P = [0, 1, 2].map(j => cr(k0.p[j], k1.p[j], k2.p[j], k3.p[j])), L = [0, 1, 2].map(j => cr(k0.l[j], k1.l[j], k2.l[j], k3.l[j]));
    cam.position.set(P[0], P[1], P[2]); cam.lookAt(L[0], L[1], L[2]); cam.fov = lerp(k1.f, k2.f, u); cam.updateProjectionMatrix();
    return { P, L };
  }
  function shake(cam, t, amp) { if (amp <= 0) return; cam.rotateX((Math.sin(t * 37.1) + Math.sin(t * 23.3 + 1)) * amp * 0.5); cam.rotateY((Math.sin(t * 29.7 + 2) + Math.sin(t * 41.3)) * amp * 0.5); }
  const tmpC = new T.Color();
  function updS1(t) {
    camPath(S1KEYS, t, S1.cam);
    S1.cam.rotateZ(Math.sin(t * 0.7) * 0.012);
    S1.neb.material.uniforms.uGold.value = 0.15 + 0.25 * smooth(1.8, 3, t);
    S1.stars.tw(t);
    const c = V3(0, 1.272, 0.345);
    const k = smooth(1.25, 1.5, t) * (1 - smooth(1.95, 2.1, t));
    const spread = lerp(lerp(0.13, 0.078, smooth(0.9, 1.4, t)), 0.115, smooth(2.0, 2.45, t));
    S1.god.update(t, { c, k, spread, dy: -0.03 * smooth(2.0, 2.5, t) });
    // 五色黏土
    const e = ease(sat(t / 1.35));
    S1.blobs.forEach((o, i) => {
      const an = i * 1.2566 + t * 2.3, rr = lerp(0.17, 0.034, e);
      const sc = 0.03 * smooth(0.05 + i * 0.07, 0.5 + i * 0.07, t) * (1 - smooth(1.22, 1.42, t));
      o.b.position.set(c.x + Math.cos(an) * rr, c.y + Math.sin(an * 2 + t) * 0.025 * (1 - e) + 0.01, c.z + Math.sin(an) * rr * 0.7);
      o.b.scale.setScalar(Math.max(sc, 1e-4)); o.b.visible = sc > 1e-4;
      o.gl.position.copy(o.b.position); o.gl.material.opacity = sc / 0.03; o.gl.scale.setScalar(0.06 + 0.05 * e);
      o.m.uniforms.uGlow.value = 0.35 + e * 0.6;
    });
    const bs = 0.064 * smooth(1.2, 1.42, t) * (1 - smooth(2.0, 2.14, t));
    S1.ball.visible = bs > 1e-4; S1.ball.position.copy(c); S1.ball.scale.setScalar(Math.max(bs, 1e-4));
    S1.ballM.uniforms.uSq.value.set(1 + 0.17 * Math.sin(t * 11) * k, 1 - 0.14 * Math.sin(t * 11) * k, 1 + 0.09 * Math.cos(t * 9) * k);
    S1.ballM.uniforms.uGlow.value = 0.3 + 1.6 * smooth(1.4, 2.05, t);
    S1.ballGlow.position.copy(c); S1.ballGlow.scale.setScalar(0.2 + 0.25 * smooth(1.2, 2.05, t)); S1.ballGlow.material.opacity = smooth(1.15, 1.4, t) * (1 - smooth(2.05, 2.3, t) * 0.6);
    // 粒子重組成人形
    const mp = smooth(1.98, 2.5, t), base = V3(0, 1.175 + 0.03 * smooth(2.4, 3, t), 0.355);
    S1.morphM.uniforms.uP.value = mp; S1.morphM.uniforms.uC.value.copy(c); S1.morphM.uniforms.uBase.value.copy(base);
    S1.morphM.uniforms.uA.value = smooth(1.97, 2.05, t) * (1 - 0.65 * smooth(2.45, 2.7, t));
    S1.morph.visible = t > 1.96;
    S1.kid.position.copy(base); S1.kid.rotation.y = 0.4 + t * 0.3;
    const ko = smooth(2.32, 2.55, t); S1.kidM.uniforms.uOpacity.value = ko; S1.kid.visible = ko > 0.001;
    S1.kidM.uniforms.uGlow.value = 0.35 + 1.4 * smooth(2.5, 2.95, t) + 0.3 * Math.sin(t * 18) * smooth(2.5, 2.7, t);
    S1.kidGlow.position.copy(base).add(V3(0, 0.12, 0)); S1.kidGlow.scale.setScalar(0.18 + 0.5 * smooth(2.3, 3.0, t)); S1.kidGlow.material.opacity = smooth(2.2, 2.5, t);
    S1.kidFlare.position.copy(base).add(V3(0, 0.13, 0.02)); S1.kidFlare.scale.setScalar(0.15 + 1.2 * smooth(2.55, 3.0, t)); S1.kidFlare.material.opacity = smooth(2.5, 2.8, t); S1.kidFlare.material.rotation = t * 0.5;
    // 黏土光照女媧臉與手
    const fillS = 0.5 * smooth(0.3, 1.2, t) + 1.1 * smooth(1.5, 2.9, t);
    S1.god.mats.forEach(m => { m.uniforms.uFill.value = fillS; m.uniforms.uFillPos.value.copy(c).add(V3(0, 0.03, 0.02)); });
    // 金色光流（三道螺旋）
    const F = S1.flow, gold = HDR("#ffc56a", 1.6), cyan = HDR("#7fd8ff", 1.4);
    for (let i = 0; i < F.n; i++) {
      const st = i % 3, u = (F.r[i] + t * (0.05 + 0.02 * st)) % 1, an = u * 9 + st * 2.1 + t * 0.6;
      const rad = 1.0 + 0.5 * st + 0.35 * Math.sin(u * 6 + st) + (F.r[i + F.n] - 0.5) * 0.25;
      const y = -1.6 + u * 4.2 + (F.r[i + 2 * F.n] - 0.5) * 0.2;
      tmpC.copy(gold).lerp(cyan, st === 2 ? 0.8 : F.r[i + 3 * F.n] * 0.3);
      F.set(i, Math.cos(an) * rad, y, Math.sin(an) * rad * 0.8 - 0.3, tmpC, 0.012 + 0.016 * F.r[i + 3 * F.n], Math.sin(u * Math.PI) * 0.9);
    }
    // 生命能量：手→小人
    F.done();
    const D = S1.dust, dc = HDR("#ffd9a0", 1.2);
    for (let i = 0; i < D.n; i++) {
      if (i < 260 && t > 2.1) { const u = (D.r[i] + t * 1.2) % 1, side = i % 2 ? 1 : -1; const w = V3(side * spread + c.x, c.y - 0.015, c.z); const tgt = base.clone().add(V3(0, 0.12, 0)); const p = w.lerp(tgt, u); p.x += Math.sin(u * 12 + i) * 0.01; p.y += Math.sin(u * Math.PI) * 0.04; D.set(i, p.x, p.y, p.z, HDR(COLORS5[i % 5], 2), 0.006, Math.sin(u * Math.PI) * smooth(2.1, 2.4, t)); continue; }
      const x = (D.r[i] - 0.5) * 6, y = (D.r[i + D.n] - 0.5) * 4 + 1.3 + Math.sin(t * 0.5 + i) * 0.05, z = (D.r[i + 2 * D.n] - 0.5) * 6 + 0.5;
      D.set(i, x + Math.sin(t * 0.3 + i) * 0.05, y + t * 0.03, z, dc, 0.008 + 0.012 * D.r[i + 3 * D.n], 0.5);
    }
    D.done();
    return { ray: c, rayStr: 0.08 + 0.55 * smooth(2.45, 2.95, t), rayThr: 1.1 };
  }

  // ---------- 場景 2：五色補天 ----------
  const S2 = { scene: new T.Scene(), cam: new T.PerspectiveCamera(44, W / H, 0.05, 3000) };
  const CRACK = { y0: 30, z: -70, w: 170, h: 85 };
  const cf = x => 0.11 * Math.sin(2.3 * x + 0.4) + 0.05 * Math.sin(5.9 * x + 1.3) + 0.03 * Math.sin(12.1 * x + 2.1) + 0.017 * Math.sin(25.3 * x + 0.7) + 0.009 * Math.sin(51 * x + 1.9);
  const HITS = [-0.62, -0.31, 0.0, 0.31, 0.62];
  const crackWorld = x => V3(x * CRACK.w / 2, CRACK.y0 + cf(x) * CRACK.h, CRACK.z);
  (function () {
    const sc = S2.scene;
    S2.neb = makeNebula({ a: "#05031a", b: "#2a0c45", c: "#273a9a", g: "#ffb347", bright: 1.1 }); sc.add(S2.neb);
    S2.stars = makeStars(sc, 3000, 600);
    // 雲海
    S2.clouds = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.ShaderMaterial({
      uniforms: { uTime: time, uRed: { value: 0 }, uGold: { value: 0 } },
      vertexShader: "varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: `uniform float uTime,uRed,uGold;varying vec3 vW;${NOISE}
void main(){vec2 p=vW.xz*.02;float n=fbm(vec3(p+vec2(uTime*.05,0.),uTime*.04));float n2=fbm3(vec3(p*3.,1.3+uTime*.05));float c=smoothstep(-.4,.7,n*.8+n2*.35);
 vec3 lo=vec3(.03,.02,.08),hi=vec3(.25,.16,.42);vec3 col=mix(lo,hi,c);
 float toward=smoothstep(0.,-300.,vW.z);col+=vec3(.9,.18,.06)*uRed*c*toward*.9+vec3(1.4,.85,.35)*uGold*c*(.4+toward);
 float d=length(vW.xz-cameraPosition.xz);col=mix(col,vec3(.12,.06,.18)+vec3(.8,.5,.2)*uGold*.5,1.-exp(-d*.004));
 gl_FragColor=vec4(col,1.);}`
    }));
    S2.clouds.rotation.x = -Math.PI / 2; S2.clouds.position.y = -3.2; sc.add(S2.clouds);
    // 天之裂縫
    S2.crackM = new T.ShaderMaterial({
      uniforms: { uTime: time, uOpen: { value: 0 }, uHeal: { value: 0 }, uSeam: { value: 0 }, uHits: { value: HITS } },
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform float uTime,uOpen,uHeal,uSeam;uniform float uHits[5];varying vec2 vUv;${NOISE}
float cf(float x){return .11*sin(2.3*x+.4)+.05*sin(5.9*x+1.3)+.03*sin(12.1*x+2.1)+.017*sin(25.3*x+.7)+.009*sin(51.*x+1.9);}
void main(){vec2 p=(vUv-.5)*vec2(2.,1.);float x=p.x;
 float lm=smoothstep(1.,.55,abs(x));
 float hl=0.;for(int i=0;i<5;i++){hl=max(hl,smoothstep(uHeal*.42+.02,uHeal*.42-.05,abs(x-uHits[i])));} hl*=step(.001,uHeal);
 float w=uOpen*.055*lm*(.65+.35*snoise(vec3(x*6.,0.,uTime*.6)))*(1.-hl);
 float d=abs(p.y-cf(x));
 float b1=abs(p.y-(cf(x*1.7+.5)*.5+(x-.2)*.35))+step(x,.2)*9.+step(.55,x)*9.;
 float b2=abs(p.y-(cf(x*2.1+1.3)*.4-(x+.35)*.4))+step(-.35,x)*9.+step(x,-.7)*9.;
 float wb=w*.4;
 float inner=1.-smoothstep(w*.55,w,d);float innerB=max(1.-smoothstep(wb*.5,wb,b1),1.-smoothstep(wb*.5,wb,b2))*(1.-hl);
 float g=exp(-max(d-w*.5,0.)*55.)*lm*uOpen*(1.-hl)+exp(-max(min(b1,b2)-wb*.5,0.)*80.)*uOpen*(1.-hl)*.7;
 float ch=fbm3(vec3(p*6.,uTime*.8));
 vec3 voidC=mix(vec3(.02,0.,.01),vec3(.5,.04,.12),smoothstep(-.2,.8,ch));
 vec3 edge=vec3(5.,1.3,.35)*(.7+.3*sin(uTime*30.+x*20.));
 float seam=exp(-d*140.)*lm*uSeam;
 vec3 col=voidC*max(inner,innerB)+edge*g+vec3(5.,3.6,1.6)*seam;
 float a=clamp(max(inner,innerB)+g+seam,0.,1.);
 gl_FragColor=vec4(col,a);}`,
      transparent: true, depthWrite: false
    });
    S2.crack = new T.Mesh(new T.PlaneGeometry(CRACK.w, CRACK.h), S2.crackM); S2.crack.position.set(0, CRACK.y0, CRACK.z); sc.add(S2.crack);
    S2.crackGlow = glow("#ff4a20", 120, 0.35); S2.crackGlow.position.set(0, CRACK.y0, CRACK.z - 1); sc.add(S2.crackGlow);
    S2.sealGlow = glow("#ffc46a", 160, 1); S2.sealGlow.position.set(0, CRACK.y0, CRACK.z + 1); sc.add(S2.sealGlow);
    S2.ring = new T.Mesh(new T.RingGeometry(0.96, 1, 128), new T.MeshBasicMaterial({ color: HDR("#ffd28a", 4), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    S2.ring.position.set(0, CRACK.y0, CRACK.z + 2); sc.add(S2.ring);
    // 女媧（背影）
    S2.god = Goddess(sc); S2.god.group.rotation.y = Math.PI; S2.god.ribM.uniforms.uOp.value = 0.45;
    S2.god.mats.forEach(m => m.uniforms.uKey.value.set(0.2, 0.7, 0.8).normalize());
    // 五色光帶
    const tubeV = "varying vec2 vUv;varying vec3 vN,vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}";
    const tubeF = "uniform vec3 uCol;uniform float uRev,uTime,uOp;varying vec2 vUv;varying vec3 vN,vW;void main(){float u=vUv.x;if(u>uRev)discard;vec3 V=normalize(cameraPosition-vW);float f=1.-abs(dot(normalize(vN),V));float head=exp(-(uRev-u)*25.)*4.;float st=.6+.4*sin(u*90.-uTime*30.);gl_FragColor=vec4(uCol*(st*(.25+1.3*f*f*f)+head)*uOp*smoothstep(0.,.03,u),1.);}";
    S2.bands = COLORS5.map((col, k) => {
      const pts = [], N = 160, tgt = crackWorld(HITS[k]);
      const start = V3((k - 2) * 0.05, 1.96, -0.2);
      const ctrl = [start, V3((k - 2) * 2.2, 5, -5), V3(tgt.x * 0.35 + Math.sin(k * 2.1) * 6, 14, -26), V3(tgt.x * 0.75, 22 + k % 2 * 3, -48), tgt];
      const curve = new T.CatmullRomCurve3(ctrl);
      const P = [], Rr = [];
      for (let i = 0; i < N; i++) { const s = i / (N - 1), p = curve.getPoint(s); const hr = 1.6 * Math.sin(s * Math.PI) * (1 - s * 0.5), an = s * 14 + k * 1.256; p.x += Math.cos(an) * hr; p.y += Math.sin(an) * hr * 0.6; P.push(p); Rr.push(0.05 + 0.9 * Math.pow(s, 1.3)); }
      const m = new T.ShaderMaterial({ uniforms: { uCol: { value: HDR(col, k === 3 ? 0.55 : 0.85) }, uRev: { value: 0 }, uTime: time, uOp: { value: 1 } }, vertexShader: tubeV, fragmentShader: tubeF, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const tb = makeTube(N, 14, m, sc); tb.update(P, Rr);
      const head = glow(col, 3, 2.2); sc.add(head);
      return { P, m, head, col };
    });
    S2.handGlow = COLORS5.map(c => { const g = glow(c, 0.25, 2); sc.add(g); return g; });
    S2.sparks = new PS(2500, sc);
    S2.debris = new PS(900, sc);
  })();
  const S2KEYS = [
    { t: 3.0, p: [1.25, 0.85, 3.7], l: [0, 5.0, -20], f: 44 },
    { t: 3.8, p: [0.95, 1.05, 3.05], l: [0, 8.5, -26], f: 44 },
    { t: 4.6, p: [0.45, 1.55, 2.3], l: [0, 16, -45], f: 45 },
    { t: 5.3, p: [0.05, 2.0, 2.7], l: [0, 22, -60], f: 46 },
    { t: 6.0, p: [-0.45, 2.7, 4.8], l: [0, 25, -66], f: 48 }
  ];
  function updS2(t) {
    camPath(S2KEYS, t, S2.cam);
    shake(S2.cam, t, 0.006 * smooth(3.0, 3.3, t) * (1 - smooth(3.9, 4.4, t)) + 0.012 * gauss(t, 5.36, 0.12));
    S2.stars.tw(t);
    const open = smooth(3.0, 3.9, t), heal = smooth(4.85, 5.4, t), gold = smooth(5.25, 5.95, t);
    S2.crackM.uniforms.uOpen.value = open; S2.crackM.uniforms.uHeal.value = heal; S2.crackM.uniforms.uSeam.value = smooth(4.9, 5.2, t) * (1 - smooth(5.5, 6.0, t) * 0.7);
    S2.neb.material.uniforms.uRed.value = open * (1 - gold); S2.neb.material.uniforms.uGold.value = gold * 0.75;
    S2.clouds.material.uniforms.uRed.value = open * (1 - gold); S2.clouds.material.uniforms.uGold.value = gold;
    S2.crackGlow.material.opacity = open * (1 - heal) * (0.8 + 0.2 * Math.sin(t * 25));
    S2.sealGlow.material.opacity = gauss(t, 5.4, 0.15) * 0.9 + gold * 0.1; S2.sealGlow.scale.setScalar(70 + 90 * smooth(5.2, 6, t));
    const rr = smooth(5.28, 6.0, t); S2.ring.scale.setScalar(1 + rr * 140); S2.ring.material.opacity = (1 - rr) * (t > 5.28 ? 1 : 0);
    const raise = smooth(3.0, 3.55, t);
    S2.god.update(t, { raise: 0.25 + 0.75 * raise, c: V3(0, 1.3, 0.34), spread: 0.13 });
    S2.god.mats.forEach(m => { m.uniforms.uFill.value = 1.6 * smooth(3.2, 3.65, t) * (1 - smooth(3.9, 4.4, t)) + 0.6 * gold; m.uniforms.uFillPos.value.set(0, 2.05, 0.15); m.uniforms.uFillCol.value.setRGB(1, 0.7, 0.45); });
    // 手上的五色凝聚
    S2.handGlow.forEach((g, k) => { const an = k * 1.2566 + t * 7; const r = 0.28 * (1 - smooth(3.2, 3.68, t)) + 0.04; g.position.set(Math.cos(an) * r, 2.02 + Math.sin(an) * r * 0.4, -0.18 + Math.sin(an) * r * 0.3); g.material.opacity = smooth(3.1, 3.35, t) * (1 - smooth(3.7, 3.9, t)); g.scale.setScalar(0.25 + 0.3 * smooth(3.2, 3.65, t)); });
    // 光帶飛行
    const sp = S2.sparks;
    let si = 0;
    S2.bands.forEach((b, k) => {
      const t0 = 3.62 + k * 0.05, rev = ease(sat((t - t0) / (4.95 - t0)));
      b.m.uniforms.uRev.value = rev; b.m.uniforms.uOp.value = 1 - smooth(5.45, 6.0, t) * 0.75;
      const hi = Math.min(b.P.length - 1, Math.floor(rev * (b.P.length - 1)));
      b.head.position.copy(b.P[hi]); b.head.material.opacity = rev > 0.001 && rev < 0.999 ? 1 : 0; b.head.scale.setScalar(1.2 + 6 * rev);
      const cc = HDR(b.col, 2.2);
      for (let j = 0; j < 500; j++, si++) {
        const lag = sp.r[si] * 0.25, s = Math.max(0, rev - lag), pi = Math.floor(s * (b.P.length - 1)), p = b.P[pi];
        const sc = (0.3 + 3 * s) * 1.0; const life = 1 - lag / 0.25;
        sp.set(si, p.x + (sp.r[si + sp.n] - 0.5) * sc, p.y + (sp.r[si + 2 * sp.n] - 0.5) * sc - lag * 4, p.z + (sp.r[si + 3 * sp.n] - 0.5) * sc, cc, 0.05 + 0.25 * s, rev > 0.001 ? life * (1 - smooth(5.3, 5.9, t)) : 0);
      }
    });
    sp.done();
    // 裂縫碎石
    const db = S2.debris, dcol = HDR("#ff6a3a", 1.5);
    for (let i = 0; i < db.n; i++) { const x = (db.r[i] - 0.5) * 1.4, w = crackWorld(x), f = (db.r[i + db.n] + t * 0.4) % 1; db.set(i, w.x + (db.r[i + 2 * db.n] - 0.5) * 4, w.y - f * 25, w.z + 2, dcol, 0.3 + 0.5 * db.r[i + 3 * db.n], open * (1 - heal) * (1 - f)); }
    db.done();
    const cw = crackWorld(0);
    return { ray: cw, rayStr: 0.25 * open + 1.6 * gauss(t, 5.4, 0.15) + 0.12 * gold, rayThr: 1.0 };
  }

  // ---------- 場景 3/4：學院誕生、品牌 ----------
  const S3 = { scene: new T.Scene(), cam: new T.PerspectiveCamera(40, W / H, 0.5, 5000) };
  const SUN = V3(-0.62, 0.13, -1).normalize();
  const BU = { uB: { value: 0 }, uEdge: { value: 1 } };
  function revealify(mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uB = BU.uB; sh.uniforms.uEdge = BU.uEdge;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;").replace("#include <project_vertex>", "#include <project_vertex>\nvWp=(modelMatrix*vec4(transformed,1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;uniform float uB,uEdge;").replace("#include <dithering_fragment>",
        "#include <dithering_fragment>\nfloat st=length(vWp.xz)*0.045;float hh=(uB-st)*13.0-0.5;float dy=vWp.y-hh;if(dy>0.)discard;gl_FragColor.rgb+=vec3(1.4,2.4,3.0)*exp(dy*1.6)*2.5*uEdge;");
    };
    return mat;
  }
  (function () {
    const sc = S3.scene;
    sc.fog = new T.FogExp2(new T.Color(0.32, 0.2, 0.3), 0.0028);
    // 天空
    S3.sky = new T.Mesh(new T.SphereGeometry(2500, 64, 32), new T.ShaderMaterial({
      uniforms: { uSun: { value: SUN }, uTime: time },
      vertexShader: "varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform vec3 uSun;uniform float uTime;varying vec3 vD;${NOISE}
void main(){vec3 d=normalize(vD);float h=d.y;
 vec3 zen=vec3(.008,.012,.07),mid=vec3(.09,.04,.2),hor=vec3(.85,.36,.16);
 vec3 col=mix(hor,mid,smoothstep(-.02,.22,h));col=mix(col,zen,smoothstep(.18,.7,h));
 col=mix(col,vec3(.25,.13,.22),smoothstep(0.,-.15,h));
 float s=max(dot(d,uSun),0.);col+=vec3(4.,2.4,1.1)*pow(s,900.)*6.+vec3(1.6,.85,.38)*pow(s,40.)*.7+vec3(.7,.35,.25)*pow(s,4.)*.15;
 float n=fbm(d*2.6+vec3(0.,0.,uTime*.01));col+=vec3(.28,.14,.5)*smoothstep(.05,.8,n)*smoothstep(.12,.55,h)*.8;
 float band=h-.3-.06*sin(d.x*5.+uTime*.3);float au=exp(-band*band*90.)*smoothstep(-.1,.7,fbm3(vec3(d.x*3.5,uTime*.08,d.z*3.5)));
 col+=mix(vec3(.15,1.,.75),vec3(.85,.4,1.),.5+.5*sin(atan(d.z,d.x)*3.))*au*.5;
 gl_FragColor=vec4(col,1.);}`, side: T.BackSide, depthWrite: false, fog: false
    }));
    S3.sky.renderOrder = -10; sc.add(S3.sky);
    S3.stars = makeStars(sc, 2500, 1800);
    for (let i = 0; i < S3.stars.n; i++) { if (S3.stars.p[i * 3 + 1] < 300) S3.stars.base[i] = 0; S3.stars.base[i] *= 0.6; }
    const sunG = glow("#ffb070", 420, 0.38); sunG.position.copy(SUN).multiplyScalar(2000); sc.add(sunG);
    const sunF = glow("#ffe0b0", 300, 0.35, FLARE); sunF.position.copy(sunG.position); sc.add(sunF);
    // 光源
    const sunL = new T.DirectionalLight(new T.Color(1.0, 0.66, 0.38), 2.2); sunL.position.copy(SUN).multiplyScalar(100); sc.add(sunL);
    const fill = new T.DirectionalLight(new T.Color(0.4, 0.45, 0.85), 0.4); fill.position.set(40, 30, 60); sc.add(fill);
    sc.add(new T.HemisphereLight(new T.Color(0.42, 0.38, 0.8), new T.Color(0.4, 0.26, 0.2), 0.5));
    // 雲海
    S3.clouds = new T.Mesh(new T.PlaneGeometry(6000, 6000), new T.ShaderMaterial({
      uniforms: { uTime: time, uSun: { value: SUN } },
      vertexShader: "varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: `uniform float uTime;uniform vec3 uSun;varying vec3 vW;${NOISE}
void main(){vec2 p=vW.xz*.011;float n=fbm(vec3(p+vec2(uTime*.03,0.),uTime*.03));float n2=fbm3(vec3(p*3.3-vec2(0.,uTime*.04),1.));float c=smoothstep(-.35,.65,n*.75+n2*.4);
 vec3 V=normalize(vW-cameraPosition);float s=pow(max(dot(normalize(vec3(V.x,0.,V.z)),normalize(vec3(uSun.x,0.,uSun.z))),0.),5.);
 vec3 sh=vec3(.09,.06,.16),lt=vec3(.62,.36,.3);vec3 col=mix(sh,lt,c*.5+s*.45)*(.5+.6*c);col+=vec3(1.3,.6,.25)*s*c*.8;
 float d=length(vW.xz-cameraPosition.xz);col=mix(col,vec3(.5,.26,.2)+vec3(.7,.32,.1)*s,1.-exp(-d*.0014));
 gl_FragColor=vec4(col,1.);}`, fog: false
    }));
    S3.clouds.rotation.x = -Math.PI / 2; S3.clouds.position.y = -18; sc.add(S3.clouds);
    S3.puffs = [];
    for (let i = 0; i < 70; i++) { const near = i < 40; const a = rnd() * 6.283, r = near ? R(18, 60) : R(90, 380); const sp = new T.Sprite(new T.SpriteMaterial({ map: CLOUD, color: new T.Color(0.62, 0.42, 0.45).multiplyScalar(near ? 0.8 : 0.9), transparent: true, depthWrite: false, opacity: near ? 0.7 : 0.8 })); sp.position.set(Math.cos(a) * r, near ? R(-16, -6) : R(-17, -10), Math.sin(a) * r); const s = near ? R(18, 34) : R(60, 140); sp.scale.set(s, s * 0.55, 1); sp.userData.v = R(-0.3, 0.3); sc.add(sp); S3.puffs.push(sp); }
    // 島嶼
    const top = new T.RingGeometry(0.01, 26, 120, 28); top.rotateX(-Math.PI / 2);
    { const p = top.attributes.position, col = []; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); const hgt = r > 13.5 ? vfbm(x * 0.12, 0, z * 0.12) * 0.9 * smooth(13.5, 18, r) - smooth(22, 26, r) * 0.6 : 0; p.setY(i, hgt); const n = vfbm(x * 0.3, 1, z * 0.3); const c = new T.Color(0.3 + n * 0.06, 0.48 + n * 0.08, 0.22).lerp(new T.Color(0.62, 0.55, 0.3), smooth(0.2, 0.6, n) * 0.5); col.push(c.r, c.g, c.b); } top.setAttribute("color", new T.Float32BufferAttribute(col, 3)); top.computeVertexNormals(); }
    sc.add(new T.Mesh(top, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
    const prof = [[26, -0.55], [26.4, -1.6], [24.5, -4], [21, -8], [16, -13], [10, -19], [5, -25], [1.2, -31], [0.01, -33]];
    const ug = new T.LatheGeometry(prof.map(q => new T.Vector2(q[0], q[1])), 96, 0, Math.PI * 2);
    { const p = ug.attributes.position, col = []; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x); const n = vfbm(Math.cos(a) * 2, y * 0.12, Math.sin(a) * 2); const k = 1 + 0.28 * n * smooth(-1, -4, y); p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, y + n * 1.5 * smooth(-1, -4, y)); const c = new T.Color(0.36, 0.27, 0.25).lerp(new T.Color(0.18, 0.12, 0.2), smooth(-4, -28, y)).lerp(new T.Color(0.3, 0.42, 0.24), smooth(-2.5, -1.0, y) * 0.7); c.offsetHSL(0, 0, n * 0.06); col.push(c.r, c.g, c.b); } ug.setAttribute("color", new T.Float32BufferAttribute(col, 3)); ug.computeVertexNormals(); }
    sc.add(new T.Mesh(ug, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
    // 廣場與五行陣
    const mandala = (function () { const c = document.createElement("canvas"); c.width = c.height = 1024; const g = c.getContext("2d"); g.translate(512, 512); g.strokeStyle = "#fff"; g.lineWidth = 6; [490, 440, 300, 150].forEach(r => { g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke(); }); g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; const x = Math.cos(a) * 440, y = Math.sin(a) * 440; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.beginPath(); g.arc(Math.cos(a) * 440, Math.sin(a) * 440, 40, 0, 6.283); g.stroke(); } for (let i = 0; i < 72; i++) { const a = i * 6.283 / 72; g.beginPath(); g.moveTo(Math.cos(a) * 455, Math.sin(a) * 455); g.lineTo(Math.cos(a) * 480, Math.sin(a) * 480); g.stroke(); } const mt = new T.CanvasTexture(c); mt.encoding = T.sRGBEncoding; return mt; })();
    const plaza = new T.Mesh(new T.CylinderGeometry(11.2, 11.6, 0.5, 96), new T.MeshStandardMaterial({ color: 0x6d6878, roughness: 0.4, metalness: 0.3 })); plaza.position.y = 0.1; sc.add(plaza);
    S3.mandM = new T.MeshBasicMaterial({ map: mandala, color: HDR("#ffd27a", 3.2), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    const mand = new T.Mesh(new T.CircleGeometry(11, 96), S3.mandM); mand.rotation.x = -Math.PI / 2; mand.position.y = 0.38; sc.add(mand);
    const moat = new T.Mesh(new T.RingGeometry(11.7, 13.2, 128), new T.MeshStandardMaterial({ color: new T.Color(0.25, 0.45, 0.8), roughness: 0.08, metalness: 0.9, emissive: new T.Color(0.05, 0.12, 0.25) })); moat.rotation.x = -Math.PI / 2; moat.position.y = 0.05; sc.add(moat);
    // 學院材質
    function cv(w, h, f) { const c = document.createElement("canvas"); c.width = w; c.height = h; f(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.wrapS = T.RepeatWrapping; t.anisotropy = 4; t.encoding = T.sRGBEncoding; return t; }
    const wallMap = cv(1024, 256, (g, w, h) => { g.fillStyle = "#e9e1d0"; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { const x = i * w / 16; g.fillStyle = "#9b2b2b"; g.fillRect(x, 0, 10, h); g.fillStyle = "#3a2a28"; g.beginPath(); g.moveTo(x + 18, h - 30); g.lineTo(x + 18, 70); g.quadraticCurveTo(x + 32, 30, x + 46, 70); g.lineTo(x + 46, h - 30); g.fill(); } g.fillStyle = "#c9a15a"; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 14, w, 14); });
    const winMap = cv(1024, 256, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { const x = i * w / 16; const gr = g.createLinearGradient(0, 40, 0, h); gr.addColorStop(0, "#fff3d0"); gr.addColorStop(1, "#ffb050"); g.fillStyle = gr; g.beginPath(); g.moveTo(x + 21, h - 33); g.lineTo(x + 21, 72); g.quadraticCurveTo(x + 32, 40, x + 43, 72); g.lineTo(x + 43, h - 33); g.fill(); } g.fillStyle = "#6fe3ff"; g.fillRect(0, 4, w, 3); g.fillRect(0, h - 8, w, 3); });
    const tileMap = cv(512, 512, (g, w, h) => { g.fillStyle = "#1c3c56"; g.fillRect(0, 0, w, h); g.strokeStyle = "#102434"; g.lineWidth = 5; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(i * 13, 0); g.lineTo(i * 13, h); g.stroke(); } g.strokeStyle = "#2c5a7a"; g.lineWidth = 2; for (let j = 0; j < 16; j++) { g.beginPath(); g.moveTo(0, j * 32); g.lineTo(w, j * 32); g.stroke(); } });
    const M = {
      wall: revealify(new T.MeshStandardMaterial({ map: wallMap, emissiveMap: winMap, emissive: new T.Color(1, 0.75, 0.45), emissiveIntensity: 2.2, roughness: 0.6 })),
      roof: revealify(new T.MeshStandardMaterial({ map: tileMap, color: 0xbfd8ff, roughness: 0.4, metalness: 0.45, side: T.DoubleSide })),
      gold: revealify(new T.MeshStandardMaterial({ color: 0xffcf6a, emissive: new T.Color(1, 0.66, 0.2), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.8 })),
      stone: revealify(new T.MeshStandardMaterial({ color: 0xa9a2b4, roughness: 0.5 })),
      cyan: revealify(new T.MeshBasicMaterial({ color: HDR("#7fe8ff", 3) })),
      wood: new T.MeshStandardMaterial({ color: 0x5a3b2a, roughness: 0.9 }),
      pine: new T.MeshStandardMaterial({ color: 0x24563a, roughness: 0.8, flatShading: true }),
      bloom: new T.MeshStandardMaterial({ color: 0xf5a9c8, emissive: new T.Color(0.9, 0.35, 0.55), emissiveIntensity: 0.35, roughness: 0.7, flatShading: true }),
      rock: new T.MeshStandardMaterial({ color: 0x6a5450, roughness: 0.95, flatShading: true })
    };
    S3.M = M;
    function roofGeo(ro, ri, hh, sides) {
      const NA = sides * 10, NV = 12, pos = [], idx = [], uv = [];
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NA; i++) {
        const v = j / NV, th = (i / NA) * Math.PI * 2, seg = Math.PI * 2 / sides; const loc = ((th % seg) + seg) % seg - seg / 2; const poly = Math.cos(seg / 2) / Math.cos(loc);
        const corner = Math.pow(Math.abs(Math.cos(sides * th / 2)), 28);
        const r = (ri + (ro - ri) * v) * poly * (1 + 0.1 * corner * v * v);
        const y = hh * Math.pow(1 - v, 1.7) + corner * Math.pow(v, 3) * hh * 0.55;
        pos.push(Math.cos(th) * r, y, Math.sin(th) * r); uv.push(i / NA * sides, v);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const edge = []; for (let i = 0; i <= NA; i++) { const k = (NV * (NA + 1) + i) * 3; edge.push(V3(pos[k], pos[k + 1], pos[k + 2])); }
      return { g, edge };
    }
    function pagoda(parent, x, z, tiers, r0, h0, elemCol) {
      const grp = new T.Group(); grp.position.set(x, 0, z); parent.add(grp);
      let y = 0;
      const pl = new T.Mesh(new T.CylinderGeometry(r0 * 1.55, r0 * 1.7, 0.7, 8), M.stone); pl.position.y = 0.35 + 0.25; grp.add(pl); y = 0.95;
      const ring = new T.Mesh(new T.TorusGeometry(r0 * 1.6, 0.06, 6, 64), M.cyan); ring.rotation.x = Math.PI / 2; ring.position.y = y; grp.add(ring);
      const wallM = elemCol ? revealify(new T.MeshStandardMaterial({ map: wallMap, emissiveMap: winMap, emissive: new T.Color(elemCol), emissiveIntensity: 2.6, roughness: 0.6 })) : M.wall;
      for (let i = 0; i < tiers; i++) {
        const r = r0 * (1 - i * 0.16), h = h0 * (1 - i * 0.08);
        const body = new T.Mesh(new T.CylinderGeometry(r * 0.94, r, h, 8, 1), wallM); body.position.y = y + h / 2; grp.add(body);
        const rh = r * 0.36 + 0.3, rf = roofGeo(r * 1.62, r * 0.45, rh, 8);
        const roof = new T.Mesh(rf.g, M.roof); roof.position.y = y + h - 0.12; grp.add(roof);
        const trim = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rf.edge, true), 160, 0.07 + r * 0.012, 6, true), M.gold); trim.position.y = roof.position.y; grp.add(trim);
        y = y + h - 0.12 + rh * 0.42;
      }
      const sp = new T.Mesh(new T.ConeGeometry(r0 * 0.12, r0 * 1.0, 12), M.gold); sp.position.y = y + r0 * 0.5; grp.add(sp);
      const ball = new T.Mesh(new T.SphereGeometry(r0 * 0.1, 16, 10), M.gold); ball.position.y = y + r0 * 0.15; grp.add(ball);
      grp.userData.top = y + r0;
      return grp;
    }
    // 中央主塔
    S3.academy = new T.Group(); sc.add(S3.academy);
    const base1 = new T.Mesh(new T.CylinderGeometry(9.4, 10, 0.9, 8), M.stone); base1.position.y = 0.8; S3.academy.add(base1);
    const base2 = new T.Mesh(new T.CylinderGeometry(7.6, 8.2, 0.9, 8), M.stone); base2.position.y = 1.7; S3.academy.add(base2);
    [10.05, 8.25].forEach((r, i) => { const t = new T.Mesh(new T.TorusGeometry(r, 0.07, 6, 96), M.cyan); t.rotation.x = Math.PI / 2; t.position.y = 1.25 + i * 0.9; S3.academy.add(t); });
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + 0.2; const pil = new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 3.2, 10), M.gold); pil.position.set(Math.cos(a) * 9.0, 2.8, Math.sin(a) * 9.0); S3.academy.add(pil); }
    let y = 2.15;
    for (let i = 0; i < 5; i++) {
      const r = 4.7 - i * 0.66, h = 3.4 - i * 0.24;
      const body = new T.Mesh(new T.CylinderGeometry(r * 0.94, r, h, 8, 1), M.wall); body.position.y = y + h / 2; S3.academy.add(body);
      const rh = 1.3 - i * 0.08 + (i === 4 ? 0.9 : 0), rf = roofGeo(r * 1.58, r * 0.5, rh, 8);
      const roof = new T.Mesh(rf.g, M.roof); roof.position.y = y + h - 0.15; S3.academy.add(roof);
      const trim = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rf.edge, true), 200, 0.11, 6, true), M.gold); trim.position.y = roof.position.y; S3.academy.add(trim);
      const band = new T.Mesh(new T.TorusGeometry(r * 1.02, 0.05, 6, 64), M.cyan); band.rotation.x = Math.PI / 2; band.position.y = y + 0.25; S3.academy.add(band);
      y = y + h - 0.15 + rh * 0.48;
    }
    const spire = new T.Mesh(new T.ConeGeometry(0.45, 5.5, 16), M.gold); spire.position.y = y + 2.7; S3.academy.add(spire);
    [0.0, 1.2, 2.2].forEach((o, i) => { const b = new T.Mesh(new T.SphereGeometry(0.55 - i * 0.12, 20, 14), M.gold); b.position.y = y + 0.4 + o; S3.academy.add(b); });
    S3.topY = y + 5.5;
    S3.halos = [[1.6, 0.06, "#ffd27a"], [2.4, 0.04, "#7fe8ff"]].map((h, i) => { const m = new T.Mesh(new T.TorusGeometry(h[0], h[1], 6, 96), revealify(new T.MeshBasicMaterial({ color: HDR(h[2], 3.5) }))); m.position.y = y + 3.2 + i * 0.6; S3.academy.add(m); return m; });
    S3.rings = [[10.5, 0.11, "#7fe8ff", 9.5, 0.22], [12.8, 0.07, "#ffd27a", 13.5, -0.3], [8.2, 0.06, "#c8a0ff", 17.5, 0.35]].map(o => { const m = new T.Mesh(new T.TorusGeometry(o[0], o[1], 6, 200), revealify(new T.MeshBasicMaterial({ color: HDR(o[2], 3) }))); m.position.y = o[3]; m.rotation.x = Math.PI / 2 + o[4]; S3.academy.add(m); m.userData.tilt = o[4]; return m; });
    // 全息弧面
    S3.holoM = new T.ShaderMaterial({
      uniforms: { uTime: time, uB: BU.uB, uOp: { value: 0 } },
      vertexShader: "varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: "uniform float uTime,uOp,uB;varying vec2 vUv;varying vec3 vW;float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}void main(){vec2 g=fract(vUv*vec2(60.,8.));float l=smoothstep(.96,1.,max(g.x,g.y));vec2 cell=floor(vUv*vec2(60.,8.));float glyph=step(.75,hash12(cell+floor(uTime*3.)))*step(.2,g.x)*step(g.x,.8)*step(.3,g.y)*step(g.y,.7);float e=smoothstep(0.,.1,vUv.y)*smoothstep(1.,.9,vUv.y);gl_FragColor=vec4(vec3(.4,1.6,2.4)*(l*.6+glyph*.5+.06)*e*uOp,1.);}",
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
    });
    [[14.5, 7, 6, 0.6], [15.5, 5, 12, 3.6]].forEach(o => { const m = new T.Mesh(new T.CylinderGeometry(o[0], o[0], o[1], 96, 1, true, o[3], Math.PI * 0.75), S3.holoM); m.position.y = o[2]; S3.academy.add(m); });
    // 光柱
    S3.beamM = new T.ShaderMaterial({ uniforms: { uOp: { value: 0 }, uTime: time }, vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}", fragmentShader: "uniform float uOp,uTime;varying vec2 vUv;void main(){float a=pow(1.-vUv.y,1.5)*(0.7+0.3*sin(vUv.y*60.-uTime*8.));gl_FragColor=vec4(vec3(2.2,1.8,1.2)*a*uOp,1.);}", transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    S3.beam = new T.Mesh(new T.CylinderGeometry(0.35, 0.6, 260, 16, 1, true), S3.beamM); S3.beam.position.y = S3.topY + 130; sc.add(S3.beam);
    S3.colM = new T.ShaderMaterial({ uniforms: { uOp: { value: 0 }, uTime: time }, vertexShader: "varying vec2 vUv;varying vec3 vN,vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}", fragmentShader: "uniform float uOp,uTime;varying vec2 vUv;varying vec3 vN,vW;void main(){vec3 V=normalize(cameraPosition-vW);float f=1.-abs(dot(normalize(vN),V));float s=.6+.4*sin(vUv.y*40.-uTime*14.+vUv.x*12.);gl_FragColor=vec4(vec3(.5,1.3,2.0)*(.04+f*f*f*1.2)*s*uOp*smoothstep(1.,.5,vUv.y),1.);}", transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    S3.column = new T.Mesh(new T.CylinderGeometry(3.2, 4.6, 40, 48, 1, true), S3.colM); S3.column.position.y = 20; sc.add(S3.column);
    // 五行分院
    S3.hallA = [0, 1, 2, 3, 4].map(k => Math.PI / 2 + Math.PI / 5 + k * 2 * Math.PI / 5);
    const ELEM = ["#ffb347", "#3aa8ff", "#ff5a2e", "#3fe0a8", "#fff0c0"];
    S3.ELEM = ELEM;
    S3.halls = S3.hallA.map((a, k) => pagoda(S3.academy, Math.cos(a) * 17.5, Math.sin(a) * 17.5, 2, 2.6, 2.6, ELEM[k]));
    S3.hallA.forEach((a, k) => {
      const p0 = V3(Math.cos(a) * 9.6, 1.3, Math.sin(a) * 9.6), p2 = V3(Math.cos(a) * 14.6, 1.0, Math.sin(a) * 14.6), p1 = p0.clone().lerp(p2, 0.5).add(V3(0, 1.8, 0));
      const cur = new T.QuadraticBezierCurve3(p0, p1, p2);
      S3.academy.add(new T.Mesh(new T.TubeGeometry(cur, 40, 0.35, 8), M.stone));
      [-0.5, 0.5].forEach(o => { const off = V3(-Math.sin(a) * o, 0.45, Math.cos(a) * o); const c2 = new T.QuadraticBezierCurve3(p0.clone().add(off), p1.clone().add(off), p2.clone().add(off)); S3.academy.add(new T.Mesh(new T.TubeGeometry(c2, 40, 0.05, 5), M.cyan)); });
    });
    // 樹
    S3.trees = [];
    for (let i = 0; i < 90; i++) {
      const a = rnd() * 6.283, r = R(13.8, 24.5); let ok = true;
      S3.hallA.forEach(h => { const dx = Math.cos(a) * r - Math.cos(h) * 17.5, dz = Math.sin(a) * r - Math.sin(h) * 17.5; if (Math.hypot(dx, dz) < 5) ok = false; let d = Math.abs(((a - h + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d < 0.18 && r < 16) ok = false; });
      if (!ok) continue;
      const tr = new T.Group(); tr.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); const s = R(0.8, 1.4);
      const trunk = new T.Mesh(new T.CylinderGeometry(0.12, 0.18, 1.4, 6), M.wood); trunk.position.y = 0.7; tr.add(trunk);
      if (rnd() < 0.55) { for (let j = 0; j < 4; j++) { const b = new T.Mesh(new T.IcosahedronGeometry(R(0.7, 1.05), 1), M.bloom); b.position.set(R(-0.6, 0.6), 1.6 + R(0, 0.8), R(-0.6, 0.6)); tr.add(b); } }
      else { for (let j = 0; j < 3; j++) { const c = new T.Mesh(new T.ConeGeometry(1.1 - j * 0.28, 1.4, 7), M.pine); c.position.y = 1.4 + j * 0.75; tr.add(c); } }
      tr.userData.s = s; tr.userData.d = r; tr.scale.setScalar(0.001); sc.add(tr); S3.trees.push(tr);
    }
    // 浮島碎岩
    S3.rocks = [];
    for (let i = 0; i < 16; i++) { const g = new T.IcosahedronGeometry(1, 1); const p = g.attributes.position; for (let j = 0; j < p.count; j++) { const v = V3(p.getX(j), p.getY(j), p.getZ(j)); const k = 1 + 0.3 * vnoise(v.x * 2 + i, v.y * 2, v.z * 2); p.setXYZ(j, v.x * k, v.y * k * (v.y > 0 ? 0.5 : 1.3), v.z * k); } g.computeVertexNormals(); const m = new T.Mesh(g, M.rock); const a = rnd() * 6.283, r = R(32, 60); m.position.set(Math.cos(a) * r, R(-8, 16), Math.sin(a) * r); m.scale.setScalar(R(1.4, 4)); m.userData.y = m.position.y; m.userData.ph = rnd() * 6; sc.add(m); S3.rocks.push(m); }
    // 光之瀑布
    S3.fallM = new T.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}", fragmentShader: `uniform float uTime;varying vec2 vUv;${NOISE}void main(){float n=snoise(vec3(vUv.x*14.,vUv.y*3.+uTime*2.5,0.));float s=smoothstep(.0,.8,n)*.7+.3;float e=smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x);gl_FragColor=vec4(vec3(1.2,1.6,2.2)*s*e*smoothstep(0.,.6,vUv.y)*.9,1.);}`, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    [0.3, 2.2, 4.0, 5.3].forEach(a => { const m = new T.Mesh(new T.PlaneGeometry(3.2, 22), S3.fallM); m.position.set(Math.cos(a) * 26.4, -11, Math.sin(a) * 26.4); m.lookAt(Math.cos(a) * 60, -11, Math.sin(a) * 60); sc.add(m); });
    // 五元素光球
    S3.orbs = ELEM.map((c, k) => {
      const g = new T.Group(); sc.add(g);
      const core = new T.Mesh(new T.SphereGeometry(0.42, 24, 16), new T.MeshBasicMaterial({ color: HDR(c, 5), fog: false })); g.add(core);
      const shell = new T.Mesh(new T.SphereGeometry(1.05, 32, 20), new T.ShaderMaterial({ uniforms: { uC: { value: HDR(c, 1.6) }, uTime: time }, vertexShader: "varying vec3 vN,vW,vP;void main(){vP=position;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}", fragmentShader: `uniform vec3 uC;uniform float uTime;varying vec3 vN,vW,vP;${NOISE}void main(){vec3 V=normalize(cameraPosition-vW);float f=1.-abs(dot(normalize(vN),V));float n=fbm3(vP*2.5+vec3(0.,uTime*1.5,uTime));gl_FragColor=vec4(uC*(pow(f,2.5)*1.4+smoothstep(.1,.7,n)*.35),1.);}`, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); g.add(shell);
      const gl = glow(c, 7, 1.3); g.add(gl); const gl2 = glow(c, 16, 0.22); g.add(gl2);
      const light = new T.PointLight(new T.Color(c), 0, 45, 2); g.add(light);
      const ps = new PS(420, sc);
      const extra = [];
      if (k === 0) for (let j = 0; j < 7; j++) { const r = new T.Mesh(new T.IcosahedronGeometry(R(0.18, 0.35), 0), new T.MeshStandardMaterial({ color: 0x9a7040, emissive: new T.Color(0.8, 0.5, 0.15), emissiveIntensity: 0.6, flatShading: true })); g.add(r); extra.push(r); }
      if (k === 4) { const f = glow("#fff4d8", 10, 1.6, FLARE); g.add(f); extra.push(f); }
      return { g, core, gl, gl2, light, ps, extra, c: HDR(c, 2.2), k };
    });
    S3.burst = glow("#fff0d0", 10, 2); sc.add(S3.burst);
    S3.shock = new T.Mesh(new T.RingGeometry(0.9, 1, 160), new T.MeshBasicMaterial({ color: HDR("#bff0ff", 4), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    S3.shock.rotation.x = -Math.PI / 2; S3.shock.position.y = 0.6; sc.add(S3.shock);
    S3.rise = new PS(2600, sc);
    S3.dust = new PS(800, sc);
  })();
  function orbPos(k, t, out) {
    const a0 = S3.hallA[k];
    if (t < 7.4) { const e = ease(sat((t - 6.0) / 1.4)); const a = a0 + (1 - e) * 2.6, r = lerp(36, 12, e), y = lerp(36, 11, e); return out.set(Math.cos(a) * r, y, Math.sin(a) * r); }
    if (t < 8.0) { const e = ease(sat((t - 7.4) / 0.6)); const a = a0 + (t - 7.4) * 3.2, r = lerp(12, 0.3, e), y = lerp(11, 7, e); return out.set(Math.cos(a) * r, y, Math.sin(a) * r); }
    if (t < 8.35) return out.set(0, 7, 0);
    if (t < 9.6) { const e = ease(sat((t - 8.35) / 1.25)); const a = a0 + 3.2 * 0.6; const ae = a0 + (1 - e) * 0.0; const r = lerp(0.3, 17.5, e), y = lerp(7, 12, e) + Math.sin(Math.PI * e) * 6; return out.set(Math.cos(ae) * r, y, Math.sin(ae) * r); }
    const u = t - 9.6, ra = smooth(0, 1.2, u);
    const a = a0 + 0.2 * Math.max(0, u - 0.6) * ra, r = 17.5 + 4.5 * smooth(0.6, 3, u), y = 12 + 3 * smooth(0.6, 3, u) + Math.sin(t * 1.6 + k) * 0.8 * ra;
    return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const S3KEYS = [
    { t: 6.0, p: [0, 36, 96], l: [0, 13, 0], f: 40 },
    { t: 7.0, p: [3, 27, 76], l: [0, 10, 0], f: 40 },
    { t: 8.0, p: [7, 19, 61], l: [0, 8.5, 0], f: 40 },
    { t: 9.0, p: [11.5, 13, 48], l: [0, 11, 0], f: 41 },
    { t: 10.0, p: [16, 10.5, 39], l: [0, 13.5, 0], f: 42 },
    { t: 11.0, p: [21, 13, 45], l: [0, 17, 0], f: 42 },
    { t: 12.5, p: [28, 21, 64], l: [0, 20, 0], f: 41 },
    { t: 15.0, p: [35, 25.5, 78], l: [0, 21, 0], f: 40 }
  ];
  const op = V3();
  function updS3(t) {
    camPath(S3KEYS, t, S3.cam);
    shake(S3.cam, t, 0.008 * gauss(t, 8.05, 0.12));
    S3.stars.tw(t);
    const ub = Math.max(0, t - 8.0); BU.uB.value = t < 8.0 ? -2 : ub; BU.uEdge.value = 1 - smooth(10.6, 11.4, t);
    S3.mandM.opacity = 0.35 + 0.65 * smooth(7.2, 8.0, t) * (1 - smooth(9.5, 11, t) * 0.5);
    S3.holoM.uniforms.uOp.value = smooth(9.6, 10.6, t) * 0.8;
    S3.beamM.uniforms.uOp.value = smooth(9.8, 10.8, t);
    S3.colM.uniforms.uOp.value = 0.6 * smooth(7.95, 8.15, t) * (1 - smooth(9.2, 10.0, t));
    S3.column.scale.set(1 - 0.3 * smooth(8.2, 10, t), 1, 1 - 0.3 * smooth(8.2, 10, t));
    S3.rings.forEach((m, i) => { m.rotation.z = t * (0.25 + i * 0.12) * (i % 2 ? -1 : 1); m.rotation.x = Math.PI / 2 + m.userData.tilt + Math.sin(t * 0.4 + i) * 0.05; });
    S3.halos.forEach((m, i) => { m.rotation.x = Math.PI / 2 + Math.sin(t + i) * 0.2; m.rotation.y = t * (i ? -0.6 : 0.8); });
    S3.trees.forEach(tr => { tr.scale.setScalar(tr.userData.s * (1 + 0.04 * Math.sin(t * 1.3 + tr.userData.d))); });
    S3.rocks.forEach(r => { r.position.y = r.userData.y + Math.sin(t * 0.6 + r.userData.ph) * 0.6; r.rotation.y = t * 0.05 + r.userData.ph; });
    S3.puffs.forEach(p => { p.position.x += 0; p.material.rotation = p.userData.v * t * 0.1; });
    // 元素光球
    const vis = !(t >= 8.0 && t < 8.35);
    S3.orbs.forEach(o => {
      orbPos(o.k, t, op); o.g.position.copy(op); o.g.visible = vis;
      const inten = 1 + 0.8 * smooth(7.4, 8.0, t);
      o.core.scale.setScalar(inten * (t > 9.6 ? 1.0 : 1.15)); o.gl.material.opacity = 1; o.gl2.material.opacity = 0.6 + 0.4 * Math.sin(t * 3 + o.k);
      o.light.intensity = vis ? 2.2 * smooth(8.6, 9.8, t) + 0.8 : 0;
      o.extra.forEach((e, j) => { if (o.k === 0) { const a = t * 1.3 + j * 0.9; e.position.set(Math.cos(a) * 1.8, Math.sin(a * 1.7) * 0.6, Math.sin(a) * 1.8); e.rotation.set(t + j, t * 0.7, j); } else { e.material.rotation = t * 0.4; } });
      const ps = o.ps, n = ps.n, c = o.c;
      for (let i = 0; i < n; i++) {
        const r1 = ps.r[i], r2 = ps.r[i + n], r3 = ps.r[i + 2 * n], r4 = ps.r[i + 3 * n];
        if (i < 140) { // 拖尾
          const lag = (i / 140) * 0.55; orbPos(o.k, t - lag, op); const sp = 0.25 + lag * 3;
          ps.set(i, op.x + (r1 - 0.5) * sp, op.y + (r2 - 0.5) * sp, op.z + (r3 - 0.5) * sp, c, 0.22 * (1 - lag * 1.4) + 0.05, vis && t - lag > 6.0 && !(t - lag >= 7.98 && t - lag < 8.37) ? (1 - lag / 0.55) * 0.8 : 0);
          continue;
        }
        const P = o.g.position; let x, y, z, sz = 0.18, al = 1;
        if (o.k === 2) { const life = (r1 + t * 1.3) % 1; const a = r2 * 6.283; x = Math.cos(a) * r3 * 0.9 * (1 - life); z = Math.sin(a) * r3 * 0.9 * (1 - life); y = life * 3.2 - 0.3; sz = 0.3 * (1 - life) + 0.05; al = 1 - life; tmpC.setRGB(2.6, 0.9 + (1 - life) * 0.8, 0.25); }
        else if (o.k === 1) { const a = r1 * 6.283 + t * (1.5 + r2); const rr = 1.7 + 0.3 * Math.sin(a * 3 + t * 2); x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = Math.sin(a * 2 + t) * 0.35 + (r3 - 0.5) * 0.2; tmpC.setRGB(0.5, 1.4, 2.6); sz = 0.14; }
        else if (o.k === 3) { const a = r1 * 6.283 + t * (3 + r2 * 2); const rr = 0.9 + r3 * 1.8; x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = (r4 - 0.5) * 2.4 + Math.sin(a) * 0.5; tmpC.setRGB(0.6, 2.2, 1.5); sz = 0.11; }
        else if (o.k === 0) { const a = r1 * 6.283 + t * 0.8; const rr = 1.2 + r3; x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = (r2 - 0.5) * 1.2; tmpC.setRGB(2.2, 1.4, 0.5); sz = 0.13; }
        else { const life = (r1 + t * 0.9) % 1; const d = V3(r2 - 0.5, r3 - 0.5, r4 - 0.5).normalize(); x = d.x * life * 4; y = d.y * life * 4; z = d.z * life * 4; tmpC.setRGB(2.6, 2.3, 1.7); sz = 0.16 * (1 - life) + 0.04; al = 1 - life; }
        ps.set(i, P.x + x, P.y + y, P.z + z, tmpC, sz, vis ? al : 0);
      }
      ps.done();
    });
    S3.burst.position.set(0, 7, 0); const bu = gauss(t, 8.05, 0.22); S3.burst.scale.setScalar(6 + 120 * smooth(7.9, 8.7, t)); S3.burst.material.opacity = bu * 1.5 + smooth(7.5, 8.0, t) * (t < 8.05 ? 0.6 : 0);
    const sk = smooth(8.0, 8.9, t); S3.shock.scale.setScalar(0.5 + sk * 48); S3.shock.material.opacity = t > 8.0 ? (1 - sk) : 0;
    // 能量上升
    const rs = S3.rise, rn = rs.n;
    for (let i = 0; i < rn; i++) { const a = rs.r[i] * 6.283, r = Math.sqrt(rs.r[i + rn]) * 22, life = (rs.r[i + 2 * rn] + t * 0.6) % 1; const on = smooth(8.0, 8.4, t) * (1 - smooth(10.4, 11.2, t)) * 0.8 + 0.12; tmpC.set(S3.ELEM[i % 5]).multiplyScalar(2.2); rs.set(i, Math.cos(a) * r, life * 22, Math.sin(a) * r, tmpC, 0.1 + 0.12 * rs.r[i + 3 * rn], Math.sin(life * Math.PI) * on); }
    rs.done();
    const D = S3.dust; for (let i = 0; i < D.n; i++) { const x = (D.r[i] - 0.5) * 120, y = D.r[i + D.n] * 50 - 5 + Math.sin(t * 0.4 + i) * 0.5, z = (D.r[i + 2 * D.n] - 0.5) * 120; tmpC.setRGB(1.8, 1.4, 0.9); D.set(i, x + Math.sin(t * 0.2 + i) * 0.5, y, z, tmpC, 0.08 + 0.1 * D.r[i + 3 * D.n], 0.45); } D.done();
    // 光芒來源：爆發 → 塔頂
    const src = t < 9.0 ? V3(0, 7, 0) : V3(0, S3.topY, 0);
    return { ray: src, rayStr: 1.2 * gauss(t, 8.05, 0.25) + 0.15 * smooth(9.8, 11, t), rayThr: 1.8 };
  }

  // ---------- 品牌文字 ----------
  let TXT = null;
  function buildText() {
    const gold = g => { const gr = g.createLinearGradient(0, 210, 0, 345); gr.addColorStop(0, "#fff6d6"); gr.addColorStop(0.45, "#ffd77e"); gr.addColorStop(1, "#d8963a"); return gr; };
    const t1 = textCanvas(g => {
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      g.font = "700 128px Cardo"; g.letterSpacing = "6px";
      g.shadowColor = "rgba(20,8,40,.75)"; g.shadowBlur = 26; g.fillStyle = "#2a1a10"; g.fillText("SWT MindFlow", 960, 330);
      g.shadowColor = "rgba(255,190,90,.55)"; g.shadowBlur = 34; g.fillStyle = gold(g); g.fillText("SWT MindFlow", 960, 330);
      g.shadowBlur = 0; g.lineWidth = 1.2; g.strokeStyle = "rgba(255,250,230,.55)"; g.strokeText("SWT MindFlow", 960, 330);
    });
    const t2 = textCanvas(g => {
      g.textAlign = "center";
      // 分隔線與五色點
      const y = 378; const lg = g.createLinearGradient(560, 0, 1360, 0); lg.addColorStop(0, "rgba(255,210,130,0)"); lg.addColorStop(0.5, "rgba(255,215,140,.95)"); lg.addColorStop(1, "rgba(255,210,130,0)");
      g.fillStyle = lg; g.fillRect(560, y - 1.5, 800, 3);
      ["#2fe0cf", "#ff5a3e", "#ffc63a", "#ffffff", "#9a6cff"].forEach((c, i) => { const x = 960 + (i - 2) * 46; g.shadowColor = c; g.shadowBlur = 14; g.fillStyle = c; g.beginPath(); g.arc(x, y, 7, 0, 6.283); g.fill(); });
      g.shadowBlur = 0;
      g.font = '700 104px "Noto Serif CJK TC"'; g.letterSpacing = "26px";
      g.shadowColor = "rgba(20,8,40,.8)"; g.shadowBlur = 24; g.fillStyle = "#fffaf0"; g.fillText("身心智慧學院", 973, 508);
      g.shadowColor = "rgba(255,200,110,.5)"; g.shadowBlur = 30; g.fillText("身心智慧學院", 973, 508);
    });
    const t3 = textCanvas(g => {
      g.textAlign = "center"; g.font = '600 46px "Noto Serif CJK TC"'; g.letterSpacing = "8px";
      g.shadowColor = "rgba(15,6,30,.9)"; g.shadowBlur = 18; g.fillStyle = "#f8e9c4"; g.fillText("創造自己・探索智慧・成就無限可能", 964, 596);
    });
    TXT = [t1, t2, t3];
    finalPass.uniforms.tT1.value = t1; finalPass.uniforms.tT2.value = t2; finalPass.uniforms.tT3.value = t3;
  }

  // ---------- 主時間軸 ----------
  const sp = V3();
  window.renderAt = function (t) {
    time.value = t;
    let S, info;
    if (t < 3.0) { S = S1; info = updS1(t); }
    else if (t < 6.0) { S = S2; info = updS2(t); }
    else { S = S3; info = updS3(t); }
    renderPass.scene = S.scene; renderPass.camera = S.cam;
    PX.value = (H * 0.5) / Math.tan((S.cam.fov * Math.PI) / 360);
    // 光芒位置
    sp.copy(info.ray).project(S.cam);
    const inFront = sp.z < 1;
    rays.uniforms.uLight.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    rays.uniforms.uStr.value = inFront ? info.rayStr : 0; rays.uniforms.uThr.value = info.rayThr; rays.uniforms.uSeed.value = (t * 30) % 97;
    // 轉場閃光與曝光
    const fl = 7 * gauss(t, 2.99, 0.07) + 2.6 * gauss(t, 5.36, 0.1) + 4.5 * gauss(t, 6.0, 0.07) + 1.8 * gauss(t, 8.05, 0.1);
    finalPass.uniforms.uFlash.value.set(fl * 1.0, fl * 0.86, fl * 0.66);
    finalPass.uniforms.uFade.value = 1 - smooth(0.0, 0.55, t);
    finalPass.uniforms.uExp.value = t < 3 ? 1.05 : t < 6 ? 1.0 : 0.92;
    finalPass.uniforms.uDark.value = 0.42 * smooth(10.9, 11.9, t);
    finalPass.uniforms.uSeed.value = (t * 30 * 7.13) % 101;
    finalPass.uniforms.uO.value.set(smooth(11.25, 11.95, t), smooth(11.8, 12.5, t), smooth(12.4, 13.1, t));
    bloom.strength = (t < 3 ? 0.42 : t < 6 ? 0.5 : 0.32) * (Q.bloom ? +Q.bloom : 1); bloom.threshold = t < 6 ? 0.9 : 1.15;
    if (Q.norays) rays.uniforms.uStr.value = 0;
    composer.render();
  };
  window.filmReady = (async function () {
    try { await Promise.all([document.fonts.load('700 104px "Noto Serif CJK TC"', "身心智慧學院創造自己探索成就無限可能・"), document.fonts.load('600 46px "Noto Serif CJK TC"', "創造自己"), document.fonts.load("700 128px Cardo", "SWT MindFlow")]); } catch (e) { }
    buildText();
    // 預編譯所有場景
    [[0.5], [3.5], [9]].forEach(a => window.renderAt(a[0]));
    return true;
  })();
})();
