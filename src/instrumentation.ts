// Must be imported BEFORE anything that calls the AI SDK.
// 1. OpenTelemetry collects spans.  2. LangfuseSpanProcessor ships them to Langfuse.
// 3. registerTelemetry tells AI SDK 7 to emit spans for every model call.
import { registerTelemetry } from "ai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeSDK } from "@opentelemetry/sdk-node";

export const langfuseProcessor = new LangfuseSpanProcessor({
  // "immediate" = export each span as it ends. Safer on serverless, where the
  // process can be frozen before a batch goes out.
  exportMode: process.env.VERCEL ? "immediate" : "batched",
});

const sdk = new NodeSDK({ spanProcessors: [langfuseProcessor] });
sdk.start();

registerTelemetry(new LangfuseVercelAiSdkIntegration());
