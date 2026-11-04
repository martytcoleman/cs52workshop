// Offline model for rehearsals and tests: MOCK_MODELS=1 npm run dev
import { MockLanguageModelV4 } from "ai/test";

const swearTestCalls = new Map<string, number>();

export function mockModel(modelId: string) {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId,
    doGenerate: async ({ prompt }) => {
      const fast = modelId.includes("flash");
      await new Promise((r) => setTimeout(r, fast ? 300 : 900));
      const major = JSON.stringify(prompt).match(/Major: ([^"\\]+)/)?.[1] ?? "your major";
      // Test hook: the major "Swear Test" makes the first call per model swear, so we can see the re-roll.
      const n = swearTestCalls.get(modelId) ?? 0;
      if (major === "Swear Test") swearTestCalls.set(modelId, n + 1);
      if (major === "Swear Test" && n === 0) {
        return { ...reply("[mock] Swear Test is a fucking joke."), warnings: [] };
      }
      const text = fast
        ? `[mock A] ${major}? Bold choice for someone who lives in Baker-Berry anyway.`
        : `[mock B] Ah, ${major}: four years of learning to explain your major at Foco, one confused relative at a time.`;
      return { ...reply(text), warnings: [] };
    },
  });
}

function reply(text: string) {
      return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 160, noCache: 160, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 30, text: 30, reasoning: 0 },
        },
      };
}
