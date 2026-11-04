// Verifies the gotcha by hand: what does a blown AI Gateway budget look like in AI SDK 7?
import { createServer } from "node:http";
import { createGateway, generateText } from "ai";

let calls = 0;
const fakeGateway = createServer((req, res) => {
  calls++;
  req.resume();
  req.on("end", () => {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: {
      message: 'Quota limit exceeded for "api_key_id_test". Current spend: $5.00, limit: $5.00.',
      type: "quota_for_entity_exceeded" } }));
  });
});
await new Promise<void>((r) => fakeGateway.listen(4998, r));

const gateway = createGateway({ baseURL: "http://localhost:4998/v4/ai", apiKey: "test" });
try {
  await generateText({ model: gateway("openai/gpt-whatever"), prompt: "hi" });
} catch (err: any) {
  console.log({ name: err.name, constructor: err.constructor?.name, statusCode: err.statusCode,
    isRetryable: err.isRetryable, httpCallsMade: calls, message: err.message.slice(0, 60) });
}
fakeGateway.close();
