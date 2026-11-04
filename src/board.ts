// The class-wide scoreboard. Everything comes from Langfuse: the votes are scores the page wrote,
// the judge rulings are scores Langfuse's LLM judge wrote. No database of our own.

type Arm = "A" | "B";
type Pick = Arm | "tie";

const base = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com") + "/api/public";
const auth = () =>
  "Basic " + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");

// Langfuse pages with a cursor. Cap the pages so a huge project can't hang the board.
async function all(path: string, maxPages = 20): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const r = await fetch(base + path + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""), {
      headers: { authorization: auth() },
    });
    if (!r.ok) throw new Error(`Langfuse ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    out.push(...(j.data ?? []));
    cursor = j.meta?.cursor;
    if (!cursor || !j.data?.length) break;
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export async function boardData(since: string, models: Record<Arm, string>) {
  const q = (name: string) => `name=${name}&limit=100&fromTimestamp=${since}&fields=core,details,subject`;
  const obsQ = (name: string) => `/v2/observations?name=${name}&limit=100&fromStartTime=${since}&fields=core,io,metadata`;
  const [obsA, obsB, winners, funny, breaks] = await Promise.all([
    all(obsQ("model-A")),
    all(obsQ("model-B")),
    all(`/v3/scores?${q("winner")}`),
    all(`/v3/scores?${q("judge_funny")}`),
    all(`/v3/scores?${q("judge_breaks_rules")}`),
  ]);

  // One battle = one trace with a model-A span and a model-B span.
  type Roast = { text: string; ms: number; cost: number | null; funny?: number; why?: string; broke?: boolean };
  type Battle = { major: string; at: string; A?: Roast; B?: Roast; vote?: Pick };
  const battles = new Map<string, Battle>();
  const byObs = new Map<string, Roast>();
  for (const [arm, list] of [["A", obsA], ["B", obsB]] as const) {
    for (const o of list) {
      const roast: Roast = {
        text: typeof o.output === "string" ? o.output : "",
        ms: Date.parse(o.endTime) - Date.parse(o.startTime),
        cost: typeof o.metadata?.costUsd === "number" ? o.metadata.costUsd : null,
      };
      const b: Battle = battles.get(o.traceId) ?? { major: String(o.input ?? o.metadata?.major ?? ""), at: o.startTime };
      b[arm] = roast;
      battles.set(o.traceId, b);
      byObs.set(o.id, roast);
    }
  }
  for (const s of winners) {
    const b = battles.get(s.subject?.id);
    if (b && ["A", "B", "tie"].includes(s.value)) b.vote = s.value;
  }
  // Judge scores point at a model span. Scores on eval-run spans don't match and are skipped.
  for (const s of funny) {
    const r = byObs.get(s.subject?.id);
    if (r) { r.funny = Number(s.value); r.why = s.comment ?? undefined; }
  }
  for (const s of breaks) {
    const r = byObs.get(s.subject?.id);
    if (r) r.broke = s.value === true || s.value === 1 || s.value === "true";
  }

  const complete = [...battles.values()].filter((b) => b.A && b.B);
  const votes = { A: 0, B: 0, tie: 0 };
  const judgePicks = { A: 0, B: 0, tie: 0 };
  let agree = 0, compared = 0;
  const disagreements: any[] = [];
  for (const b of complete) {
    if (b.vote) votes[b.vote]++;
    const fa = b.A!.funny, fb = b.B!.funny;
    if (fa == null || fb == null) continue;
    const judge: Pick = fa > fb ? "A" : fb > fa ? "B" : "tie";
    judgePicks[judge]++;
    // Agreement only counts battles where both the class and the judge picked a side.
    if (b.vote && b.vote !== "tie" && judge !== "tie") {
      compared++;
      if (b.vote === judge) agree++;
      else disagreements.push({ major: b.major, at: b.at, vote: b.vote, judge, A: b.A, B: b.B });
    }
  }

  const arm = (k: Arm) => {
    const rs = complete.map((b) => b[k]!);
    const judged = rs.filter((r) => r.funny != null);
    return {
      model: models[k],
      votes: votes[k],
      judgeAvg: avg(judged.map((r) => r.funny!)),
      judgePicks: judgePicks[k],
      judged: judged.length,
      breaks: rs.filter((r) => r.broke).length,
      medianMs: median(rs.map((r) => r.ms)),
      avgCost: avg(rs.flatMap((r) => (r.cost == null ? [] : [r.cost]))),
    };
  };

  return {
    since,
    battles: complete.length,
    ties: votes.tie,
    judgeTies: judgePicks.tie,
    A: arm("A"),
    B: arm("B"),
    agree,
    compared,
    totalCost: complete.reduce((s, b) => s + (b.A!.cost ?? 0) + (b.B!.cost ?? 0), 0),
    disagreements: disagreements.sort((x, y) => y.at.localeCompare(x.at)).slice(0, 4),
  };
}

export const BOARD_PAGE = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roast board</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
  :root{--paper:#fff;--ink:#0a0a0a;--mute:#5c5c5c;--rule:#0a0a0a;--hair:#d4d4d4;--hot:#e4002b;--tie:#c8c8c8}
  *{box-sizing:border-box;border-radius:0}
  html{background:var(--paper)}
  body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.45 "Archivo",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:1100px;margin:0 auto;padding:0 16px 80px}
  a{color:inherit;text-underline-offset:3px}
  a:hover{color:var(--hot)}
  header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-bottom:2px solid var(--rule);padding:14px 0 10px;font-size:14px;font-weight:600}
  header .by,header .r{color:var(--mute);font-weight:400}
  header .by{margin-left:.5em}
  h1{font-weight:900;font-stretch:62%;text-transform:uppercase;font-size:clamp(56px,11vw,120px);line-height:.84;margin:28px 0 0}
  h1 em{font-style:normal;color:var(--hot)}
  .meta{color:var(--mute);font-size:15px;margin-top:12px;font-variant-numeric:tabular-nums}
  .empty{margin-top:40px;font-size:22px;font-weight:600}

  .duel{display:grid;grid-template-columns:1fr 1fr;margin-top:32px;border-top:6px solid var(--rule)}
  .side{padding:16px 24px 0 0}
  .side+.side{padding:16px 0 0 24px;border-left:2px solid var(--rule)}
  .side h2{margin:0;font-size:22px;font-weight:800;font-stretch:80%;line-height:1.1}
  .side h2 span{display:block;color:var(--mute);font-size:14px;font-weight:400;font-stretch:100%}
  .big{font-weight:900;font-stretch:62%;font-size:clamp(72px,12vw,140px);line-height:.9;margin-top:12px;font-variant-numeric:tabular-nums}
  .side.lead .big{color:var(--hot)}
  .cap{font-size:14px;color:var(--mute)}
  dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:20px 0 0;font-size:15px;font-variant-numeric:tabular-nums;border-top:1px solid var(--hair);padding-top:12px}
  dt{color:var(--mute)}
  dd{margin:0;font-weight:600}

  .bars{margin-top:40px;border-top:2px solid var(--rule);padding-top:12px}
  .row{display:grid;grid-template-columns:140px 1fr;gap:16px;align-items:center;margin-top:12px}
  .row b{font-size:15px}
  .bar{display:flex;height:40px;border:2px solid var(--rule)}
  .bar div{display:flex;align-items:center;padding:0 10px;font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums}
  .bar .a{background:var(--ink);color:var(--paper)}
  .bar .t{background:var(--tie)}
  .bar .b{background:var(--paper);justify-content:flex-end}
  .verdict{font-size:clamp(22px,3vw,30px);font-weight:700;line-height:1.25;margin:28px 0 0;max-width:30ch}
  .verdict em{font-style:normal;color:var(--hot)}

  .dis{margin-top:48px;border-top:6px solid var(--rule);padding-top:12px}
  .dis h3{margin:0;font-size:14px;font-weight:600}
  .fight{border-bottom:1px solid var(--hair);padding:16px 0}
  .fight .major{font-weight:800;font-stretch:80%;text-transform:uppercase;font-size:20px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:8px}
  .pair p{margin:0 0 6px;font-size:16px;line-height:1.4;text-wrap:pretty}
  .tag{font-size:13px;color:var(--mute)}
  .tag b{color:var(--ink)}
  .tag .you{color:var(--hot)}

  @media (max-width:640px){
    .duel,.pair{grid-template-columns:1fr}
    .side,.side+.side{padding:16px 0 24px;border-left:0}
    .side+.side{border-top:2px solid var(--rule)}
    .row{grid-template-columns:1fr;gap:4px}
  }
</style></head>
<body><main>
  <header><span>CS52 &mdash; LLM ops <span class="by">by Marty and Timur</span></span><a class="r" href="/">&larr; Roast a major</a></header>
  <h1>The class<br>vs <em>the judge</em></h1>
  <div class="meta" id="meta">Loading&hellip;</div>
  <div id="out"></div>
</main>
<script>
  const params = new URLSearchParams(location.search);
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
  const name = (m) => m.split("/")[1] || m;
  const prov = (m) => m.split("/")[0];
  const money = (x) => x == null ? "\\u2014" : "$" + x.toFixed(4);
  const secs = (ms) => ms == null ? "\\u2014" : (ms / 1000).toFixed(1) + "s";

  function bar(label, a, t, b, d, A, B) {
    const row = el("div", "row"); row.append(el("b", null, label));
    const bar = el("div", "bar");
    for (const [n, cls, txt] of [[a, "a", name(A.model) + " " + pct(a, d) + "%"], [t, "t", "tie"], [b, "b", pct(b, d) + "% " + name(B.model)]]) {
      if (!n) continue;
      const seg = el("div", cls, txt); seg.style.flex = String(n); bar.append(seg);
    }
    row.append(bar); return row;
  }

  function side(d, k, lead) {
    const s = d[k], votes = d.A.votes + d.B.votes + d.ties;
    const box = el("div", "side" + (lead ? " lead" : ""));
    const h = el("h2", null, name(s.model)); h.append(el("span", null, prov(s.model))); box.append(h);
    box.append(el("div", "big", pct(s.votes, votes) + "%"));
    box.append(el("div", "cap", s.votes + " of " + votes + " class votes"));
    const dl = el("dl");
    for (const [t, v] of [
      ["Judge's average", s.judgeAvg == null ? "\\u2014" : s.judgeAvg.toFixed(1) + " / 5"],
      ["Judge picked it", s.judgePicks + (s.judgePicks === 1 ? " time" : " times")],
      ["Rule breaks", String(s.breaks)],
      ["Median time", secs(s.medianMs)],
      ["Cost per roast", money(s.avgCost)],
    ]) { dl.append(el("dt", null, t), el("dd", null, v)); }
    box.append(dl); return box;
  }

  function render(d) {
    const out = document.getElementById("out");
    const sd = new Date(d.since), today = sd.toDateString() === new Date().toDateString();
    const since = sd.toLocaleString([], today ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
    const judged = d.A.judged + d.B.judged;
    document.getElementById("meta").textContent =
      d.battles + " battles since " + since + " \\u00b7 judge has graded " + judged + " of " + (d.battles * 2) +
      " roasts \\u00b7 total spend " + money(d.totalCost) + " \\u00b7 updates every 10s";
    if (!d.battles) { out.replaceChildren(el("div", "empty", "No battles yet. Go roast a major.")); return; }

    const votes = d.A.votes + d.B.votes + d.ties;
    const duel = el("section", "duel");
    duel.append(side(d, "A", d.A.votes > d.B.votes), side(d, "B", d.B.votes > d.A.votes));

    const bars = el("section", "bars");
    bars.append(el("div", "cap", "Who won each battle"));
    bars.append(bar("The class", d.A.votes, d.ties, d.B.votes, votes, d.A, d.B));
    const jt = d.A.judgePicks + d.B.judgePicks + d.judgeTies;
    if (jt) bars.append(bar("The judge", d.A.judgePicks, d.judgeTies, d.B.judgePicks, jt, d.A, d.B));
    if (d.compared) {
      const v = el("p", "verdict");
      v.append("The judge agreed with the class on ");
      v.append(el("em", null, d.agree + " of " + d.compared));
      v.append(" battles (" + pct(d.agree, d.compared) + "%).");
      bars.append(v);
    }

    const parts = [duel, bars];
    if (d.disagreements.length) {
      const dis = el("section", "dis");
      dis.append(el("h3", null, "Where you and the judge disagreed"));
      for (const f of d.disagreements) {
        const box = el("div", "fight"); box.append(el("div", "major", f.major));
        const pair = el("div", "pair");
        for (const k of ["A", "B"]) {
          const r = f[k], col = el("div");
          col.append(el("p", null, r.text));
          const tag = el("div", "tag");
          tag.append(el("b", null, name(d[k].model)), " \\u00b7 judge " + r.funny + "/5");
          if (f.vote === k) tag.append(" \\u00b7 ", el("span", "you", "class pick"));
          if (f.judge === k && r.why) tag.append(el("br"), "\\u201c" + r.why + "\\u201d");
          col.append(tag); pair.append(col);
        }
        box.append(pair); dis.append(box);
      }
      parts.push(dis);
    }
    out.replaceChildren(...parts);
  }

  async function tick() {
    try {
      const r = await fetch("/api/board" + location.search);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      render(d);
    } catch (e) { document.getElementById("meta").textContent = "Couldn't load the board: " + e.message; }
  }
  tick(); setInterval(tick, 10000);
</script>
</body></html>`;
