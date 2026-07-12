/**
 * <cactus-chrome-bg> — Cactus design-system background
 * ----------------------------------------------------
 * A dependency-free custom element that renders the liquid-chrome / silver
 * noise field (WebGL). Drop it behind any layout as a full-bleed background:
 *
 *   <script src="cactus-chrome-bg.js"></script>
 *   <cactus-chrome-bg></cactus-chrome-bg>   <!-- position:fixed; inset:0 by default -->
 *
 * Attributes (all optional):
 *   circle   — distortion-circle radius in design px         (default 150)
 *   halo     — halo strength 0..1                            (default 0.39)
 *   tint     — highlight colour "r,g,b" 0..1                 (default "0.812,0.886,0.808")
 *   drift    — "on" (slow autonomous wander) | "off"         (default on)
 *   speed    — drift speed multiplier                        (default 1)
 *
 * The GLSL is a straight port of the reference shader (WebGL 1 / GLES 2).
 */
(function () {
  var VS = "attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0,1);}";

  var FS = "\n" +
"precision highp float;\n" +
"uniform vec2  u_res; uniform float u_time; uniform float u_scale; uniform int u_oct;\n" +
"uniform float u_persist; uniform float u_warp; uniform float u_cycles; uniform float u_mbStrength;\n" +
"uniform float u_bright; uniform float u_ncontrast; uniform float u_crush; uniform float u_mix;\n" +
"uniform float u_grainScale; uniform float u_grainGain; uniform float u_grainTime;\n" +
"uniform vec2  u_center; uniform float u_radius; uniform float u_feather;\n" +
"uniform float u_haloReach; uniform float u_haloStrength; uniform float u_haloCurve;\n" +
"uniform vec3  u_tint;\n" +
"vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}\n" +
"vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}\n" +
"vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}\n" +
"vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}\n" +
"float snoise(vec3 v){\n" +
"  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);\n" +
"  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);\n" +
"  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;\n" +
"  vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);\n" +
"  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;\n" +
"  i=mod289(i);\n" +
"  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));\n" +
"  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;\n" +
"  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);\n" +
"  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);\n" +
"  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);\n" +
"  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));\n" +
"  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;\n" +
"  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);\n" +
"  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));\n" +
"  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;\n" +
"  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;\n" +
"  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));\n" +
"}\n" +
"vec2 rotate2(vec2 v){float c=0.8660254,s=0.5;return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}\n" +
"float fbm(vec3 p){\n" +
"  float v=0.,a=1.,f=1.,m=0.;\n" +
"  for(int i=0;i<6;i++){ if(i>=u_oct)break;\n" +
"    vec2 rxy=rotate2(p.xy*f);\n" +
"    v+=snoise(vec3(rxy+vec2(17.3,4.1),p.z*f))*a; m+=a;a*=u_persist;f*=2.; }\n" +
"  return v/m;\n" +
"}\n" +
"float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n" +
"float tri(float x){return fract(x)-.5;}\n" +
"float dither(vec2 fc){return(tri(fc.x*.5)+tri(fc.y*.5))*(1./255.);}\n" +
"float grain1(vec2 fc){ vec2 gc=floor(fc/max(u_grainScale,1.0)); return hash(gc+vec2(u_grainTime*7.3,u_grainTime*3.7)); }\n" +
"void main(){\n" +
"  float d = distance(gl_FragCoord.xy, u_center);\n" +
"  float softWidth = u_radius * 0.07 + u_feather;\n" +
"  float fieldSample = 1.0 - smoothstep(u_radius - softWidth, u_radius + softWidth, d);\n" +
"  float signedField = fieldSample - 0.5;\n" +
"  vec2 mbOffset = vec2(signedField, signedField) * u_mbStrength * 0.3;\n" +
"  float haloRange = u_radius * u_haloReach;\n" +
"  float rimDist = abs(d - u_radius);\n" +
"  float t = clamp(rimDist / haloRange, 0.0, 1.0);\n" +
"  float halo = pow(1.0 - t, u_haloCurve);\n" +
"  float warpBoost = 1.0 + halo * u_haloStrength * 3.0;\n" +
"  vec2 uv = gl_FragCoord.xy / u_res;\n" +
"  vec2 st = uv * u_scale + vec2(5.3, 2.7);\n" +
"  float wx = fbm(vec3(st, u_time));\n" +
"  float wy = fbm(vec3(st + vec2(3.7, 1.9), u_time + 1.3));\n" +
"  vec2 baseWarp = vec2(wx, wy) * u_warp;\n" +
"  vec2 extraWarp = vec2(wx, wy) * u_warp * (warpBoost - 1.0);\n" +
"  vec2 warped = st + baseWarp + extraWarp + mbOffset;\n" +
"  float n = fbm(vec3(warped, u_time + 0.7));\n" +
"  n = n * 0.5 + 0.5;\n" +
"  float cycled = abs(sin(n * u_cycles * 3.14159));\n" +
"  cycled = (cycled - 0.5) * u_ncontrast + 0.5; cycled = clamp(cycled, 0.0, 1.0);\n" +
"  cycled = pow(cycled, u_crush); cycled *= u_bright; cycled = clamp(cycled, 0.0, 1.0);\n" +
"  cycled += dither(gl_FragCoord.xy); cycled = clamp(cycled, 0.0, 1.0);\n" +
"  if (u_grainGain > 0.0){ float g = grain1(gl_FragCoord.xy) * 2.0 - 1.0; cycled = clamp(cycled + g * u_grainGain * 0.5, 0.0, 1.0); }\n" +
"  gl_FragColor = vec4(mix(vec3(0.0), u_tint, cycled * u_mix), 1.0);\n" +
"}";

  var TPL = document.createElement("template");
  TPL.innerHTML =
    "<style>:host{position:fixed;inset:0;display:block;z-index:0;background:#0d0d0d}" +
    "canvas{display:block;width:100%;height:100%}</style><canvas></canvas>";

  function parseTint(str) {
    var p = String(str || "").split(",").map(parseFloat);
    return (p.length === 3 && p.every(function (n) { return isFinite(n); })) ? p : [0.812, 0.886, 0.808];
  }

  class CactusChromeBg extends HTMLElement {
    connectedCallback() {
      if (this._init) return; this._init = true;
      var root = this.attachShadow({ mode: "open" });
      root.appendChild(TPL.content.cloneNode(true));
      this._canvas = root.querySelector("canvas");
      this._start();
    }
    disconnectedCallback() { this._disposed = true; }

    _num(attr, def) { var v = parseFloat(this.getAttribute(attr)); return isFinite(v) ? v : def; }

    _start() {
      var canvas = this._canvas;
      var gl = canvas.getContext("webgl", { antialias: false, alpha: false })
            || canvas.getContext("experimental-webgl");
      if (!gl) return;
      var self = this;

      var P = {
        cR: this._num("circle", 150), feather: 26.5,
        nScale: 0.25, nOctaves: 1, nPersist: 0.1, nSpeed: 0.16 * this._num("speed", 1), nWarp: 0.95,
        distortionStrength: 1.0, haloReach: 1.9, haloStrength: this._num("halo", 0.39), haloCurve: 2.7,
        cycles: 2.0, brightness: 1.0, contrast: 1.0, crush: 5.95, mix: 1.0,
        grainScale: 1, grainGain: 0.11, tint: parseTint(this.getAttribute("tint")),
        drift: this.getAttribute("drift") !== "off"
      };
      this.params = P;

      function compile(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
      }
      var prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog); gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      var U = function (n) { return gl.getUniformLocation(prog, n); };
      var u = {};
      ["res","time","scale","oct","persist","warp","cycles","mbStrength","bright","ncontrast",
       "crush","mix","grainScale","grainGain","grainTime","center","radius","feather",
       "haloReach","haloStrength","haloCurve","tint"].forEach(function (k) { u[k] = U("u_" + k); });

      var W = 1, H = 1, baseDim = 1;
      function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cw = self.clientWidth || window.innerWidth, ch = self.clientHeight || window.innerHeight;
        baseDim = Math.min(cw, ch);
        W = Math.round(cw * dpr); H = Math.round(ch * dpr);
        canvas.width = W; canvas.height = H;
      }
      var ro = new ResizeObserver(resize); ro.observe(this); resize();

      var STORE_KEY = "cactusBgDrift";
      var seed = (function () {
        try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
      })();
      var nT = Math.random() * 1000, grainT = 0;
      var driftT = (seed && isFinite(seed.driftT)) ? seed.driftT : 0;
      var cpx = (seed && isFinite(seed.cpxN)) ? seed.cpxN : 0.5;
      var cpy = (seed && isFinite(seed.cpyN)) ? seed.cpyN : 0.5;

      function frame() {
        if (self._disposed) { ro.disconnect(); return; }
        gl.viewport(0, 0, W, H);
        nT += P.nSpeed * 0.003; if (nT > 1000) nT -= 1000;
        grainT = (grainT + 1) % 100;

        if (P.drift) {
          driftT += 0.007;
          var amp = Math.min(1, driftT / 7.0);
          var dx = 0.5 + amp * (0.30 * Math.sin(driftT * 0.085) + 0.12 * Math.sin(driftT * 0.021));
          var dy = 0.5 + amp * (0.26 * Math.sin(driftT * 0.070) + 0.12 * Math.sin(driftT * 0.031));
          cpx += (dx - cpx) * 0.03; cpy += ((1 - dy) - cpy) * 0.03;
          try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ driftT: driftT, cpxN: cpx, cpyN: cpy })); } catch (e) {}
        } else { cpx += (0.5 - cpx) * 0.03; cpy += (0.5 - cpy) * 0.03; }

        var sf = Math.min(W, H) / baseDim;
        gl.uniform2f(u.center, cpx * W, cpy * H);
        gl.uniform1f(u.radius, P.cR * sf);
        gl.uniform1f(u.feather, P.feather * sf);
        gl.uniform1f(u.haloReach, P.haloReach);
        gl.uniform1f(u.haloStrength, P.haloStrength);
        gl.uniform1f(u.haloCurve, P.haloCurve);
        gl.uniform2f(u.res, W, H);
        gl.uniform1f(u.time, nT);
        gl.uniform1f(u.scale, P.nScale);
        gl.uniform1i(u.oct, P.nOctaves | 0);
        gl.uniform1f(u.persist, P.nPersist);
        gl.uniform1f(u.warp, P.nWarp);
        gl.uniform1f(u.cycles, P.cycles);
        gl.uniform1f(u.bright, P.brightness);
        gl.uniform1f(u.ncontrast, P.contrast);
        gl.uniform1f(u.crush, P.crush);
        gl.uniform1f(u.mix, P.mix);
        gl.uniform1f(u.mbStrength, P.distortionStrength);
        gl.uniform1f(u.grainScale, P.grainScale);
        gl.uniform1f(u.grainGain, P.grainGain);
        gl.uniform1f(u.grainTime, grainT);
        gl.uniform3f(u.tint, P.tint[0], P.tint[1], P.tint[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  }
  if (!customElements.get("cactus-chrome-bg")) customElements.define("cactus-chrome-bg", CactusChromeBg);
})();
