// Simulate the class hitting the endpoint at once. Run against your deploy Wed/Thu.
export {};
//   npx tsx scripts/load.ts https://your-app.vercel.app 40
const [url = "http://localhost:3000", n = "40"] = process.argv.slice(2);
const majors = ["Computer Science", "Economics", "Government", "Philosophy"];

const started = Date.now();
const results = await Promise.all(
  Array.from({ length: Number(n) }, async (_, i) => {
    const t = Date.now();
    const r = await fetch(`${url}/api/roast`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${i}` },
      body: JSON.stringify({ major: majors[i % majors.length], name: `load-${i}` }),
    }).catch(() => null);
    return { status: r?.status ?? "network", ms: Date.now() - t };
  }),
);

const byStatus = Object.groupBy(results, (r) => String(r.status));
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
console.log({
  total: results.length,
  statuses: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v!.length])),
  p50: ms[Math.floor(ms.length / 2)],
  p95: ms[Math.floor(ms.length * 0.95)],
  wallMs: Date.now() - started,
});
