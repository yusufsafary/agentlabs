/* AgentLabs visual effects: UTC day-progress hairline, hero bubbles,
   stat pop on value change, form-card tilt, carousel dots, staggered
   reveals for blocks app.js does not observe. Every feature is guarded;
   nothing here touches chain reads or board values. */
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- UTC day progress hairline ---------- */
  var dayBar = document.createElement("div");
  dayBar.id = "day-progress";
  dayBar.setAttribute("aria-hidden", "true");
  document.body.appendChild(dayBar);
  function tickDay() {
    var d = new Date();
    var s = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
    dayBar.style.width = (s / 86400 * 100).toFixed(3) + "%";
  }
  tickDay();
  setInterval(tickDay, 1000);

  /* ---------- stat pop when a board value changes ---------- */
  if ("MutationObserver" in window) {
    ["b-spec", "b-part", "c-claimed"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var last = el.textContent;
      new MutationObserver(function () {
        if (el.textContent === last) return;
        last = el.textContent;
        var tile = el.closest ? el.closest(".stat") : null;
        if (!tile || reduced) return;
        tile.classList.remove("pop");
        void tile.offsetWidth;
        tile.classList.add("pop");
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- staggered reveals for extra blocks ---------- */
  if ("IntersectionObserver" in window && !reduced) {
    var extra = document.querySelectorAll(".stat, .rung, .lcard, .faq details, .tiers, .doc > h2, .article, .news-card");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    extra.forEach(function (el, i) {
      el.classList.add("rv");
      el.style.transitionDelay = (i % 4) * 70 + "ms";
      io.observe(el);
    });
  }

  /* ---------- hero bubbles (index stage) ---------- */
  var stage = document.querySelector(".stage-frame");
  if (stage && !reduced) {
    var cv = document.createElement("canvas");
    cv.className = "bubbles";
    cv.setAttribute("aria-hidden", "true");
    stage.appendChild(cv);
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, bubbles = [], running = true;
    function size() {
      var r = stage.getBoundingClientRect();
      W = cv.width = Math.max(50, Math.round(r.width));
      H = cv.height = Math.max(50, Math.round(r.height));
    }
    function seed() {
      bubbles = [];
      var n = Math.round(W / 34);
      for (var i = 0; i < n; i++) {
        bubbles.push({
          x: Math.random() * W,
          y: H + Math.random() * H,
          r: 1 + Math.random() * 3.2,
          s: 0.25 + Math.random() * 0.75,
          drift: Math.random() * Math.PI * 2
        });
      }
    }
    function frame() {
      if (running) {
        ctx.clearRect(0, 0, W, H);
        bubbles.forEach(function (b) {
          b.y -= b.s;
          b.drift += 0.012;
          b.x += Math.sin(b.drift) * 0.3;
          if (b.y < -6) { b.y = H + 6; b.x = Math.random() * W; }
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(141, 255, 79, 0.13)";
          ctx.fill();
          ctx.strokeStyle = "rgba(200, 255, 190, 0.20)";
          ctx.lineWidth = 0.7;
          ctx.stroke();
        });
      }
      requestAnimationFrame(frame);
    }
    size(); seed(); frame();
    window.addEventListener("resize", function () { size(); seed(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { running = e[0].isIntersecting; }).observe(stage);
    }
    document.addEventListener("visibilitychange", function () { running = !document.hidden; });
  }


  /* ---------- hero spore field ---------- */
  var hero = document.querySelector(".hero");
  if (hero && !reduced) {
    var sc = document.createElement("canvas");
    sc.className = "spores";
    sc.setAttribute("aria-hidden", "true");
    hero.insertBefore(sc, hero.firstChild);
    var sctx = sc.getContext("2d");
    var SW = 0, SH = 0, spores = [], sRun = true;
    function sSize() {
      var r = hero.getBoundingClientRect();
      SW = sc.width = Math.max(50, Math.round(r.width));
      SH = sc.height = Math.max(50, Math.round(r.height));
    }
    function sSeed() {
      spores = [];
      for (var i = 0; i < 26; i++) {
        spores.push({
          x: Math.random() * SW, y: Math.random() * SH,
          r: 0.8 + Math.random() * 2.4, s: 0.12 + Math.random() * 0.4,
          ph: Math.random() * Math.PI * 2,
          violet: Math.random() < 0.22
        });
      }
    }
    function sFrame() {
      if (sRun) {
        sctx.clearRect(0, 0, SW, SH);
        spores.forEach(function (p) {
          p.y -= p.s; p.ph += 0.01; p.x += Math.sin(p.ph) * 0.25;
          if (p.y < -5) { p.y = SH + 5; p.x = Math.random() * SW; }
          sctx.beginPath();
          sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          sctx.fillStyle = p.violet ? "rgba(178, 132, 255, 0.5)" : "rgba(141, 255, 79, 0.42)";
          sctx.shadowBlur = 8;
          sctx.shadowColor = p.violet ? "rgba(140, 79, 255, 0.8)" : "rgba(141, 255, 79, 0.8)";
          sctx.fill();
          sctx.shadowBlur = 0;
        });
      }
      requestAnimationFrame(sFrame);
    }
    sSize(); sSeed(); sFrame();
    window.addEventListener("resize", function () { sSize(); sSeed(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { sRun = e[0].isIntersecting; }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () { sRun = !document.hidden; });
  }

  /* ---------- form card tilt (fine pointers only) ---------- */
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches && !reduced) {
    document.querySelectorAll(".form-card").forEach(function (card) {
      card.addEventListener("pointerenter", function () { card.style.transition = "transform .15s ease-out"; });
      card.addEventListener("pointermove", function (ev) {
        var r = card.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - 0.5;
        var y = (ev.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(700px) rotateY(" + (x * 7).toFixed(2) + "deg) rotateX(" + (-y * 7).toFixed(2) + "deg) translateY(-3px)";
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; card.style.transition = ""; });
    });
  }

  /* ---------- form carousel dots (mobile) ---------- */
  var row = document.querySelector(".form-row");
  if (row) {
    var cards = row.querySelectorAll(".form-card");
    if (cards.length > 1) {
      var dots = document.createElement("div");
      dots.className = "form-dots";
      cards.forEach(function (card, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.setAttribute("aria-label", "Form " + (i + 1));
        if (i === 0) d.className = "on";
        d.addEventListener("click", function () {
          row.scrollTo({ left: card.offsetLeft - row.offsetLeft - 2, behavior: "smooth" });
        });
        dots.appendChild(d);
      });
      row.parentNode.insertBefore(dots, row.nextSibling);
      var ticking = false;
      row.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var mid = row.scrollLeft + row.clientWidth / 2;
          var best = 0, bestD = 1e9;
          cards.forEach(function (card, i) {
            var c = card.offsetLeft - row.offsetLeft + card.clientWidth / 2;
            var dist = Math.abs(c - mid);
            if (dist < bestD) { bestD = dist; best = i; }
          });
          dots.querySelectorAll("button").forEach(function (d, i) {
            d.classList.toggle("on", i === best);
          });
        });
      }, { passive: true });
    }
  }
})();
