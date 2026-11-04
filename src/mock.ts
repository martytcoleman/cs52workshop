// Offline model for rehearsals and tests: MOCK_MODELS=1 npm run dev
import { MockLanguageModelV4 } from "ai/test";

export function mockModel(modelId: string) {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId,
    doGenerate: async ({ prompt }) => {
      const fast = modelId.includes("flash");
      await new Promise((r) => setTimeout(r, fast ? 300 : 900));
      const major = JSON.stringify(prompt).match(/Major: ([^"\\]+)/)?.[1] ?? "your major";
      const text = fast
        ? `[mock A] ${major}? Bold choice for someone who lives in Baker-Berry anyway.`
        : `[mock B] Ah, ${major}: four years of learning to explain your major at Foco, one confused relative at a time.`;
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 160, noCache: 160, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 30, text: 30, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}
