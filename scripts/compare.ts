// Quick side-by-side of candidate models on the roast prompt: samples, speed, cost, rule breaks.
// Not traced or scored in Langfuse; use `npm run eval` for that.
//   npx tsx --env-file=.env scripts/compare.ts spacexai/grok-4.7 google/gemini-3.8-flash
import { generateText } from "ai";
import { ROAST_PROMPT, ROAST_SETTINGS } from "../src/prompt.js";

(globalThis as any).AI_SDK_LOG_WARNINGS = false;
const models = process.argv.slice(2);
const majors = ["Computer Science", "Economics", "Government", "Philosophy", "Engineering", "Biology", "Art History", "Underwater Basket Weaving"];
const sexual = /\b(sex\w*|suck(s|ing)? off|blow ?jobs?|horny|dick|cock|cum|porn\w*|hook ?ups?|orgasm\w*|nudes?|jerk(s|ing|ed)? off|circle[- ]?jerk\w*)\b/i;

for (const model of models) {
  const rs = await Promise.all(
    majors.map(async (major) => {
      const t = Date.now();
      try {
        const r = await generateText({ model, system: ROAST_PROMPT, prompt: `Major: ${major}`, ...ROAST_SETTINGS });
        const gw = r.providerMetadata?.gateway as { cost?: unknown } | undefined;
        return { major, ms: Date.now() - t, text: r.text.trim(), finish: r.finishReason, cost: Number(gw?.cost ?? 0) };
      } catch (e: any) {
        return { major, ms: Date.now() - t, text: `ERROR ${String(e.message).slice(0, 120)}`, finish: "error", cost: 0 };
      }
    }),
  );
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const breaks = rs.filter((r) => /f+u+c+k/i.test(r.text) || sexual.test(r.text)).length;
  const long = rs.filter((r) => r.text.split(/\s+/).length > 50).length;
  const cut = rs.filter((r) => r.finish !== "stop").length;
  const avg = rs.reduce((a, r) => a + r.cost, 0) / rs.length;
  console.log(`\n=== ${model}  median ${ms[ms.length >> 1]}ms  max ${ms.at(-1)}ms  avg $${avg.toFixed(5)}  rule breaks ${breaks}  >50 words ${long}  cut off ${cut}`);
  for (const r of rs) console.log(`- [${r.major}] ${r.text}`);
}
