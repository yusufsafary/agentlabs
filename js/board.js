/* AgentLabs live board.
   Races public BSC RPC endpoints for LabSpecimens and LabClaim state.
   Genesis state (genesisOpen false, currentExperiment 0) renders
   honestly as "Experiment Nº 1 - Genesis not yet open". Every DOM write
   is null-guarded. Selectors are from the deployed, verified ABIs. */
(function () {
  var CFG = window.AGENTLABS_CONFIG || {};
  var NFT = CFG.CONTRACT || "";
  var CLAIM = CFG.CLAIM || "";
  var RPCS = CFG.RPCS || [];

  var SEL = {
    genesisOpen: "0x14349d0c",
    currentExperiment: "0xf85ffaa3",
    totalSpecimens: "0xfc00816d",
    specimensInExperiment: "0xefb14faf",
    participantsOf: "0xe200c857",
    experimentEnd: "0x37e46fcd",
    totalClaimed: "0xd54ad2a1",
    claimOpen: "0x4b8bcb58",
    poolBalance: "0x96365d44"
  };

  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tweens = {};
  function setNum(id, to) {
    var el = $(id);
    if (!el) return;
    if (reduceMotion) { el.textContent = fmt(to); return; }
    var from = parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
    if (isNaN(from)) from = 0;
    if (tweens[id]) cancelAnimationFrame(tweens[id]);
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / 650);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) tweens[id] = requestAnimationFrame(step);
    }
    tweens[id] = requestAnimationFrame(step);
  }

  function padArg(n) {
    var h = n.toString(16);
    while (h.length < 64) h = "0" + h;
    return h;
  }
  function wordToInt(hex) { return parseInt(hex, 16); }

  function rpcBatch(to, calls) {
    // calls: [{id, data}] -> Promise resolving to {id: resultHex} from the
    // fastest RPC that answers completely, or null when all fail.
    return new Promise(function (resolve) {
      var settled = false;
      var pending = RPCS.length;
      if (!pending) { resolve(null); return; }
      RPCS.forEach(function (url) {
        var ctl = ("AbortController" in window) ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, 4000) : null;
        var body = calls.map(function (c) {
          return { jsonrpc: "2.0", id: c.id, method: "eth_call", params: [{ to: to, data: c.data }, "latest"] };
        });
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (timer) clearTimeout(timer);
          if (settled || !j || !Array.isArray(j)) return;
          var out = {};
          var ok = true;
          calls.forEach(function (c) {
            var hit = null;
            for (var i = 0; i < j.length; i++) if (j[i].id === c.id) hit = j[i];
            if (!hit || !hit.result || hit.result === "0x") ok = false;
            else out[c.id] = hit.result;
          });
          if (ok) { settled = true; resolve(out); }
        }).catch(function () {
          if (timer) clearTimeout(timer);
        }).finally(function () {
          pending -= 1;
          if (!settled && pending === 0) resolve(null);
        });
      });
    });
  }

  /* ---------- form projection ---------- */
  function formOf(participants) {
    if (participants > 200) return "Overgrown";
    if (participants >= 50) return "Bloomed";
    return "Dormant";
  }
  function applyForm(participants) {
    var bar = $("f-bar");
    if (bar) bar.style.width = Math.min(100, (participants / 200) * 100) + "%";
    setText("f-proj", "Projected form · " + formOf(participants));
    setText("f-note", participants >= 200
      ? fmt(participants) + " unique participants. Past 200, extra participants deepen an Overgrown day rather than change its form."
      : fmt(participants) + " unique participants so far. " + (participants < 50
        ? (50 - participants) + " more unique agents push today past Dormant into Bloomed."
        : (201 - participants) + " more unique agents push today into Overgrown."));
  }

  /* ---------- experiment board ---------- */
  var sealTs = 0; // unix seconds when current experiment seals; 0 = not ticking

  function tickSeal() {
    var left = sealTs - Math.floor(Date.now() / 1000);
    var txt;
    if (!sealTs || left <= 0) txt = sealTs ? "Sealed" : "Not opened";
    else {
      var h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      txt = p2(h) + ":" + p2(m) + ":" + p2(s);
    }
    setText("b-seal", txt);
    setText("mb-seal", sealTs ? txt : "Standby");
  }
  setInterval(tickSeal, 1000);

  function genesisMode(total) {
    sealTs = 0;
    setText("h-status", "Genesis not yet open");
    setText("b-exp", "N\u00ba 1 \u00b7 Genesis");
    setNum("b-spec", 0);
    setNum("b-part", 0);
    setText("b-seal", "Not opened");
    setText("b-status", "Standby");
    setText("mb-exp", "N\u00ba 1 \u00b7 Genesis");
    setText("mb-seal", "Standby");
    setText("b-note", "Genesis has not opened yet. Experiment N\u00ba 1 opens by hand, and its window runs to the next 00:00 UTC. Every later experiment runs a plain UTC day, then seals for good.");
    var bar = $("f-bar");
    if (bar) bar.style.width = "0%";
    setText("f-proj", "Projected form · Awaiting first experiment");
    setText("f-note", "Form is decided by unique participants on the day: under 50 stays Dormant, 50 to 200 Blooms, over 200 goes Overgrown.");
    if (typeof total === "number" && total > 0) setNum("b-spec", total);
  }

  function applyExperiment(exp, specimens, participants, endTs) {
    var now = Math.floor(Date.now() / 1000);
    setText("b-exp", "N\u00ba " + fmt(exp));
    setText("mb-exp", "N\u00ba " + fmt(exp));
    setNum("b-spec", specimens);
    setNum("b-part", participants);
    applyForm(participants);
    if (endTs && now < endTs) {
      sealTs = endTs;
      tickSeal();
      setText("h-status", "Experiment running");
      setText("b-status", "Growing");
      setText("b-note", "Experiment N\u00ba " + fmt(exp) + " is growing. Specimens minted today take a form from how many unique agents show up, and a rare few turn Mutant on their own seed.");
    } else {
      sealTs = 0;
      setText("b-seal", "Sealed");
      setText("mb-seal", "Sealed");
      setText("h-status", "Sealed");
      setText("b-status", "Sealed");
      setText("b-note", "Experiment N\u00ba " + fmt(exp) + " is sealed for good. A fresh experiment starts at 00:00 UTC. Holders of sealed specimens can claim $LAB once claims open.");
    }
  }

  function raceExperiment() {
    if (!isAddr(NFT)) { genesisMode(0); return; }
    rpcBatch(NFT, [
      { id: 1, data: SEL.genesisOpen },
      { id: 2, data: SEL.currentExperiment },
      { id: 3, data: SEL.totalSpecimens }
    ]).then(function (r) {
      if (!r) return;
      var genesis = wordToInt(r[1]) === 1;
      var exp = wordToInt(r[2]);
      var total = wordToInt(r[3]);
      if (!genesis || exp < 1) { genesisMode(total); return; }
      rpcBatch(NFT, [
        { id: 1, data: SEL.specimensInExperiment + padArg(exp) },
        { id: 2, data: SEL.participantsOf + padArg(exp) },
        { id: 3, data: SEL.experimentEnd + padArg(exp) }
      ]).then(function (r2) {
        if (!r2) { genesisMode(total); return; }
        var endTs = wordToInt(r2[3]);
        if (!endTs) { genesisMode(total); return; }
        applyExperiment(exp, wordToInt(r2[1]), wordToInt(r2[2]), endTs);
      });
    });
  }

  /* ---------- claim board ---------- */
  function fmtPool(weiHex) {
    var v = parseInt(weiHex, 16) / 1e18;
    if (v >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    return fmt(Math.round(v));
  }
  function applyClaim(claimed, open, poolHex) {
    setNum("c-claimed", claimed);
    var el = $("c-pool");
    if (el) el.textContent = fmtPool(poolHex);
    setText("c-status", open ? "OPEN" : "SOON");
    setText("c-note", open
      ? "Claims are open. Send your Binance agent a claim prompt below, one call per specimen."
      : "Claims are not open yet. Specimens of sealed experiments become claimable when claims open. Watch this board.");
  }
  function raceClaim() {
    if (!isAddr(CLAIM)) {
      setText("c-status", "SOON");
      setText("c-note", "Claims are not open yet. Specimens of sealed experiments become claimable when claims open. Watch this board.");
      return;
    }
    rpcBatch(CLAIM, [
      { id: 1, data: SEL.totalClaimed },
      { id: 2, data: SEL.claimOpen },
      { id: 3, data: SEL.poolBalance }
    ]).then(function (r) {
      if (!r) return;
      applyClaim(wordToInt(r[1]), wordToInt(r[2]) === 1, r[3]);
    });
  }

  raceExperiment();
  raceClaim();
  setInterval(function () { raceExperiment(); raceClaim(); }, 30000);
})();
