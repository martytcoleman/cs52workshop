// Offline eval: same majors, both models, checked in code, side by side in Langfuse.
// Run it after you change the prompt to make sure the roasts still follow the rules.
//   npm run eval
import { langfuseProcessor } from "../src/instrumentation.js";
import { generateText } from "ai";
import { LangfuseClient } from "@langfuse/client";
import { ROAST_PROMPT, ROAST_SETTINGS } from "../src/prompt.js";
import { mockModel } from "../src/mock.js";
import { F_BOMB, SEXUAL } from "../src/checks.js";

const MODELS = [
  process.env.MODEL_A ?? "google/gemini-3.8-flash",
  process.env.MODEL_B ?? "anthropic/claude-sonnet-5.5",
];

// Test majors live in the Langfuse dataset "roast-majors" (made by scripts/setup-judge.ts), so you
// can add rows in the UI. This copy is the fallback when the dataset doesn't exist (e.g. mock runs).
// Each major + a word the roast should mention to count as "on topic".
const data = [
  { input: "Computer Science", expectedOutput: "code" },
  { input: "Economics", expectedOutput: "econ" },
  { input: "Government", expectedOutput: "gov" },
  { input: "Philosophy", expectedOutput: "philosoph" },
  { input: "Engineering", expectedOutput: "engineer" },
  { input: "Biology", expectedOutput: "bio" },
  { input: "Art History", expectedOutput: "art" },
  { input: "Underwater Basket Weaving", expectedOutput: "basket" },
];

const langfuse = new LangfuseClient();
const dataset = await langfuse.dataset.get("roast-majors").catch(() => null);
console.log(dataset ? `Using Langfuse dataset roast-majors (${dataset.items.length} items)` : "Using built-in test majors");
// Runs linked to a dataset show up side by side under Datasets → roast-majors → Runs.
const run = (params: Parameters<NonNullable<typeof dataset>["runExperiment"]>[0]) =>
  dataset ? dataset.runExperiment(params) : langfuse.experiment.run({ ...params, data } as any);

for (const model of MODELS) {
  const result = await run({
    name: "roast-rules",
    runName: `${model} ${new Date().toISOString().slice(0, 16)}`,
    metadata: { model },
    maxConcurrency: 4,
    task: async ({ input }) => {
      const { text } = await generateText({
        model: process.env.MOCK_MODELS ? mockModel(model) : model,
        system: ROAST_PROMPT,
        prompt: `Major: ${String(input)}`,
        ...ROAST_SETTINGS,
      });
      return text;
    },
    evaluators: [
      // Checks written in plain code: the same answer always gets the same score.
      // This scores the raw model output, before the app's re-roll, so you see how well the prompt alone holds.
      async ({ output, expectedOutput }) => ({
        name: "on_topic",
        value: String(output).toLowerCase().includes(String(expectedOutput)) ? 1 : 0,
      }),
      async ({ output }) => ({
        name: "nothing_sexual",
        value: SEXUAL.test(String(output)) ? 0 : 1,
      }),
      async ({ output }) => ({ name: "no_f_bomb", value: F_BOMB.test(String(output)) ? 0 : 1 }),
      async ({ output }) => ({ name: "under_50_words", value: String(output).split(/\s+/).length <= 50 ? 1 : 0 }),
    ],
    runEvaluators: [
      async ({ itemResults }) => {
        const passed = itemResults.filter((r) => r.evaluations.every((e) => e.value === 1));
        return { name: "pass_rate", value: passed.length / itemResults.length };
      },
    ],
  });
  console.log(await result.format());
}

await langfuse.flush();
await langfuseProcessor.forceFlush();
process.exit(0);
