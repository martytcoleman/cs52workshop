// End-to-end smoke test with NO real keys: fake model + fake Langfuse server.
// Proves: spans reach Langfuse, trace attributes are attached, a vote becomes a score.
//   npm test
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const received: { path: string; body: string }[] = [];
const fake = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let buf = Buffer.concat(chunks);
    if (req.headers["content-encoding"] === "gzip") buf = gunzipSync(buf);
    received.push({ path: req.url ?? "", body: buf.toString("latin1") });
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/api/public/projects")) return res.end(JSON.stringify({ data: [{ id: "proj_test" }] }));
    res.end(JSON.stringify({ successes: [], errors: [] }));
  });
});
await new Promise<void>((r) => fake.listen(4999, r));

Object.assign(process.env, {
  MOCK_MODELS: "1",
  LANGFUSE_BASE_URL: "http://localhost:4999",
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_SECRET_KEY: "sk-lf-test",
});
const { default: app } = await import("../src/index.js");

const ask = await app.request("/api/roast", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ major: "Philosophy", name: "test-student", sessionId: "s1" }),
});
const data: any = await ask.json();
console.log("roast →", ask.status, { left: data.left, right: data.right, traceUrl: data.traceUrl });

const fb = await app.request("/api/vote", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ traceId: data.traceId, winner: "B" }),
});
console.log("vote →", fb.status);

// The mock swears on the first try for this major; the app should re-roll and show a clean roast.
const sw = await app.request("/api/roast", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ major: "Swear Test", name: "test-student" }),
});
const swData: any = await sw.json();
console.log("swear →", sw.status, swData.left?.tries, swData.right?.tries);

const bad = await app.request("/api/roast", { method: "POST", body: "{}" , headers: { "content-type": "application/json" } });
await new Promise((r) => setTimeout(r, 500));

const otel = received.filter((r) => r.path.includes("/otel/")).map((r) => r.body).join("");
const scores = received.filter((r) => !r.path.includes("/otel/")).map((r) => r.body).join("");
const checks = {
  "roast returns 200": ask.status === 200,
  "trace id is 32 hex": /^[0-9a-f]{32}$/.test(data.traceId),
  "trace url built": data.traceUrl?.includes(data.traceId),
  "spans reached Langfuse": otel.length > 0,
  "both models got a roast": Boolean(data.left?.text && data.right?.text) && data.left.arm !== data.right.arm,
  "battle + both model spans exported": ["roast-battle", "model-A", "model-B"].every((n) => otel.includes(n)),
  "AI SDK generation spans exported": /generateText|ai\.generate|gen_ai/.test(otel),
  "userId propagated": otel.includes("test-student"),
  "major propagated": otel.includes("Philosophy"),
  "trace marked public": otel.includes("langfuse.trace.public"),
  "vote → score ingested": scores.includes("winner") && scores.includes(data.traceId),
  "empty major → 400": bad.status === 400,
  "swearing roast gets re-rolled": sw.status === 200 && ![swData.left?.text, swData.right?.text].some((t) => /fuck/i.test(t)) && swData.left?.tries === 2 && swData.right?.tries === 2,
};
console.table(checks);
fake.close();
const ok = Object.values(checks).every(Boolean);
console.log(ok ? "ALL GOOD" : "FAILURES ABOVE");
process.exit(ok ? 0 : 1);
