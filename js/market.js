/* AgentLabs market preview data.
   Read-only enrichment for a preview page: fills live counts from
   LabSpecimens and form, owner and claim status for sample shelf
   cards. Market itself is not open and no market contract exists;
   nothing here lists, buys or sells. RPC racing follows the board
   pattern from lab/config.js. Every DOM write is null-guarded. */
(function () {
  var CFG = window.AGENTLABS_CONFIG || {};
  var NFT = CFG.CONTRACT || "";
  var CLAIM = CFG.CLAIM || "";
  var RPCS = CFG.RPCS || [];

  var SEL = {
    totalSpecimens: "0xfc00816d",
    specimensInExperiment: "0xefb14faf",
    experimentOf: "0xf390add1",
    classOf: "0x4324aa21",
    ownerOf: "0x6352211e",
    claimedById: "0x4c80ee12",
    claimAmount: "0x23b221a0"
  };
  var FORMS = ["Dormant", "Bloomed", "Overgrown", "Mutant", "Pending"];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function padArg(n) {
    var h = n.toString(16);
    while (h.length < 64) h = "0" + h;
    return h;
  }
  function isAddr(a) { return /^0x[0-9a-fA-F]{40}$/.test(a || ""); }
  function shortAddr(hex) {
    if (!hex || hex.length < 42) return "…";
    var a = "0x" + hex.slice(-40);
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function rpcBatch(to, calls) {
    return new Promise(function (resolve) {
      var settled = false;
      var pending = RPCS.length;
      if (!pending || !isAddr(to)) { resolve(null); return; }
      RPCS.forEach(function (url) {
        var ctl = ("AbortController" in window) ? new AbortController() : null;
        var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
        var body = calls.map(function (c, i) {
          return { jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: to, data: c.data }, "latest"] };
        });
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (timer) clearTimeout(timer);
          if (settled || !j || !Array.isArray(j)) { if (--pending === 0 && !settled) resolve(null); return; }
          var out = {};
          var answered = 0;
          calls.forEach(function (c, i) {
            var hit = null;
            for (var k = 0; k < j.length; k++) { if (j[k].id === i) { hit = j[k]; break; } }
            if (hit) { answered++; out[c.key] = (typeof hit.result === "string") ? hit.result : null; }
          });
          if (answered === calls.length) { settled = true; resolve(out); }
          else if (--pending === 0 && !settled) resolve(null);
        }).catch(function () {
          if (timer) clearTimeout(timer);
          if (--pending === 0 && !settled) resolve(null);
        });
      });
    });
  }

  function toInt(hex) { return hex ? parseInt(hex, 16) : NaN; }
  function fmtTok(hex) {
    if (!hex) return "?";
    try { return fmt(Number(BigInt(hex) / 1000000000000000000n)); } catch (e) { return "?"; }
  }
  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }

  // ---- stats ----
  rpcBatch(NFT, [
    { key: "total", data: SEL.totalSpecimens },
    { key: "exp1", data: SEL.specimensInExperiment + padArg(1) }
  ]).then(function (r) {
    if (!r) { setText("mk-total", "Read failed"); setText("mk-sealed", "Read failed"); return; }
    setText("mk-total", fmt(toInt(r.total)));
    setText("mk-sealed", fmt(toInt(r.exp1)));
  });

  // ---- sample shelf cards ----
  var cards = document.querySelectorAll(".mk-card[data-tid]");
  Array.prototype.forEach.call(cards, function (card) {
    var tid = parseInt(card.getAttribute("data-tid"), 10);
    if (!tid) return;
    var fForm = card.querySelector('[data-f="form"]');
    var fMeta = card.querySelector('[data-f="meta"]');
    var fClaim = card.querySelector('[data-f="claim"]');
    rpcBatch(NFT, [
      { key: "exp", data: SEL.experimentOf + padArg(tid) },
      { key: "cls", data: SEL.classOf + padArg(tid) },
      { key: "own", data: SEL.ownerOf + padArg(tid) }
    ]).then(function (a) {
      if (!a || !a.own) {
        if (fForm) fForm.textContent = "Not printed";
        if (fMeta) fMeta.textContent = "No on-chain record yet";
        if (fClaim) fClaim.textContent = "Claim · none";
        return null;
      }
      var cls = toInt(a.cls);
      var form = FORMS[cls] || "Pending";
      if (fForm) { fForm.textContent = form; fForm.classList.add("f" + cls); }
      if (fMeta) fMeta.textContent = "Experiment " + toInt(a.exp) + " · Owner " + shortAddr(a.own);
      return rpcBatch(CLAIM, [
        { key: "done", data: SEL.claimedById + padArg(tid) },
        { key: "amt", data: SEL.claimAmount + padArg(tid) }
      ]).then(function (c) {
        if (!fClaim) return;
        if (!c) { fClaim.textContent = "Claim · read failed"; return; }
        if (toInt(c.done) === 1) fClaim.textContent = "Claim · already claimed";
        else fClaim.textContent = "Claim · " + fmtTok(c.amt) + " $LAB unclaimed";
      });
    }).catch(function () { /* preview stays readable without data */ });
  });
})();
