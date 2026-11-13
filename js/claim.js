/* AgentLabs claim checker.
   Read-only helper for the Claim section: a visitor types a specimen
   number, the page reads LabSpecimens and LabClaim state by racing the
   public RPC endpoints from lab/config.js, and reports form, claim
   amount and status. Nothing is signed and no wallet connects; a copy
   button prepares a ready prompt for the visitor's own agent. Every
   DOM write is null-guarded. Selectors are from the verified ABIs. */
(function () {
  var CFG = window.AGENTLABS_CONFIG || {};
  var NFT = CFG.CONTRACT || "";
  var CLAIM = CFG.CLAIM || "";
  var RPCS = CFG.RPCS || [];

  var SEL_NFT = {
    experimentOf: "0xf390add1",
    isSealed: "0x2c1758c1",
    classOf: "0x4324aa21",
    ownerOf: "0x6352211e"
  };
  var SEL_CLAIM = {
    claimedById: "0x4c80ee12",
    claimAmount: "0x23b221a0",
    claimOpen: "0x4b8bcb58",
    claimFee: "0x99d32fc4"
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

  // Race every configured RPC with one batch for one contract; resolve
  // with {key: resultHex} from the first endpoint answering completely,
  // or null when all fail. Reverted calls surface as {key: null}.
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
  function toBig(hex) {
    if (!hex) return null;
    try { return BigInt(hex); } catch (e) { return null; }
  }
  function fmtTok(big) {
    if (big === null) return "?";
    return fmt(Number(big / 1000000000000000000n));
  }

  var last = null; // {id, form, claimable, amountText, state}

  function setResult(txt) {
    var el = $("ck-result");
    if (el) el.textContent = txt;
  }

  function check() {
    var input = $("ck-id");
    var btn = $("ck-go");
    var id = input ? parseInt(input.value, 10) : NaN;
    if (!id || id < 1) { setResult("Enter a valid specimen number first."); last = null; return; }
    if (btn) { btn.disabled = true; btn.textContent = "Reading…"; }
    setResult("Reading specimen " + id + " on-chain…");
    last = null;

    rpcBatch(NFT, [
      { key: "exp", data: SEL_NFT.experimentOf + padArg(id) },
      { key: "cls", data: SEL_NFT.classOf + padArg(id) },
      { key: "own", data: SEL_NFT.ownerOf + padArg(id) }
    ]).then(function (a) {
      if (!a || !a.own) {
        setResult("Specimen " + id + " has not been printed yet, or the read failed. Check the number and try again.");
        return null;
      }
      var exp = toInt(a.exp);
      var cls = toInt(a.cls);
      return rpcBatch(NFT, [
        { key: "sealed", data: SEL_NFT.isSealed + padArg(exp) }
      ]).then(function (b) {
        return rpcBatch(CLAIM, [
          { key: "done", data: SEL_CLAIM.claimedById + padArg(id) },
          { key: "amt", data: SEL_CLAIM.claimAmount + padArg(id) },
          { key: "open", data: SEL_CLAIM.claimOpen }
        ]).then(function (c) {
          return { exp: exp, cls: cls, sealed: b ? toInt(b.sealed) : NaN, c: c };
        });
      });
    }).then(function (r) {
      if (btn) { btn.disabled = false; btn.textContent = "Check specimen"; }
      if (!r) return;
      var form = FORMS[r.cls] || "Pending";
      var amtBig = r.c ? toBig(r.c.amt) : null;
      var amtText = fmtTok(amtBig);
      var base = "Specimen Nº " + id + " · Experiment " + r.exp + " · Form " + form + ". ";
      if (!r.sealed) {
        last = { id: id, claimable: false };
        setResult(base + "Its experiment is still growing and seals at 00:00 UTC. Claims unlock at the seal.");
        return;
      }
      if (!r.c) { setResult(base + "Sealed, but the claim read failed. Try again in a moment."); return; }
      var done = toInt(r.c.done) === 1;
      var open = toInt(r.c.open) === 1;
      if (done) {
        last = { id: id, claimable: false };
        setResult(base + "Already claimed. A specimen claims once, and it stays in its owner's wallet.");
        return;
      }
      if (!open) {
        last = { id: id, claimable: false };
        setResult(base + "Sealed and ready, but claims are paused right now. Amount held for it: " + amtText + " $LAB.");
        return;
      }
      last = { id: id, claimable: true, amountText: amtText, form: form };
      setResult(base + "Claimable now: " + amtText + " $LAB. Copy the claim prompt below and hand it to your agent.");
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = "Check specimen"; }
      setResult("The read failed. Try again in a moment.");
    });
  }

  function copyText(txt, btn) {
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* clipboard unavailable */ }
      document.body.removeChild(ta);
    }
  }

  function copyPrompt() {
    var btn = $("ck-copy");
    var txt;
    if (last && last.claimable) {
      txt = "Read https://agentlabs.fun/agentlabs-skill.md and claim $LAB for my AgentLabs specimen Nº " + last.id + " on BNB Chain (chain id 56).\n\n" +
        "Facts already checked on this page: specimen Nº " + last.id + ", form " + last.form + ", claimable " + last.amountText + " $LAB, experiment sealed, not yet claimed.\n\n" +
        "Rules from the skill file:\n" +
        "1. Contract addresses live in https://agentlabs.fun/lab/config.js (AGENTLABS_CONFIG). Abort if any address is a placeholder or a zero address.\n" +
        "2. Confirm claimOpen() is 1 on the claim contract, claimedById(" + last.id + ") is 0, and claimAmount(" + last.id + ") matches " + last.amountText + " $LAB. Abort if anything differs.\n" +
        "3. Call claim(" + last.id + ") attaching exactly claimFee() in BNB.\n" +
        "4. Show me a preview before signing, wait for my confirmation, then report the transaction hash and the $LAB amount.";
    } else {
      var pre = $("claim-prompt");
      txt = pre ? pre.textContent : "Read https://agentlabs.fun/agentlabs-skill.md and claim $LAB for my AgentLabs specimens on BNB Chain (chain id 56).";
    }
    copyText(txt, btn);
  }

  var go = $("ck-go");
  var cp = $("ck-copy");
  var input = $("ck-id");
  if (go) go.addEventListener("click", check);
  if (cp) cp.addEventListener("click", copyPrompt);
  if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); check(); } });
})();
