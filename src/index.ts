import { langfuseProcessor } from "./instrumentation.js"; // must be first
import { Hono } from "hono";
import { gateway, generateText } from "ai";
import { LangfuseClient } from "@langfuse/client";
import {
  propagateAttributes,
  setActiveTraceAsPublic,
  startActiveObservation,
} from "@langfuse/tracing";
import { ROAST_PROMPT, ROAST_SETTINGS } from "./prompt.js";
import { PAGE } from "./page.js";
import { mockModel } from "./mock.js";
import { BOARD_PAGE, boardData } from "./board.js";
import { bleep, breaksRules } from "./checks.js";

// ── Config ────────────────────────────────────────────────────────────────
// The two contenders. Pick real IDs from vercel.com/ai-gateway/models.
const MODELS = {
  A: process.env.MODEL_A ?? "google/gemini-3.8-flash", // cheap + fast
  B: process.env.MODEL_B ?? "anthropic/claude-sonnet-5.5", // pricey + smart
} as const;
type Arm = keyof typeof MODELS;

// If a model is down, the gateway retries these in order.
const FALLBACKS = (process.env.MODEL_FALLBACKS ?? "").split(",").filter(Boolean);

// A roast that fails the word check gets re-rolled, up to this many attempts in total.
const MAX_TRIES = 3;

const langfuse = new LangfuseClient();
const app = new Hono();

// ── Tiny per-IP rate limit (the endpoint is public for the class) ─────────
const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 8, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

app.get("/", (c) => c.html(PAGE));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/board", (c) => c.html(BOARD_PAGE));

// ── The class scoreboard: votes + judge rulings, read back out of Langfuse ─
// ?since=2026-11-06T14:00 (or ?hours=2) picks the window; default is the last 6 hours.
// Cached briefly so a room full of open boards doesn't hammer the Langfuse API.
let boardCache: { key: string; at: number; data: unknown } | null = null;
app.get("/api/board", async (c) => {
  const hours = Number(c.req.query("hours") ?? 6);
  const sinceParam = c.req.query("since");
  const sinceMs = sinceParam ? Date.parse(sinceParam) : Date.now() - (Number.isFinite(hours) ? hours : 6) * 3600e3;
  if (Number.isNaN(sinceMs)) return c.json({ error: "bad since" }, 400);
  const since = new Date(Math.floor(sinceMs / 60_000) * 60_000).toISOString(); // to the minute, so the cache hits
  if (boardCache && boardCache.key === since && Date.now() - boardCache.at < 8_000) return c.json(boardCache.data);
  try {
    const data = await boardData(since, MODELS);
    boardCache = { key: since, at: Date.now(), data };
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Langfuse didn't answer." }, 502);
  }
});

// ── One roast from one model (its own span inside the battle's trace) ─────
function roast(arm: Arm, major: string, name: string) {
  return startActiveObservation(`model-${arm}`, async (span) => {
    const started = Date.now();
    const modelId = MODELS[arm];

    const once = async () => {
      const result = await generateText({
        // A plain "provider/model" string routes through the Vercel AI Gateway.
        model: process.env.MOCK_MODELS ? mockModel(modelId) : modelId,
        system: ROAST_PROMPT,
        prompt: `Major: ${major}`,
        ...ROAST_SETTINGS,
        telemetry: { functionId: "roast" },
        providerOptions: {
          ...ROAST_SETTINGS.providerOptions,
          gateway: {
            ...(FALLBACKS.length && { models: FALLBACKS }),
            user: name, // also shows up in the gateway's own spend reports
            tags: [`model:${arm}`],
          },
        },
      });
      // The gateway returns what you actually paid inline; fall back to a lookup by generation id.
      const gw = result.providerMetadata?.gateway as { cost?: unknown; generationId?: string } | undefined;
      const cost = gw?.cost != null && !Number.isNaN(Number(gw.cost)) ? Number(gw.cost) : await lookupCost(gw?.generationId);
      return { text: result.text.trim(), tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0), cost };
    };

    // The prompt says no F-bombs and nothing sexual, but a prompt isn't a guarantee.
    // If the word check trips, quietly ask again. Costs ~2s, only on the rare bad roast.
    let text = "", tokens = 0, costUsd: number | null = 0, tries = 0;
    do {
      const r = await once();
      tries++;
      text = r.text;
      tokens += r.tokens;
      costUsd = costUsd == null || r.cost == null ? null : costUsd + r.cost;
    } while (breaksRules(text) && tries < MAX_TRIES);
    if (breaksRules(text)) text = bleep(text);

    // The LLM judge reads input + output. `tries` > 1 means the word check caught something.
    span.update({ input: major, output: text, metadata: { arm, model: modelId, costUsd, tries } });

    return { text, latencyMs: Date.now() - started, tokens, costUsd, tries };
  });
}

// ── The one endpoint the class hits: two models, one major, side by side ──
app.post("/api/roast", async (c) => {
  if (process.env.KILL_SWITCH === "1") return c.json({ error: "Class is over. Thanks!" }, 503);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return c.json({ error: "Slow down, 8 roasts a minute." }, 429);

  const body = await c.req.json().catch(() => ({}));
  const major = String(body.major ?? "").trim().slice(0, 60);
  const name = String(body.name ?? "anon").trim().slice(0, 40) || "anon";
  const sessionId = String(body.sessionId ?? "").slice(0, 64) || undefined;
  if (!major) return c.json({ error: "Type a major." }, 400);

  // Shuffle which model shows on the left so position doesn't bias the vote.
  const left: Arm = Math.random() < 0.5 ? "A" : "B";
  const right: Arm = left === "A" ? "B" : "A";

  try {
    // propagateAttributes: every span created inside inherits user/session/tags.
    const out = await propagateAttributes(
      { traceName: "roast-battle", userId: name, sessionId, tags: ["cs52-workshop"], metadata: { major } },
      () =>
        startActiveObservation("roast-battle", async (span) => {
          span.update({ input: major });
          setActiveTraceAsPublic(); // anyone with the link can open this trace
          const [a, b] = await Promise.all([roast("A", major, name), roast("B", major, name)]);
          return { traceId: span.traceId, A: a, B: b };
        }),
    );

    return c.json({
      traceId: out.traceId,
      left: { arm: left, ...out[left] },
      right: { arm: right, ...out[right] },
      models: MODELS, // the page only reveals these after you vote
      traceUrl: await traceUrl(out.traceId),
    });
  } catch (err: any) {
    // GOTCHA: a blown budget is HTTP 402 but arrives as GatewayInternalServerError.
    // Check the status code, not the class name.
    if (err?.statusCode === 402) {
      return c.json({ error: "We hit our spending cap. The cap works!" }, 402);
    }
    if (err?.statusCode === 429) {
      return c.json({ error: "Too many people at once. Try again in a few seconds." }, 429);
    }
    console.error(err);
    return c.json({ error: "The models didn't answer. Try again." }, 500);
  } finally {
    // Serverless can freeze the process the moment we respond. Ship spans first.
    await langfuseProcessor.forceFlush().catch(() => {});
  }
});

// ── Your vote → a Langfuse score on that battle ───────────────────────────
app.post("/api/vote", async (c) => {
  const { traceId, winner } = await c.req.json().catch(() => ({}));
  if (typeof traceId !== "string" || !/^[0-9a-f]{32}$/.test(traceId)) {
    return c.json({ error: "bad traceId" }, 400);
  }
  if (!["A", "B", "tie"].includes(winner)) return c.json({ error: "bad winner" }, 400);

  langfuse.score.create({
    id: `${traceId}-winner`, // same id = changing your vote overwrites it
    traceId,
    name: "winner",
    value: winner,
    dataType: "CATEGORICAL",
  });
  await langfuse.flush();
  return c.json({ ok: true });
});

// ── helpers ───────────────────────────────────────────────────────────────
async function lookupCost(generationId?: string): Promise<number | null> {
  if (!generationId || process.env.MOCK_MODELS) return null;
  try {
    const info = await Promise.race([
      gateway.getGenerationInfo({ id: generationId }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500)),
    ]);
    return info.totalCost;
  } catch {
    return null; // cost lookups can lag a moment behind the response
  }
}

let traceUrlPrefix: string | null = null;
async function traceUrl(traceId: string): Promise<string | null> {
  try {
    if (!traceUrlPrefix) {
      const url = await langfuse.getTraceUrl(traceId);
      traceUrlPrefix = url.slice(0, url.length - traceId.length);
    }
    return traceUrlPrefix + traceId;
  } catch {
    return null;
  }
}

export default app;
