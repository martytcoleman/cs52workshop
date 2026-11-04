// The page the whole class opens. Plain HTML + fetch, no build step.
export const PAGE = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roast my major</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
  :root{--paper:#fff;--ink:#0a0a0a;--mute:#5c5c5c;--rule:#0a0a0a;--hair:#d4d4d4;--hot:#e4002b}
  *{box-sizing:border-box;border-radius:0}
  html{background:var(--paper)}
  body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.45 "Archivo",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:960px;margin:0 auto;padding:0 16px 80px}
  button,input{font:inherit;color:inherit}

  header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid var(--rule);padding:14px 0 10px;font-size:14px;font-weight:600}
  header .by,header .r{color:var(--mute);font-weight:400}
  header a{text-underline-offset:3px}
  header a:hover{color:var(--hot)}
  header .by{margin-left:.5em}
  h1{font-weight:900;font-stretch:62%;text-transform:uppercase;font-size:clamp(64px,15vw,152px);line-height:.84;letter-spacing:-.01em;margin:28px 0 0}
  h1 em{font-style:normal;color:var(--hot)}
  .lede{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:2px solid var(--rule);margin-top:24px;padding-top:12px}
  .lede p{margin:0;max-width:40ch}
  .lede ol{margin:0;padding:0;list-style:none;counter-reset:s;color:var(--mute);font-size:15px}
  .lede li{counter-increment:s;display:grid;grid-template-columns:1.6em 1fr}
  .lede li::before{content:counter(s);color:var(--ink);font-weight:700}

  form{margin-top:40px;display:grid;grid-template-columns:1fr 2fr auto;border:2px solid var(--rule)}
  .field{display:flex;flex-direction:column;border-right:2px solid var(--rule);min-width:0}
  .field label{font-size:13px;font-weight:600;padding:8px 12px 0}
  .field input{border:0;background:transparent;padding:4px 12px 10px;font-size:20px;font-weight:500;width:100%}
  .field input::placeholder{color:#a3a3a3}
  .field:focus-within{background:#f4f4f4}
  input:focus{outline:none}
  button.go{border:0;background:var(--ink);color:var(--paper);font-weight:800;font-stretch:80%;text-transform:uppercase;font-size:22px;padding:0 28px;cursor:pointer}
  button.go:hover{background:var(--hot)}
  button.go:disabled{background:var(--mute);cursor:progress}
  button:focus-visible{outline:3px solid var(--hot);outline-offset:2px}

  .presets{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 18px;margin-top:12px;font-size:15px}
  .presets span{color:var(--mute)}
  .chip{background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
  .chip:hover{color:var(--hot);text-decoration-thickness:2px}
  .err{color:var(--hot);font-weight:600;margin-top:16px;min-height:1.45em}

  .arena{display:none;grid-template-columns:1fr 1fr;margin-top:24px;border-top:6px solid var(--rule)}
  .arena.show{display:grid}
  .card{display:flex;flex-direction:column;padding:16px 24px 0 0;position:relative}
  .card+.card{padding:16px 0 0 24px;border-left:2px solid var(--rule)}
  .num{font-weight:900;font-stretch:62%;font-size:56px;line-height:1;font-variant-numeric:tabular-nums}
  .roast{font-size:22px;line-height:1.35;font-weight:500;margin:12px 0 24px;flex:1;white-space:pre-wrap;text-wrap:pretty}
  .pick{border:2px solid var(--rule);background:var(--paper);padding:12px;font-weight:700;font-size:16px;cursor:pointer;text-align:left}
  .pick:hover:not(:disabled){background:var(--ink);color:var(--paper)}
  .pick:disabled{cursor:default;border-color:var(--hair);color:#a3a3a3}
  .card.won .num{color:var(--hot)}
  .card.won .pick{background:var(--hot);border-color:var(--hot);color:var(--paper)}
  .card.won .pick::after{content:" — your pick"}

  .after{display:none;margin-top:16px}
  .after.show{display:block}
  .tie{background:none;border:0;padding:0;color:var(--mute);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:15px}
  .tie:hover{color:var(--ink)}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:15px;font-variant-numeric:tabular-nums}
  th{text-align:left;font-weight:600;font-size:13px;border-bottom:2px solid var(--rule);padding:6px 12px 6px 0}
  td{border-bottom:1px solid var(--hair);padding:8px 12px 8px 0;vertical-align:top}
  td.n,th.n{text-align:right;padding-right:0;padding-left:12px}
  td .prov{display:block;color:var(--mute);font-size:13px}
  td .mdl{white-space:nowrap}
  .trace{display:inline-block;margin-top:16px;color:var(--ink);font-weight:700;text-underline-offset:3px}
  .trace:hover{color:var(--hot)}
  .wrap{overflow-x:auto}

  @media (max-width:640px){
    .lede{grid-template-columns:1fr;gap:12px}
    form{grid-template-columns:1fr}
    .field{border-right:0;border-bottom:2px solid var(--rule)}
    button.go{padding:14px;text-align:left}
    .arena{grid-template-columns:1fr}
    .card,.card+.card{padding:16px 0 24px;border-left:0}
    .card+.card{border-top:2px solid var(--rule)}
    .roast{font-size:20px}
  }
</style></head>
<body><main>
  <header><span>CS52 &mdash; LLM ops <span class="by">by Marty and Timur</span></span><a class="r" href="/board">Live board &rarr;</a></header>
  <h1>Roast my<br><em>major</em></h1>
  <div class="lede">
    <p>Two models roast the same major. You don't know which wrote which. Vote, then see who it was, how long it took, and what it cost.</p>
    <ol><li>Enter a major</li><li>Vote for the funnier one</li><li>Open your trace</li></ol>
  </div>

  <form id="f" autocomplete="off">
    <div class="field"><label for="who">Name</label><input id="who" maxlength="40" placeholder="Jeff" autocomplete="off" data-1p-ignore data-lpignore="true"></div>
    <div class="field"><label for="major">Major</label><input id="major" maxlength="60" placeholder="Computer Science" required></div>
    <button class="go" id="go" type="submit">Roast it</button>
  </form>
  <div class="presets"><span>Or:</span>
    <button class="chip" type="button">Computer Science</button>
    <button class="chip" type="button">Economics</button>
    <button class="chip" type="button">Government</button>
    <button class="chip" type="button">Philosophy</button>
    <button class="chip" type="button">Engineering</button>
    <button class="chip" type="button">Undecided</button>
  </div>
  <div class="err" id="err" role="alert"></div>

  <section class="arena" id="arena" aria-live="polite">
    <div class="card" id="cardL"><div class="num">1</div><div class="roast" id="textL"></div><button class="pick" data-side="left">Roast 1 is funnier</button></div>
    <div class="card" id="cardR"><div class="num">2</div><div class="roast" id="textR"></div><button class="pick" data-side="right">Roast 2 is funnier</button></div>
  </section>
  <div class="after" id="after"><button class="tie" id="tie">Neither. Call it a tie.</button><div id="reveal"></div></div>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const store = { get(k){ try { return localStorage.getItem(k) } catch { return null } },
                  set(k,v){ try { localStorage.setItem(k,v) } catch {} } };
  $("who").value = store.get("name") || "";
  const sessionId = store.get("sid") || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  store.set("sid", sessionId);
  let battle = null, voted = false;

  document.querySelectorAll(".chip").forEach((b) => b.onclick = () => { $("major").value = b.textContent; $("major").focus(); });

  $("f").onsubmit = async (e) => {
    e.preventDefault();
    const major = $("major").value.trim(); if (!major) return;
    store.set("name", $("who").value.trim());
    $("go").disabled = true; $("go").textContent = "Writing\u2026"; $("err").textContent = "";
    try {
      const r = await fetch("/api/roast", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ major, name: $("who").value.trim(), sessionId }) });
      const d = await r.json();
      if (!r.ok) { $("err").textContent = d.error; return; }
      battle = d; voted = false;
      $("textL").textContent = d.left.text;
      $("textR").textContent = d.right.text;
      $("cardL").classList.remove("won"); $("cardR").classList.remove("won");
      document.querySelectorAll(".pick").forEach((b) => b.disabled = false);
      $("arena").classList.add("show"); $("after").classList.add("show"); $("tie").style.display = ""; $("reveal").textContent = "";
      $("arena").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { $("err").textContent = "Network error. Try again."; }
    finally { $("go").disabled = false; $("go").textContent = "Roast it"; }
  };

  async function vote(side) {
    if (!battle || voted) return; voted = true;
    const winner = side === "tie" ? "tie" : battle[side].arm;
    await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ traceId: battle.traceId, winner }) }).catch(() => {});
    if (side !== "tie") $(side === "left" ? "cardL" : "cardR").classList.add("won");
    document.querySelectorAll(".pick").forEach((b) => b.disabled = true); $("tie").style.display = "none";
    const cost = (r) => r.costUsd == null ? "\u2014" : "$" + r.costUsd.toFixed(5);
    const el = (tag, text, cls) => { const x = document.createElement(tag); if (text != null) x.textContent = text; if (cls) x.className = cls; return x; };
    const table = el("table"), head = el("tr");
    [["Roast"], ["Model"], ["Time", "n"], ["Tokens", "n"], ["Cost", "n"]].forEach(([t, c]) => head.appendChild(el("th", t, c)));
    table.appendChild(head);
    [[1, battle.left], [2, battle.right]].forEach(([n, r]) => {
      const tr = el("tr");
      const [prov, name] = battle.models[r.arm].split("/");
      const mc = el("td"); mc.append(el("span", name, "mdl"), el("span", prov, "prov"));
      tr.appendChild(el("td", String(n))); tr.appendChild(mc);
      [[(r.latencyMs / 1000).toFixed(1) + "s", "n"], [String(r.tokens), "n"], [cost(r), "n"]]
        .forEach(([t, c]) => tr.appendChild(el("td", t, c)));
      table.appendChild(tr);
    });
    const wrap = el("div", null, "wrap"); wrap.appendChild(table);
    $("reveal").replaceChildren(wrap);
    if (battle.traceUrl) { const a = el("a", "Open your trace in Langfuse \u2192", "trace"); a.href = battle.traceUrl; a.target = "_blank"; a.rel = "noopener"; $("reveal").appendChild(a); }
    const b = el("a", "See the whole class on the live board \u2192", "trace"); b.href = "/board"; b.style.marginLeft = "24px"; $("reveal").appendChild(b);
  }
  document.querySelectorAll(".pick").forEach((b) => b.onclick = () => vote(b.dataset.side));
  $("tie").onclick = () => vote("tie");
</script>
</body></html>`;
