/* AgentLabs greenhouse layer (homepage only).
   Living growth canvas inside the hero stage, driven by real data:
   fraction of the current UTC day elapsed plus the live specimen
   count of the running experiment (read from the board DOM that
   board.js keeps fresh). Ledger strip reads (total specimens, sealed
   unclaimed, claimed) race the public RPCs from lab/config.js.
   Also wires the form stepper, the archive timeline mirrors and the
   stage form tag. Every lookup is null-guarded; nothing here signs
   or connects a wallet. */
(function () {
  var CFG = window.AGENTLABS_CONFIG || {};
  var NFT = CFG.CONTRACT || "";
  var CLAIM = CFG.CLAIM || "";
  var RPCS = CFG.RPCS || [];
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function domNum(id) {
    var el = $(id);
    if (!el) return 0;
    var n = parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }

  /* ---------- count-up ---------- */
  var tweens = {};
  function setNum(id, to) {
    var el = $(id);
    if (!el) return;
    if (reduced) { el.textContent = fmt(to); return; }
    var from = domNum(id);
    if (from === to) { el.textContent = fmt(to); return; }
    if (tweens[id]) cancelAnimationFrame(tweens[id]);
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 800);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) tweens[id] = requestAnimationFrame(step);
    }
    tweens[id] = requestAnimationFrame(step);
  }

  /* ---------- RPC race (board pattern) ---------- */
  function padArg(n) { var h = n.toString(16); while (h.length < 64) h = "0" + h; return h; }
  function rpcBatch(to, calls) {
    return new Promise(function (resolve) {
      var settled = false, pending = RPCS.length;
      if (!pending || !isAddr(to)) { resolve(null); return; }
      RPCS.forEach(function (url) {
        var ctl = ("AbortController" in window) ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, 4000) : null;
        var body = calls.map(function (c) {
          return { jsonrpc: "2.0", id: c.id, method: "eth_call", params: [{ to: to, data: c.data }, "latest"] };
        });
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (timer) clearTimeout(timer);
            if (settled || !j || !Array.isArray(j)) return;
            var out = {}, ok = true;
            calls.forEach(function (c) {
              var hit = null;
              for (var i = 0; i < j.length; i++) if (j[i].id === c.id) hit = j[i];
              if (!hit || !hit.result || hit.result === "0x") ok = false; else out[c.id] = hit.result;
            });
            if (ok) { settled = true; resolve(out); }
          })
          .catch(function () { if (timer) clearTimeout(timer); })
          .finally(function () { pending -= 1; if (!settled && pending === 0) resolve(null); });
      });
    });
  }

  /* ---------- ledger strip ---------- */
  var SEL = {
    totalSpecimens: "0xfc00816d", currentExperiment: "0xf85ffaa3",
    specimensInExperiment: "0xefb14faf", experimentEnd: "0x37e46fcd",
    totalClaimed: "0xd54ad2a1"
  };
  function raceLedger() {
    rpcBatch(NFT, [
      { id: 1, data: SEL.totalSpecimens },
      { id: 2, data: SEL.currentExperiment }
    ]).then(function (r) {
      if (!r) return;
      var total = parseInt(r[1], 16), exp = parseInt(r[2], 16);
      rpcBatch(NFT, [
        { id: 1, data: SEL.specimensInExperiment + padArg(exp) },
        { id: 2, data: SEL.experimentEnd + padArg(exp) }
      ]).then(function (r2) {
        rpcBatch(CLAIM, [{ id: 1, data: SEL.totalClaimed }]).then(function (r3) {
          if (!r2 || !r3) { setNum("g-total", total); return; }
          var inCur = parseInt(r2[1], 16), end = parseInt(r2[2], 16);
          var claimed = parseInt(r3[1], 16);
          var now = Math.floor(Date.now() / 1000);
          var sealed = total - inCur + (end && now >= end ? inCur : 0);
          setNum("g-total", total);
          setNum("g-unclaimed", Math.max(0, sealed - claimed));
          setNum("g-claimed", claimed);
        });
      });
    });
  }
  if ($("g-total")) { raceLedger(); setInterval(raceLedger, 45000); }

  /* ---------- mirrors: timeline + stage form tag ---------- */
  function syncMirrors() {
    var s = $("b-spec"), p = $("b-part");
    var ts = $("g-tl-spec"), tp = $("g-tl-part");
    if (s && ts && s.textContent.trim()) ts.textContent = s.textContent;
    if (p && tp && p.textContent.trim()) tp.textContent = p.textContent;
  }
  syncMirrors();
  setInterval(syncMirrors, 1000);

  var proj = $("f-proj"), tag = $("stage-form");
  function syncTag() {
    if (!proj || !tag) return;
    var t = proj.textContent || "";
    var i = t.indexOf("·");
    if (i >= 0) tag.textContent = "Form · " + t.slice(i + 1).trim();
  }
  if (proj && tag) {
    syncTag();
    if ("MutationObserver" in window) {
      new MutationObserver(syncTag).observe(proj, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------- form stepper ---------- */
  var NOTES = {
    dormant: "Under 50 unique agents on the day, and a specimen stays Dormant, curled at the bottom of its jar. Claims 10,000 $LAB.",
    bloomed: "50 to 200 unique agents wake a specimen up: brighter colour, a crown of flowers. Claims 50,000 $LAB.",
    overgrown: "Over 200 unique agents and growth runs wild: vines force the lid and glass starts to crack. Claims 250,000 $LAB.",
    mutant: "A seed branch, not a crowd branch: seed % 1000 at 970 or higher, roughly 3 in 100 specimens. Claims 1,000,000 $LAB, whatever the crowd did."
  };
  var steps = document.querySelectorAll(".stepper .step");
  if (steps.length) {
    steps.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var form = btn.getAttribute("data-form");
        steps.forEach(function (b) { b.classList.toggle("on", b === btn); });
        document.querySelectorAll(".form-card").forEach(function (card) {
          card.classList.toggle("spot", card.classList.contains(form));
        });
        var note = $("step-note");
        if (note && NOTES[form]) note.textContent = NOTES[form];
        var card2 = document.querySelector(".form-card." + form);
        if (card2 && card2.scrollIntoView) {
          card2.scrollIntoView({ behavior: reduced ? "auto" : "smooth", inline: "center", block: "nearest" });
        }
      });
    });
  }

  /* ---------- living growth canvas in the stage ---------- */
  var frame = document.querySelector(".stage-frame");
  if (!frame) return;
  var cv = document.createElement("canvas");
  cv.className = "growth";
  cv.setAttribute("aria-hidden", "true");
  frame.appendChild(cv);
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  var W = 0, H = 0, stems = [], motes = [], running = true, visible = true;
  var growth = 0.25, parX = 0, parY = 0, parTX = 0, parTY = 0;

  function size() {
    var r = frame.getBoundingClientRect();
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = Math.max(50, Math.round(r.width));
    H = Math.max(50, Math.round(r.height));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }
  function seed() {
    stems = []; motes = [];
    var n = 30;
    for (var i = 0; i < n; i++) {
      stems.push({
        x: (i + 0.5 + (Math.random() - 0.5) * 0.7) / n,
        h: 0.3 + Math.random() * 0.7,
        sway: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.7,
        w: 1 + Math.random() * 1.6,
        violet: Math.random() < 0.14,
        nodes: 2 + Math.floor(Math.random() * 3)
      });
    }
    for (var j = 0; j < 42; j++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        r: 0.7 + Math.random() * 2.1,
        s: 0.008 + Math.random() * 0.03,
        ph: Math.random() * Math.PI * 2,
        violet: Math.random() < 0.2
      });
    }
  }
  function dayFrac() {
    var d = new Date();
    return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
  }
  function targetGrowth() {
    var spec = domNum("b-spec");
    var byCount = Math.min(1, spec / 300);
    return Math.max(0.18, Math.min(1, 0.2 + 0.55 * byCount + 0.25 * dayFrac()));
  }
  function draw(ts) {
    var t = ts / 1000;
    growth += (targetGrowth() - growth) * 0.012;
    parX += (parTX - parX) * 0.05;
    parY += (parTY - parY) * 0.05;
    ctx.clearRect(0, 0, W, H);

    /* bench glow at jar bottoms */
    var grd = ctx.createRadialGradient(W / 2, H * 1.02, 10, W / 2, H * 1.02, W * 0.62);
    grd.addColorStop(0, "rgba(141, 255, 79," + (0.10 + growth * 0.16).toFixed(3) + ")");
    grd.addColorStop(0.55, "rgba(87, 200, 78, 0.05)");
    grd.addColorStop(1, "rgba(87, 200, 78, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    /* vines */
    stems.forEach(function (st) {
      var baseX = st.x * W + parX * 9;
      var baseY = H + 4;
      var hgt = H * 0.88 * growth * st.h;
      var sway = Math.sin(t * st.speed + st.sway) * (5 + growth * 7) + parX * 5;
      var topX = baseX + sway * 1.7, topY = baseY - hgt;
      var cX = baseX + sway * 0.4, cY = baseY - hgt * 0.55;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(cX, cY, topX, topY);
      ctx.strokeStyle = st.violet ? "rgba(166, 120, 255, 0.30)" : "rgba(110, 232, 62, 0.16)";
      ctx.lineWidth = st.w + 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(cX, cY, topX, topY);
      ctx.strokeStyle = st.violet ? "rgba(196, 160, 255, 0.75)" : "rgba(168, 255, 120, 0.72)";
      ctx.lineWidth = st.w;
      ctx.stroke();
      /* glowing nodes along the stem */
      for (var k = 1; k <= st.nodes; k++) {
        var u = k / (st.nodes + 1);
        var iu = 1 - u;
        var nx = iu * iu * baseX + 2 * iu * u * cX + u * u * topX;
        var ny = iu * iu * baseY + 2 * iu * u * cY + u * u * topY;
        var pulse = 1.6 + Math.sin(t * 1.7 + st.sway + k * 1.9) * 0.7;
        ctx.beginPath();
        ctx.arc(nx, ny, pulse + 1.4, 0, Math.PI * 2);
        ctx.fillStyle = st.violet ? "rgba(166, 120, 255, 0.20)" : "rgba(141, 255, 79, 0.20)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(nx, ny, pulse, 0, Math.PI * 2);
        ctx.fillStyle = st.violet ? "rgba(216, 190, 255, 0.95)" : "rgba(205, 255, 180, 0.95)";
        ctx.fill();
      }
      /* tip bud */
      ctx.beginPath();
      ctx.arc(topX, topY, 2.1 + Math.sin(t * 2 + st.sway) * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = st.violet ? "rgba(216, 190, 255, 0.95)" : "rgba(190, 255, 150, 0.95)";
      ctx.fill();
    });

    /* rising motes, density follows growth */
    var active = Math.floor(motes.length * (0.35 + growth * 0.65));
    for (var i = 0; i < active; i++) {
      var m = motes[i];
      m.y -= m.s / Math.max(1, H / 60) * 0.016 * 60;
      m.ph += 0.012;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      var mx = m.x * W + Math.sin(m.ph) * 6 + parX * 6;
      var my = m.y * H + parY * 4;
      ctx.beginPath();
      ctx.arc(mx, my, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.violet ? "rgba(178, 132, 255, 0.5)" : "rgba(141, 255, 79, 0.42)";
      ctx.fill();
    }
  }
  function loop(ts) {
    if (running && visible) draw(ts || 0);
    if (!reduced) requestAnimationFrame(loop);
  }
  size();
  if (reduced) { growth = targetGrowth(); draw(1200); }
  else requestAnimationFrame(loop);
  window.addEventListener("resize", function () { size(); if (reduced) draw(1200); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(frame);
  }
  document.addEventListener("visibilitychange", function () { running = !document.hidden; });

  /* pointer parallax (fine pointers) */
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches && !reduced) {
    frame.addEventListener("pointermove", function (ev) {
      var r = frame.getBoundingClientRect();
      parTX = ((ev.clientX - r.left) / r.width - 0.5) * 2;
      parTY = ((ev.clientY - r.top) / r.height - 0.5) * 2;
    });
    frame.addEventListener("pointerleave", function () { parTX = 0; parTY = 0; });
  }
})();
