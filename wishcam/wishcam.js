/* =========================================================================
   用手许愿 · 摄像头手势彩蛋
   独立层：自己建 DOM / 自己画 canvas / 自己管摄像头，不碰宿主页面的状态机。
   依赖：MediaPipe tasks-vision（动态 import），模型与 wasm 与页面同源。
   资源缺失、微信不给摄像头、用户拒绝授权 → 自动落到触屏玩法。
   ========================================================================= */
(function () {
  'use strict';

  /* 资源默认按本脚本所在目录找：宿主页面不一定和 wishcam 同级。
     import() 在普通脚本里是按脚本地址解析的，所以这里统一给绝对地址。 */
  var SCRIPT_BASE = '';
  try {
    if (document.currentScript && document.currentScript.src) {
      SCRIPT_BASE = document.currentScript.src.replace(/[^/]*$/, '');
    }
  } catch (e) {}

  var GESTURE_FX = {
    ILoveYou:  { fx: 'hearts',    label: '🤟 爱心雨', say: '爱心雨' },
    Open_Palm: { fx: 'tree',      label: '🖐 许愿树', say: '许愿树' },
    Victory:   { fx: 'fireworks', label: '✌️ 烟花',   say: '烟花' },
    Closed_Fist:{ fx: 'converge', label: '✊ 收束',   say: '收束' }
  };
  var FX_ORDER = ['hearts', 'tree', 'fireworks', 'converge'];

  var GOLD = '233,207,154';
  var ROSE = '232,162,168';
  var IVORY = '243,239,230';

  var CSS = [
    ':host{position:fixed;inset:0;z-index:2147483000;display:block;background:#05060a;color:#f3efe6;',
    '  font-family:"Noto Serif SC","Songti SC","STSong","SimSun",serif;-webkit-font-smoothing:antialiased;',
    '  -webkit-tap-highlight-color:transparent;overscroll-behavior:contain;}',
    ':host([hidden]){display:none;}',
    '*{box-sizing:border-box;margin:0;padding:0;}',
    '.fx{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;}',
    '.top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 16px) 20px 0;',
    '  display:flex;align-items:flex-start;justify-content:space-between;pointer-events:none;z-index:4;}',
    '.eyebrow{font-size:10px;letter-spacing:.32em;color:rgba(' + GOLD + ',.55);text-transform:uppercase;}',
    '.h1{font-size:17px;letter-spacing:.16em;margin-top:7px;color:rgba(' + IVORY + ',.9);}',
    '.exit{pointer-events:auto;background:none;border:1px solid rgba(' + IVORY + ',.18);border-radius:999px;',
    '  color:rgba(' + IVORY + ',.62);font:inherit;font-size:12px;letter-spacing:.1em;padding:7px 13px;}',
    '.exit:active{background:rgba(' + IVORY + ',.07);}',
    '.live{position:absolute;left:0;right:0;bottom:0;padding:58px 20px calc(env(safe-area-inset-bottom) + 18px);',
    '  z-index:3;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:10px;',
    '  background:linear-gradient(to top,rgba(5,6,10,.95),rgba(5,6,10,.78) 45%,rgba(5,6,10,0));}',
    '.status{min-height:22px;text-align:center;font-size:13px;letter-spacing:.06em;color:rgba(' + IVORY + ',.72);',
    '  transition:opacity .3s;}',
    '.status b{font-weight:400;color:rgba(' + GOLD + ',.92);}',
    '.status span{display:block;font-size:11px;letter-spacing:.08em;color:rgba(' + IVORY + ',.45);margin-top:4px;}',
    '.legend{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;pointer-events:auto;}',
    '.chip{background:rgba(255,255,255,.025);border:1px solid rgba(' + GOLD + ',.2);border-radius:999px;',
    '  color:rgba(' + IVORY + ',.78);font:inherit;font-size:12.5px;letter-spacing:.04em;padding:8px 12px;',
    '  transition:transform .12s ease,background .2s,border-color .2s;}',
    '.chip:active{transform:scale(.96);background:rgba(' + GOLD + ',.1);border-color:rgba(' + GOLD + ',.45);}',
    '.note{font-size:11px;letter-spacing:.08em;color:rgba(' + IVORY + ',.42);text-align:center;line-height:1.7;}',
    '@media (max-width:380px){.legend{gap:6px;}.chip{padding:8px 10px;}}',
    '.intro{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;',
    '  padding:calc(env(safe-area-inset-top) + 40px) 26px calc(env(safe-area-inset-bottom) + 40px);',
    '  background:radial-gradient(120% 80% at 50% 38%,rgba(15,17,26,.97),#05060a 70%);',
    '  opacity:1;transition:opacity .55s ease;}',
    '.intro.gone{opacity:0;pointer-events:none;}',
    '.introIn{width:100%;max-width:380px;text-align:center;}',
    '.orn{color:rgba(' + GOLD + ',.75);font-size:17px;letter-spacing:.6em;padding-left:.6em;}',
    '.intro h2{font-size:clamp(21px,5.8vw,27px);font-weight:400;line-height:1.65;letter-spacing:.06em;',
    '  margin:22px 0 16px;color:rgba(' + IVORY + ',.94);}',
    '.intro p{font-size:12.5px;line-height:2;letter-spacing:.04em;color:rgba(' + IVORY + ',.46);}',
    '.primary{margin-top:28px;width:100%;background:rgba(' + GOLD + ',.94);border:0;border-radius:999px;',
    '  color:#17130b;font:inherit;font-size:14px;letter-spacing:.16em;padding:14px 20px;font-weight:600;}',
    '.primary:active{background:rgba(' + GOLD + ',.8);}',
    '.primary[disabled]{opacity:.45;}',
    '.link{margin-top:16px;background:none;border:0;color:rgba(' + IVORY + ',.52);font:inherit;font-size:12px;',
    '  letter-spacing:.1em;padding:6px 10px;display:block;width:100%;}',
    '.link:active{color:rgba(' + IVORY + ',.75);}',
    '.progress{width:120px;height:1px;background:rgba(' + IVORY + ',.12);margin:18px auto 8px;overflow:hidden;}',
    '.progress i{display:block;height:100%;width:0;background:rgba(' + GOLD + ',.8);transition:width .2s;}',
    '.progressText{font-size:11px;letter-spacing:.1em;color:rgba(' + IVORY + ',.42);min-height:15px;}',
    '.card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;width:min(86vw,340px);',
    '  background:#0b0d14;border:1px solid rgba(' + GOLD + ',.22);border-radius:18px;padding:24px 22px;',
    '  text-align:center;display:none;}',
    '.card.on{display:block;}',
    '.card h3{font-size:16px;font-weight:400;letter-spacing:.08em;margin-bottom:10px;color:rgba(' + IVORY + ',.9);}',
    '.card p{font-size:12px;line-height:1.9;color:rgba(' + IVORY + ',.46);white-space:pre-line;}',
    '.card .primary{margin-top:18px;}',
    '.card .row{display:flex;gap:8px;margin-top:10px;}',
    '.card .row .primary{margin:0;flex:1;font-size:12.5px;padding:11px 8px;letter-spacing:.06em;}',
    '.card .row .link{flex:1;width:auto;margin:0;border:1px solid rgba(' + IVORY + ',.16);border-radius:999px;padding:11px 8px;}',
    '.cam{position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none;}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
  ].join('');

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function nowMs() { return performance.now(); }

  function roundPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeHeart(c1, c2, glow) {
    var s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(s * .38, s * .32, 2, s * .5, s * .52, s * .6);
    grd.addColorStop(0, c1);
    grd.addColorStop(1, c2);
    g.fillStyle = grd;
    g.shadowColor = glow;
    g.shadowBlur = 9;
    g.beginPath();
    g.moveTo(s * .5, s * .88);
    g.bezierCurveTo(s * .06, s * .58, s * .07, s * .16, s * .32, s * .17);
    g.bezierCurveTo(s * .44, s * .17, s * .5, s * .3, s * .5, s * .37);
    g.bezierCurveTo(s * .5, s * .3, s * .56, s * .17, s * .68, s * .17);
    g.bezierCurveTo(s * .93, s * .16, s * .94, s * .58, s * .5, s * .88);
    g.closePath();
    g.fill();
    return c;
  }

  function makeBlossom(c1, c2) {
    var s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(s * .5, s * .5, 1, s * .5, s * .5, s * .5);
    grd.addColorStop(0, c1);
    grd.addColorStop(1, c2);
    g.fillStyle = grd;
    g.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      g.ellipse(s * .5 + Math.cos(a) * s * .2, s * .5 + Math.sin(a) * s * .2, s * .17, s * .12, a, 0, Math.PI * 2);
    }
    g.fill();
    return c;
  }

  function mount(opts) {
    opts = opts || {};
    var cfg = {
      vendorURL: opts.vendorURL || (SCRIPT_BASE + 'vision_bundle.js'),
      wasmPath: opts.wasmPath || (SCRIPT_BASE + 'wasm'),
      modelURL: opts.modelURL || (SCRIPT_BASE + 'gesture_recognizer.task'),
      name: opts.name || '佳欣',
      title: opts.title || '用手许个愿',
      eyebrow: opts.eyebrow || 'A SMALL WISH',
      onClose: opts.onClose || null,
      exposeGlobal: opts.exposeGlobal !== false,
      autoOpen: !!opts.autoOpen,
      touch: !!opts.touch,
      debug: !!opts.debug
    };

    var host = null, root = null, ui = null;
    var canvas = null, ctx = null;
    var video = null;
    var S = {
      open: false, W: 0, H: 0, dpr: 1,
      preview: null, cover: null, stars: [],
      raf: 0, lastFrame: 0, lastFx: 0,
      cameraOn: false, stream: null, videoReady: false,
      rec: null, engineState: 'idle', engineError: '',
      modelBytes: 0, modelTotal: 0,
      hand: null, handAt: 0,
      candidate: 'None', candN: 0, lastGesture: '', lastGestureAt: 0, lastTrigger: 0,
      noneSince: 0,
      statusKey: '', effects: [], touchMode: false, started: false,
      intro: true, error: '', detectCount: 0, lastInfer: 0, inferMs: 0,
      introTimer: 0, entry: null, prevOverflow: ''
    };

    var heartSprites = null, blossomSprites = null;

    /* ---------------- DOM ---------------- */
    function build() {
      if (host) return;
      host = document.createElement('div');
      host.id = 'wishcamHost';
      root = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = CSS;
      root.appendChild(style);

      var wrap = document.createElement('div');
      wrap.innerHTML = [
        '<canvas class="fx" aria-hidden="true"></canvas>',
        '<header class="top"><div><div class="eyebrow"></div><div class="h1"></div></div>',
        '  <button class="exit" type="button">回到信</button></header>',
        '<section class="intro">',
        '  <div class="introIn">',
        '    <div class="orn">✦</div>',
        '    <h2>最后一件事，<br>得借你的手。</h2>',
        '    <p>比一个手势，会出现一点东西。<br>画面只在手机里处理，<br>不上传、不保存；退出就关摄像头。</p>',
        '    <button class="primary startCam" type="button">打开镜头</button>',
        '    <div class="progress"><i></i></div>',
        '    <div class="progressText">第一次用要下载约 8 MB 手势引擎</div>',
        '    <button class="link touchBtn" type="button">不开镜头，用手点</button>',
        '    <button class="link closeBtn" type="button">先不看了</button>',
        '  </div>',
        '</section>',
        '<div class="live">',
        '  <div class="status"><b></b><span></span></div>',
        '  <div class="legend">' + FX_ORDER.map(function (k) {
          var g = null;
          for (var key in GESTURE_FX) if (GESTURE_FX[key].fx === k) g = GESTURE_FX[key];
          return '<button class="chip" type="button" data-fx="' + k + '">' + (g ? g.label : k) + '</button>';
        }).join('') + '</div>',
        '  <div class="note">比出同一个手势停一下才算数<br>开不了镜头就点上面的按钮</div>',
        '</div>',
        '<div class="card"><h3></h3><p></p><div class="row"></div></div>',
        '<video class="cam" playsinline muted autoplay aria-hidden="true"></video>',
        '<div class="sr" role="status" aria-live="polite"></div>'
      ].join('');
      while (wrap.firstChild) root.appendChild(wrap.firstChild);

      ui = {
        canvas: root.querySelector('.fx'),
        top: root.querySelector('.top'),
        eyebrow: root.querySelector('.eyebrow'),
        h1: root.querySelector('.h1'),
        exit: root.querySelector('.exit'),
        intro: root.querySelector('.intro'),
        startCam: root.querySelector('.startCam'),
        progress: root.querySelector('.progress i'),
        progressText: root.querySelector('.progressText'),
        touchBtn: root.querySelector('.touchBtn'),
        closeBtn: root.querySelector('.closeBtn'),
        live: root.querySelector('.live'),
        status: root.querySelector('.status'),
        statusB: root.querySelector('.status b'),
        statusS: root.querySelector('.status span'),
        legend: root.querySelector('.legend'),
        note: root.querySelector('.note'),
        card: root.querySelector('.card'),
        cardH: root.querySelector('.card h3'),
        cardP: root.querySelector('.card p'),
        cardRow: root.querySelector('.card .row'),
        video: root.querySelector('.cam'),
        sr: root.querySelector('.sr')
      };
      ui.eyebrow.textContent = cfg.eyebrow;
      ui.h1.textContent = cfg.title;
      canvas = ui.canvas;
      ctx = canvas.getContext('2d');
      video = ui.video;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.muted = true;

      document.body.appendChild(host);
      bind();
      resize();
      buildSprites();
    }

    function bind() {
      ui.exit.addEventListener('click', close);
      ui.closeBtn.addEventListener('click', close);
      ui.startCam.addEventListener('click', startCamera);
      ui.touchBtn.addEventListener('click', startTouch);
      ui.legend.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fx]');
        if (!b) return;
        triggerEffect(b.getAttribute('data-fx'));
      });
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
      document.addEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (!S.open) return;
      if (e.key === 'Escape') close();
    }

    function buildSprites() {
      heartSprites = [
        makeHeart('rgba(250,226,226,1)', 'rgba(214,116,126,1)', 'rgba(' + ROSE + ',.65)'),
        makeHeart('rgba(250,238,210,1)', 'rgba(206,166,96,1)', 'rgba(' + GOLD + ',.6)'),
        makeHeart('rgba(255,250,242,1)', 'rgba(224,204,176,1)', 'rgba(' + IVORY + ',.5)')
      ];
      blossomSprites = [
        makeBlossom('rgba(250,226,226,1)', 'rgba(212,124,134,.15)'),
        makeBlossom('rgba(250,238,210,1)', 'rgba(206,166,96,.12)'),
        makeBlossom('rgba(255,250,242,1)', 'rgba(230,214,190,.12)')
      ];
    }

    /* ---------------- 尺寸 ---------------- */
    function resize() {
      if (!host || !canvas) return;
      var r = host.getBoundingClientRect();
      S.W = Math.max(1, Math.round(r.width || window.innerWidth));
      S.H = Math.max(1, Math.round(r.height || window.innerHeight));
      S.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(S.W * S.dpr);
      canvas.height = Math.round(S.H * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      layoutPreview();
      makeStars();
    }

    function layoutPreview() {
      var W = S.W, H = S.H;
      var ph = Math.min(W * .84 * .75, H * .42, 380);
      var pw = ph / .75;
      var x = (W - pw) / 2;
      var y = Math.max(74, H * .16);
      S.preview = { x: x, y: y, w: pw, h: ph, r: Math.min(22, pw * .06) };
    }

    function makeStars() {
      var rng = mulberry32(20261123);
      var n = Math.round(clamp(S.W * S.H / 9000, 34, 90));
      S.stars = [];
      for (var i = 0; i < n; i++) {
        S.stars.push({
          x: rng() * S.W, y: rng() * S.H, r: .5 + rng() * 1.4,
          a: .08 + rng() * .3, sp: .4 + rng() * 1.2, ph: rng() * Math.PI * 2
        });
      }
    }

    /* ---------------- 开关 ---------------- */
    function open() {
      if (S.open) return;
      build();
      host.hidden = false;
      S.open = true; S.intro = true; S.started = false; S.touchMode = false;
      S.error = ''; S.engineState = 'idle'; S.engineError = '';
      S.effects.length = 0; S.hand = null; S.handAt = 0;
      S.statusKey = ''; S.lastDetect = 0;
      S.candidate = 'None'; S.candN = 0; S.lastGesture = ''; S.lastGestureAt = 0;
      S.cameraOn = false; S.videoReady = false; S.detectCount = 0;
      hideCard();
      ui.intro.classList.remove('gone');
      ui.statusB.textContent = '';
      ui.statusS.textContent = '';
      ui.progress.style.width = '0%';
      ui.progressText.textContent = '第一次用要下载约 8 MB 手势引擎';
      setNote(NOTE_CAM);
      ui.startCam.disabled = false;
      S.prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      if (S.entry) S.entry.classList.add('off');
      resize();
      S.lastFrame = nowMs(); S.lastFx = S.lastFrame;
      if (!S.raf) S.raf = requestAnimationFrame(loop);
      setTimeout(function () { if (S.open) ui.startCam.focus(); }, 80);
      if (cfg.touch) startTouch();
    }

    function close() {
      if (!S.open) return;
      S.open = false;
      stopCamera();
      if (S.rec && S.rec.close) { try { S.rec.close(); } catch (e) {} }
      S.rec = null; S.engineState = 'idle';
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
      S.effects.length = 0;
      if (host) host.hidden = true;
      document.body.style.overflow = S.prevOverflow || '';
      if (S.entry) S.entry.classList.remove('off');
      if (cfg.onClose) { try { cfg.onClose(); } catch (e) {} }
    }

    function stopCamera() {
      if (S.stream) {
        try { S.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      }
      S.stream = null; S.cameraOn = false; S.videoReady = false;
      if (video) { try { video.pause(); } catch (e) {} video.srcObject = null; }
    }

    /* ---------------- 摄像头 ---------------- */
    function startCamera() {
      if (S.cameraOn || S.touchMode) return;
      S.started = true;
      ui.intro.classList.add('gone');
      S.intro = false;
      setNote(NOTE_CAM);
      setStatus('正在打开镜头…', '');
      /* 到这一步才下模型：只用触屏的话不花这 8 MB */
      loadEngine();
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) {
        showError('这个浏览器不给网页开摄像头。\n可以换 Safari / Chrome 打开，或者直接用触屏玩。');
        return;
      }
      var constraints = {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 }
        }
      };
      var p;
      try { p = md.getUserMedia(constraints); }
      catch (e) { showError(cameraReason(e)); return; }
      p.then(function (stream) {
        if (!S.open) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        S.stream = stream;
        S.cameraOn = true;
        video.srcObject = stream;
        var kick = video.play();
        if (kick && kick.catch) kick.catch(function () {});
        return waitVideo().then(function () {
          if (!video.videoWidth || video.videoWidth < 160) {
            showError('摄像头画面没有出来。\n可以收起页面再打开一次，或者直接用触屏玩。');
            return;
          }
          S.videoReady = true;
          if (S.engineState === 'ready') setStatus('把手伸进来，离镜头一臂远', '比 🤟 🖐 ✌️ ✊');
          else if (S.engineState === 'error') setStatus('镜头开了，手势引擎没加载上', '可以先用手点');
          else setStatus('镜头好了，正在准备手势引擎…', '');
        });
      }).catch(function (e) {
        showError(cameraReason(e));
      });
    }

    function waitVideo() {
      return new Promise(function (resolve) {
        var done = false, ticks = 0;
        function ok() {
          if (done) return;
          if (video.readyState >= 2 && video.videoWidth >= 160) { done = true; stop(); resolve(); }
        }
        var iv = setInterval(function () {
          ok();
          if (!done && ++ticks > 80) { done = true; stop(); resolve(); }
        }, 100);
        function stop() { clearInterval(iv); video.removeEventListener('loadedmetadata', ok); video.removeEventListener('playing', ok); }
        video.addEventListener('loadedmetadata', ok);
        video.addEventListener('playing', ok);
      });
    }

    function cameraReason(e) {
      var n = (e && e.name) || '';
      if (n === 'NotAllowedError' || n === 'SecurityError') {
        return '没有拿到摄像头权限。\n可能是你点了拒绝，也可能是微信这类内置浏览器不给开。\n可以用手机自带的 Safari / Chrome 再试，或者直接用触屏玩。';
      }
      if (n === 'NotFoundError' || n === 'OverconstrainedError') {
        return '没找到能用的前置摄像头。';
      }
      if (n === 'NotReadableError' || n === 'AbortError') {
        return '摄像头被别的应用占着，关掉那个应用再试。';
      }
      if (!window.isSecureContext) {
        return '这个页面不是 HTTPS，浏览器不允许开摄像头。';
      }
      return '摄像头没能打开。\n' + (e && e.message ? e.message : '原因不明');
    }

    function startTouch() {
      if (S.cameraOn) { stopCamera(); }
      S.started = true; S.touchMode = true; S.intro = false;
      ui.intro.classList.add('gone');
      hideCard();
      setNote(NOTE_TOUCH);
      setStatus('现在是手指模式', '点下面的按钮，效果一样');
    }

    function showError(msg) {
      S.error = msg;
      stopCamera();
      setStatus('摄像头没开成', '可以先用手点');
      showCard('摄像头没开成', msg, [
        { text: '再试一次', primary: true, fn: function () { hideCard(); startCamera(); } },
        { text: '用触屏玩', fn: function () { hideCard(); startTouch(); } }
      ]);
    }

    function showCard(title, body, buttons) {
      ui.cardH.textContent = title;
      ui.cardP.textContent = body;
      ui.cardRow.innerHTML = '';
      buttons.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = b.primary ? 'primary' : 'link';
        el.style.margin = '0';
        el.textContent = b.text;
        el.addEventListener('click', b.fn);
        ui.cardRow.appendChild(el);
      });
      ui.card.classList.add('on');
    }

    function hideCard() { if (ui) ui.card.classList.remove('on'); }

    /* ---------------- 手势引擎 ---------------- */
    function loadEngine() {
      if (S.engineState === 'ready' || S.engineState === 'loading') return;
      S.engineState = 'loading';
      setProgress(0, '正在下载手势引擎…');
      var t0 = nowMs();
      fetchModel().then(function (bytes) {
        S.modelBytes = bytes.byteLength;
        setProgress(.55, '正在启动引擎…');
        return import(cfg.vendorURL).then(function (mod) {
          var fileset = mod.FilesetResolver.forVisionTasks(String(cfg.wasmPath).replace(/\/+$/, ''));
          return fileset.then(function (fs) {
            var base = { modelAssetBuffer: new Uint8Array(bytes) };
            var mk = function (delegate) {
              return mod.GestureRecognizer.createFromOptions(fs, {
                baseOptions: Object.assign({}, base, { delegate: delegate }),
                runningMode: 'VIDEO',
                numHands: 1,
                minHandDetectionConfidence: .5,
                minHandPresenceConfidence: .5,
                minTrackingConfidence: .5
              });
            };
            return mk('GPU').catch(function () { return mk('CPU'); });
          });
        });
      }).then(function (rec) {
        if (!S.open) {
          try { rec.close(); } catch (e) {}
          S.engineState = 'idle';
          return;
        }
        S.rec = rec;
        S.engineState = 'ready';
        S.inferMs = Math.round(nowMs() - t0);
        setProgress(1, '手势引擎就绪 · ' + (S.modelBytes / 1048576).toFixed(1) + ' MB');
        if (S.cameraOn && S.videoReady) setStatus('把手伸进来，离镜头一臂远', '比 🤟 🖐 ✌️ ✊');
        log('engine ready in ' + S.inferMs + 'ms');
      }).catch(function (e) {
        S.engineState = 'error';
        S.engineError = String((e && e.message) || e);
        setProgress(0, '手势引擎没加载上；可以点下面用触屏玩');
        setStatus('手势引擎没加载上', '点下面的按钮，效果一样');
        log('engine error: ' + S.engineError);
      });
    }

    function fetchModel() {
      setProgress(.04, '正在下载手势模型…');
      return fetch(cfg.modelURL, { cache: 'force-cache' }).then(function (res) {
        if (!res.ok) throw new Error('模型 HTTP ' + res.status);
        var total = Number(res.headers.get('content-length')) || 0;
        S.modelTotal = total;
        if (!res.body || !res.body.getReader) return res.arrayBuffer();
        var reader = res.body.getReader();
        var chunks = [], got = 0;
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              var out = new Uint8Array(got), off = 0;
              chunks.forEach(function (c) { out.set(c, off); off += c.length; });
              return out.buffer;
            }
            chunks.push(r.value); got += r.value.length;
            if (total) setProgress(.04 + .5 * got / total, '正在下载手势模型 ' + (got / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB');
            else setProgress(.3, '正在下载手势模型 ' + (got / 1048576).toFixed(1) + ' MB');
            return pump();
          });
        }
        return pump();
      });
    }

    function setProgress(p, text) {
      if (S.intro) {
        ui.progress.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
        ui.progressText.textContent = text;
      } else if (text) {
        ui.progressText.textContent = text;
        if (S.engineState === 'loading') setStatus(text, '');
      }
    }

    function detect(now) {
      if (!S.rec || !S.videoReady || !S.cameraOn) return;
      if (!video || !video.videoWidth || video.videoWidth < 160 || !video.videoHeight) return;
      if (now - S.lastDetect < 85) return;
      S.lastDetect = now;
      var res;
      try { res = S.rec.recognizeForVideo(video, now); }
      catch (e) {
        S.engineError = String((e && e.message) || e);
        S.engineState = 'error';
        try { S.rec.close(); } catch (err) {}
        S.rec = null;
        setStatus('手势识别断了，用手点也一样', '');
        log('detect error: ' + S.engineError);
        return;
      }
      S.detectCount++;
      if (res && res.landmarks && res.landmarks.length) {
        S.hand = res.landmarks[0];
        S.handAt = now;
        var g = res.gestures && res.gestures.length ? res.gestures[0][0] : null;
        var name = g ? g.categoryName : 'None';
        var score = g ? g.score : 0;
        if (score >= .55) {
          S.noneSince = 0;
          if (name === S.candidate) S.candN++;
          else { S.candidate = name; S.candN = 1; }
          if (S.candN === 3) onGesture(name, now);
        } else {
          S.candidate = 'None'; S.candN = 0;
          /* 手还举着、只是松开了手指：也算“放下过一次”，同一个手势可以再来 */
          if (!S.noneSince) S.noneSince = now;
          else if (now - S.noneSince > 800) S.lastGesture = '';
        }
      } else {
        S.hand = null;
        S.candidate = 'None'; S.candN = 0; S.noneSince = 0;
        if (S.lastGesture && now - S.lastGestureAt > 900) S.lastGesture = '';
        if (!S.touchMode) setStatus('把手伸进来，离镜头一臂远', '比 🤟 🖐 ✌️ ✊');
      }
    }

    function onGesture(name, now) {
      if (!name || name === 'None') return;
      var meta = GESTURE_FX[name];
      if (!meta) {
        if (!S.lastGesture) setStatus('看到了一个手势', '再试试 🤟 🖐 ✌️ ✊');
        S.lastGesture = name; S.lastGestureAt = now;
        return;
      }
      if (name === S.lastGesture) return;
      if (now - S.lastTrigger < 900) return;
      S.lastGesture = name; S.lastGestureAt = now; S.lastTrigger = now;
      triggerEffect(meta.fx);
      setStatus(meta.say, '手放下来，再比一次');
      log('gesture ' + name + ' -> ' + meta.fx);
    }

    /* ---------------- 特效 ---------------- */
    function triggerEffect(kind) {
      if (!S.open) return;
      if (!S.started) { S.started = true; ui.intro.classList.add('gone'); S.intro = false; }
      var t0 = nowMs();
      if (kind === 'hearts') S.effects.push(fxHearts(t0));
      else if (kind === 'tree') S.effects.push(fxTree(t0));
      else if (kind === 'fireworks') S.effects.push(fxFireworks(t0));
      else if (kind === 'converge') S.effects.push(fxConverge(t0));
      if (S.effects.length > 5) S.effects.splice(0, S.effects.length - 5);
    }

    function handX() {
      if (!S.hand || nowMs() - S.handAt > 700) return .5;
      return clamp(1 - S.hand[9].x, 0, 1);   // 预览是镜像的，落点也跟着镜像
    }

    function fxHearts(t0) {
      var f = { kind: 'hearts', t0: t0, dur: 7.2, parts: [], acc: 0, seed: Math.random() };
      f.update = function (now, dt) {
        var t = (now - f.t0) / 1000;
        var wx = (handX() - .5) * 90;
        if (t < 5.1) {
          f.acc += dt * 13;
          while (f.acc >= 1) {
            f.acc -= 1;
            f.parts.push({
              x: rand(-20, S.W + 20), y: -30,
              vy: rand(55, 135), vx: rand(-12, 12),
              size: rand(9, 24), rot: rand(-.6, .6), vr: rand(-.5, .5),
              ph: rand(0, 7), sp: rand(.6, 1.5), spr: Math.random() < .55 ? 0 : (Math.random() < .55 ? 1 : 2)
            });
          }
        }
        for (var i = f.parts.length - 1; i >= 0; i--) {
          var p = f.parts[i];
          p.y += p.vy * dt;
          p.x += (p.vx + Math.sin(t * p.sp + p.ph) * 18 + wx * .35) * dt;
          p.rot += p.vr * dt;
          if (p.y > S.H + 40 || p.x < -60 || p.x > S.W + 60) f.parts.splice(i, 1);
        }
      };
      f.draw = function (g, now) {
        var t = (now - f.t0) / 1000;
        var fade = t > 5.8 ? clamp((f.dur - t) / 1.4, 0, 1) : 1;
        for (var i = 0; i < f.parts.length; i++) {
          var p = f.parts[i];
          g.save();
          g.globalAlpha = fade * .92;
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.drawImage(heartSprites[p.spr], -p.size / 2, -p.size / 2, p.size, p.size);
          g.restore();
        }
      };
      return f;
    }

    function fxTree(t0) {
      var seed = Math.floor(Math.random() * 1e9);
      var tree = buildTree(seed);
      var f = { kind: 'tree', t0: t0, dur: 9.5, tree: tree, seed: seed };
      f.update = function () {};
      f.draw = function (g, now) {
        var t = (now - f.t0) / 1000;
        var fade = t > 7.6 ? clamp((f.dur - t) / 1.9, 0, 1) : 1;
        var sway = (handX() - .5) * .05 + Math.sin(t * .8) * .012;
        g.save();
        g.globalAlpha = fade;
        g.translate(S.W / 2, S.H + 6);
        g.rotate(sway);
        g.translate(-S.W / 2, -(S.H + 6));
        /* 地光 */
        var gr = g.createRadialGradient(S.W / 2, S.H + 30, 4, S.W / 2, S.H + 30, Math.min(S.W * .42, 260));
        gr.addColorStop(0, 'rgba(' + GOLD + ',.16)');
        gr.addColorStop(1, 'rgba(' + GOLD + ',0)');
        g.fillStyle = gr;
        g.beginPath(); g.ellipse(S.W / 2, S.H + 20, Math.min(S.W * .46, 300), 60, 0, 0, Math.PI * 2); g.fill();
        /* 树枝：按粗细分组，两遍描（宽而淡 = 光晕，细而亮 = 枝干） */
        var segs = tree.segs;
        var paths = tree.paths;
        for (var z = 0; z < paths.length; z++) paths[z] = new Path2D();
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          var p = clamp((t - s.t0) / s.dur, 0, 1);
          if (p <= 0) continue;
          var x2 = s.x + (s.x2 - s.x) * p;
          var y2 = s.y + (s.y2 - s.y) * p;
          var path = paths[s.k];
          path.moveTo(s.x, s.y);
          path.lineTo(x2, y2);
        }
        g.lineCap = 'round';
        g.globalCompositeOperation = 'lighter';
        /* 树干往下渐隐，别扎进底部的字里 */
        var glowGrad = g.createLinearGradient(0, S.H - 300, 0, S.H - 120);
        glowGrad.addColorStop(0, 'rgba(' + GOLD + ',.085)');
        glowGrad.addColorStop(1, 'rgba(' + GOLD + ',0)');
        var coreGrad = g.createLinearGradient(0, S.H - 300, 0, S.H - 120);
        coreGrad.addColorStop(0, 'rgba(' + GOLD + ',.78)');
        coreGrad.addColorStop(1, 'rgba(' + GOLD + ',0)');
        for (var b = 0; b < paths.length; b++) {
          var w = 1.05 + b * .92;
          g.strokeStyle = glowGrad;
          g.lineWidth = w * 3.4 + 3;
          g.stroke(paths[b]);
          g.strokeStyle = coreGrad;
          g.lineWidth = w;
          g.stroke(paths[b]);
        }
        /* 花 */
        g.globalCompositeOperation = 'source-over';
        for (var j = 0; j < tree.blooms.length; j++) {
          var bm = tree.blooms[j];
          var q = clamp((t - bm.t0) / .55, 0, 1);
          if (q <= 0) continue;
          var pop = easeOut(q);
          var br = (bm.r * (.35 + .65 * pop)) * (1 + Math.sin(t * 1.7 + bm.ph) * .08);
          g.globalAlpha = fade * .85 * pop;
          g.drawImage(blossomSprites[bm.spr], bm.x - br, bm.y - br, br * 2, br * 2);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.restore();
      };
      return f;
    }

    function buildTree(seed) {
      var rng = mulberry32(seed);
      var segs = [], blooms = [], paths = [];
      for (var pi = 0; pi < 10; pi++) paths.push(new Path2D());
      var rootX = S.W / 2, rootY = S.H + 10;
      var top = S.H * .18;
      function branch(x, y, ang, len, thick, depth, t0) {
        var x2 = x + Math.cos(ang) * len;
        var y2 = y + Math.sin(ang) * len;
        var dur = .30 + depth * .045;
        segs.push({ x: x, y: y, x2: x2, y2: y2, thick: thick, t0: t0, dur: dur,
          k: clamp(Math.round(thick), 1, 9) });
        if (depth <= 0 || len < 9 || y2 < top) {
          var n = 2 + Math.floor(rng() * 3);
          for (var k = 0; k < n; k++) {
            var aa = rng() * Math.PI * 2, rr = 2 + rng() * 6;
            blooms.push({
              x: x2 + Math.cos(aa) * rr, y: y2 + Math.sin(aa) * rr * .8,
              r: 3.5 + rng() * 3, spr: rng() < .5 ? 0 : (rng() < .55 ? 1 : 2),
              t0: t0 + dur + rng() * .5, ph: rng() * 6.28
            });
          }
          if (depth <= 0) {
            blooms.push({
              x: x2 + rand(-3, 3), y: y2 + rand(-3, 3),
              r: 4 + rng() * 3, spr: rng() < .5 ? 2 : 0,
              t0: t0 + dur + .1 + rng() * .4, ph: rng() * 6.28
            });
          }
          return;
        }
        /* 主干往上续，侧枝从不同高度斜出去：不会变成一把伞 */
        var ta = -Math.PI / 2 + clamp(ang + Math.PI / 2 + (rng() - .5) * .22, -.4, .4);
        branch(x2, y2, ta, len * (.74 + rng() * .08), thick * .72, depth - 1, t0 + dur * .62);
        if (depth <= 5 && (depth <= 2 || rng() < .8)) {
          var side = rng() < .5 ? -1 : 1;
          var sa = -Math.PI / 2 + clamp(ang + Math.PI / 2 + side * (.42 + rng() * .38), -1, 1);
          branch(x2, y2, sa, len * (.56 + rng() * .16), thick * (.52 + rng() * .12),
            Math.max(0, depth - 1), t0 + dur * (.42 + rng() * .28));
        }
      }
      branch(rootX, rootY, -Math.PI / 2 + (rng() - .5) * .08, S.H * .165, 12, 7, 0);
      return { segs: segs, blooms: blooms, paths: paths };
    }

    function fxFireworks(t0) {
      var f = { kind: 'fireworks', t0: t0, dur: 6.4, parts: [], bursts: [], flash: 0 };
      for (var i = 0; i < 6; i++) {
        f.bursts.push({
          t: .15 + i * .28,
          x: rand(S.W * .16, S.W * .84),
          y: rand(S.H * .16, S.H * .58),
          hue: i % 3, done: false
        });
      }
      f.update = function (now, dt) {
        var t = (now - f.t0) / 1000;
        for (var i = 0; i < f.bursts.length; i++) {
          var b = f.bursts[i];
          if (!b.done && t >= b.t) {
            b.done = true;
            var n = 84;
            for (var k = 0; k < n; k++) {
              var a = Math.PI * 2 * k / n + rand(-.04, .04);
              var sp = rand(70, 240) * (k % 7 === 0 ? 1.35 : 1);
              f.parts.push({
                x: b.x, y: b.y, px: b.x, py: b.y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: rand(.9, 1.9), age: 0, spr: b.hue, w: rand(1, 2.4)
              });
            }
            b.born = t;
            f.flash = 1;
          }
        }
        f.flash = Math.max(0, f.flash - dt * 4);
        for (var j = f.parts.length - 1; j >= 0; j--) {
          var p = f.parts[j];
          p.age += dt;
          if (p.age >= p.life) { f.parts.splice(j, 1); continue; }
          p.px = p.x; p.py = p.y;
          p.vy += 95 * dt;
          p.vx *= .988; p.vy *= .988;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      };
      f.draw = function (g, now) {
        var t = (now - f.t0) / 1000;
        var fade = t > 4.9 ? clamp((f.dur - t) / 1.5, 0, 1) : 1;
        if (f.flash > .01) {
          g.fillStyle = 'rgba(255,246,226,' + (f.flash * .035).toFixed(3) + ')';
          g.fillRect(0, 0, S.W, S.H);
        }
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (var b2 = 0; b2 < f.bursts.length; b2++) {
          var bb = f.bursts[b2];
          var age = t - (bb.born || 0);
          if (!bb.born || age < 0 || age > .42) continue;
          var fl = 1 - age / .42;
          var gr = g.createRadialGradient(bb.x, bb.y, 2, bb.x, bb.y, 54 + 40 * (1 - fl));
          gr.addColorStop(0, 'rgba(255,244,224,' + (.30 * fl * fade).toFixed(3) + ')');
          gr.addColorStop(1, 'rgba(255,244,224,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(bb.x, bb.y, 94, 0, Math.PI * 2); g.fill();
        }
        for (var i = 0; i < f.parts.length; i++) {
          var p = f.parts[i];
          var lf = 1 - p.age / p.life;
          var col = p.spr === 0 ? ROSE : p.spr === 1 ? GOLD : IVORY;
          var al = lf * fade * .95;
          g.strokeStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
          g.lineWidth = p.w;
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
          g.fillStyle = 'rgba(' + col + ',' + (al * .9).toFixed(3) + ')';
          g.beginPath(); g.arc(p.x, p.y, p.w * .62, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        g.globalAlpha = 1;
      };
      return f;
    }

    function fxConverge(t0) {
      var f = { kind: 'converge', t0: t0, dur: 6.6, parts: [], text: 0 };
      var cx = S.W / 2, cy = S.H * .62;
      for (var i = 0; i < 210; i++) {
        var a = rand(0, Math.PI * 2), rr = rand(Math.min(S.W, S.H) * .34, Math.max(S.W, S.H) * .78);
        var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * .8;
        f.parts.push({
          x: x, y: y, px: x, py: y,
          sx: x, sy: y, delay: rand(0, .55), dur: rand(.9, 1.6),
          spr: Math.floor(rand(0, 3)), w: rand(.7, 1.8)
        });
      }
      f.update = function (now, dt) {
        var t = (now - f.t0) / 1000;
        f.text = clamp((t - .55) / .8, 0, 1);
        for (var i = 0; i < f.parts.length; i++) {
          var p = f.parts[i];
          var q = clamp((t - p.delay) / p.dur, 0, 1);
          var e = easeInOut(q);
          p.px = p.x; p.py = p.y;
          p.x = p.sx + (cx - p.sx) * e;
          p.y = p.sy + (cy - p.sy) * e;
        }
      };
      f.draw = function (g, now) {
        var t = (now - f.t0) / 1000;
        var fade = t > 5.6 ? clamp((f.dur - t) / 1, 0, 1) : 1;
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (var i = 0; i < f.parts.length; i++) {
          var p = f.parts[i];
          var q = clamp((t - p.delay) / p.dur, 0, 1);
          if (q >= 1) continue;
          var col = p.spr === 0 ? ROSE : p.spr === 1 ? GOLD : IVORY;
          var al = Math.sin(q * Math.PI) * .8 * fade;
          g.strokeStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
          g.lineWidth = p.w;
          g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(p.x, p.y); g.stroke();
        }
        g.restore();
        if (f.text > 0) {
          var ta = f.text * fade;
          var scale = .96 + .04 * f.text;
          g.save();
          g.translate(S.W / 2, S.H * .62);
          g.scale(scale, scale);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.shadowColor = 'rgba(' + GOLD + ',' + (.55 * ta).toFixed(3) + ')';
          g.shadowBlur = 26;
          g.fillStyle = 'rgba(' + IVORY + ',' + (.95 * ta).toFixed(3) + ')';
          g.font = '400 15px "Noto Serif SC","Songti SC",serif';
          g.fillText(cfg.name, 0, -40);
          g.font = '400 38px "Noto Serif SC","Songti SC",serif';
          g.fillText('生日快乐', 0, 6);
          g.shadowBlur = 0;
          g.strokeStyle = 'rgba(' + GOLD + ',' + (.25 * ta).toFixed(3) + ')';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(0, 34, 88, 9, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      };
      return f;
    }

    /* ---------------- 渲染 ---------------- */
    function loop(now) {
      if (!S.open) { S.raf = 0; return; }
      S.raf = requestAnimationFrame(loop);
      var dt = (now - S.lastFrame) / 1000;
      if (!isFinite(dt) || dt <= 0) dt = .016;
      dt = Math.min(dt, .05);
      S.lastFrame = now;
      detect(now);
      for (var i = S.effects.length - 1; i >= 0; i--) {
        var f = S.effects[i];
        if (f.update) f.update(now, dt);
        if ((now - f.t0) / 1000 > f.dur) S.effects.splice(i, 1);
      }
      draw(now);
    }

    function draw(now) {
      var g = ctx;
      g.clearRect(0, 0, S.W, S.H);
      drawStars(g, now);
      drawPreview(g, now);
      for (var i = 0; i < S.effects.length; i++) S.effects[i].draw(g, now);
      drawHand(g, now);
    }

    function drawStars(g, now) {
      var t = now / 1000;
      for (var i = 0; i < S.stars.length; i++) {
        var s = S.stars[i];
        var a = s.a * (.55 + .45 * Math.sin(t * s.sp + s.ph));
        g.fillStyle = 'rgba(' + IVORY + ',' + a.toFixed(3) + ')';
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
      }
    }

    function coverOf(vw, vh, rw, rh) {
      var va = vw / vh, ra = rw / rh, sw, sh, sx, sy;
      if (va > ra) { sh = vh; sw = vh * ra; sx = (vw - sw) / 2; sy = 0; }
      else { sw = vw; sh = vw / ra; sx = 0; sy = (vh - sh) / 2; }
      return { sw: sw, sh: sh, sx: sx, sy: sy };
    }

    function convergeDim() {
      var d = 0;
      for (var i = 0; i < S.effects.length; i++) {
        var f = S.effects[i];
        if (f.kind === 'converge' && f.text > d) d = f.text;
      }
      return d;
    }

    function drawPreview(g, now) {
      if (!S.cameraOn || !S.videoReady || !video.videoWidth || video.videoWidth < 160) return;
      var r = S.preview;
      var dim = convergeDim();
      var vw = video.videoWidth, vh = video.videoHeight;
      var c = coverOf(vw, vh, r.w, r.h);
      S.cover = c;
      g.save();
      roundPath(g, r.x, r.y, r.w, r.h, r.r);
      g.clip();
      g.globalAlpha = .58 * (1 - .86 * dim);
      g.translate(r.x + r.w, r.y);
      g.scale(-1, 1);
      try { g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, r.w, r.h); } catch (e) {}
      g.globalAlpha = 1;
      g.restore();
      g.save();
      roundPath(g, r.x, r.y, r.w, r.h, r.r);
      g.clip();
      var gr = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      gr.addColorStop(0, 'rgba(5,6,10,.20)');
      gr.addColorStop(.55, 'rgba(5,6,10,.38)');
      gr.addColorStop(1, 'rgba(5,6,10,.72)');
      g.fillStyle = gr;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
      g.strokeStyle = 'rgba(' + GOLD + ',' + (.26 * (1 - .7 * dim)).toFixed(3) + ')';
      g.lineWidth = 1;
      roundPath(g, r.x + .5, r.y + .5, r.w - 1, r.h - 1, r.r);
      g.stroke();
      /* 四角细线，像取景框 */
      g.strokeStyle = 'rgba(' + GOLD + ',.5)';
      g.lineWidth = 1;
      var m = 12, L = 14;
      [[r.x + m, r.y + m, 1, 1], [r.x + r.w - m, r.y + m, -1, 1],
       [r.x + m, r.y + r.h - m, 1, -1], [r.x + r.w - m, r.y + r.h - m, -1, -1]].forEach(function (q) {
        g.beginPath();
        g.moveTo(q[0], q[1] + q[3] * L);
        g.lineTo(q[0], q[1]);
        g.lineTo(q[0] + q[2] * L, q[1]);
        g.stroke();
      });
    }

    function handPoint(i) {
      if (!S.hand || !S.preview || !S.cover) return null;
      var r = S.preview, c = S.cover;
      var vw = video.videoWidth || 640, vh = video.videoHeight || 480;
      var lm = S.hand[i];
      var cx = (lm.x * vw - c.sx) / c.sw;
      var cy = (lm.y * vh - c.sy) / c.sh;
      return { x: r.x + (1 - cx) * r.w, y: r.y + cy * r.h, z: lm.z };
    }

    function drawHand(g, now) {
      if (!S.hand || now - S.handAt > 700) return;
      var dim = convergeDim();
      if (dim > .55) return;
      var a = (1 - clamp((now - S.handAt) / 700, 0, 1)) * (1 - .8 * dim);
      var conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
        [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(' + GOLD + ',' + (.55 * a).toFixed(3) + ')';
      g.lineWidth = 1.2;
      for (var i = 0; i < conn.length; i++) {
        var p1 = handPoint(conn[i][0]), p2 = handPoint(conn[i][1]);
        if (!p1 || !p2) continue;
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      }
      for (var j = 0; j < 21; j++) {
        var p = handPoint(j);
        if (!p) continue;
        var rr = j === 0 ? 3.4 : 2.1;
        g.fillStyle = 'rgba(' + IVORY + ',' + (.75 * a).toFixed(3) + ')';
        g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    /* ---------------- 状态 ---------------- */
    var NOTE_CAM = '比出同一个手势停一下才算数<br>开不了镜头就点上面的按钮';
    var NOTE_TOUCH = '点一下就有，想点几次点几次<br>不用对着镜头比划';
    function setNote(html) { if (ui) ui.note.innerHTML = html; }
    function setStatus(main, sub) {
      var key = (main || '') + '|' + (sub || '');
      if (key === S.statusKey) return;
      S.statusKey = key;
      ui.statusB.textContent = main || '';
      ui.statusS.textContent = sub || '';
      ui.sr.textContent = (main || '') + (sub ? '，' + sub : '');
    }

    function log(msg) { if (cfg.debug) { try { console.log('[wishcam] ' + msg); } catch (e) {} } }

    /* ---------------- 对外 ---------------- */
    var api = {
      open: open,
      close: close,
      triggerEffect: triggerEffect,
      clearEffects: function () { S.effects.length = 0; },
      startCamera: startCamera,
      startTouch: startTouch,
      isOpen: function () { return S.open; },
      state: function () {
        return {
          open: S.open, cameraOn: S.cameraOn, videoReady: S.videoReady,
          engineState: S.engineState, engineError: S.engineError,
          modelBytes: S.modelBytes, detectCount: S.detectCount,
          gesture: S.candidate, hand: !!S.hand, effects: S.effects.length,
          touchMode: S.touchMode, inferMs: S.inferMs,
          tracks: S.stream ? S.stream.getTracks().map(function (t) { return t.readyState; }) : []
        };
      },
      mountEntry: function (parent) {
        if (S.entry) return S.entry;
        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'wishcamEntry';
        b.className = 'wishcamEntry';
        b.innerHTML = '<span>✦</span> 用手许个愿';
        var st = document.createElement('style');
        st.textContent = '.wishcamEntry{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 22px);' +
          'transform:translate(-50%,10px);z-index:2147482000;background:none;border:0;color:rgba(247,238,224,.5);' +
          'font-family:"Noto Serif SC","Songti SC",serif;font-size:12.5px;letter-spacing:.18em;padding:12px 18px;' +
          'opacity:0;pointer-events:none;transition:opacity .9s ease,transform .9s ease;-webkit-tap-highlight-color:transparent;}' +
          '.wishcamEntry.on{opacity:1;transform:translate(-50%,0);pointer-events:auto;}' +
          '.wishcamEntry.off{opacity:0!important;pointer-events:none!important;}' +
          '.wishcamEntry span{color:rgba(233,207,154,.8);margin-right:6px;}';
        document.head.appendChild(st);
        b.addEventListener('click', open);
        (parent || document.body).appendChild(b);
        S.entry = b;
        return b;
      },
      showEntry: function (on) {
        if (!S.entry) api.mountEntry();
        if (S.entry) S.entry.classList.toggle('on', !!on);
      },
      hideEntry: function () { if (S.entry) S.entry.classList.remove('on'); }
    };

    if (cfg.exposeGlobal) window.__wishcam = api;
    if (cfg.autoOpen) open();
    return api;
  }

  window.WishCam = { mount: mount };
})();
