# LLM ops: gateways, tracing, evals, cost

**CS52 workshop · Fri Nov 6 · Marty & Timur · TA: Gene** · [Slides](SLIDES_LINK)

An LLM call in production is a network request that costs money, fails in new ways, and gives a different answer every time. LLM ops is the layer that makes it observable: a **gateway** that every call goes through (routing, fallbacks, budgets), **tracing** that records what went in, what came out, how long it took, and what it cost, and **evals** that score the outputs so "is it good?" gets a number.

Our stack: **Vercel AI Gateway** + **Langfuse** (open source, self-hostable) + **AI SDK 7**.

## Reach for it when

- You have more than one model call in prod and someone will ask "why did it say that?" A trace answers in 10 seconds. Without one you're guessing.
- A real person or a public URL can make you spend money. Put a budget on the key before you share it, not after the bill arrives.
- You're about to switch models or change a prompt. Run the test set first (`npm run eval`). Whether it feels better is not a test.

## Don't reach for it when

- It's a prototype nobody else uses. `console.log(result.usage)` is enough for now.
- You're making one call to one provider and will never switch. A gateway adds a hop and a vendor without buying you anything.
- You need sub-100ms latency or strict data residency and can't send prompts to a third party. Self-host Langfuse, or skip the hosted gateway.

## 5-minute activity

**Roast my major:** two models roast your major side by side, and you vote blind on the funnier one.

1. Open **[llm-ops-workshop.vercel.app](https://llm-ops-workshop.vercel.app)** on your phone or laptop.
2. Type your name and a major (yours or a friend's).
3. Pick the funnier roast. Then the page shows which model wrote each one.
4. Hit **Open your trace** to see both model calls in Langfuse, with tokens and cost.
5. Bonus: invent a fake major and see which model handles it better.

At the end we put the Langfuse dashboard on the projector: which model won more battles, and what did each winning roast cost?

**To redo it later:** `cp .env.example .env`, add Langfuse keys + an AI Gateway key, `npm i && npm run dev`, open `localhost:3000`. No keys? `MOCK_MODELS=1 npm run dev` runs a fake model, and `npm test` checks the whole pipeline against a fake Langfuse.

## Demo code

| File | What it shows |
| --- | --- |
| `src/instrumentation.ts` | OTel + `LangfuseSpanProcessor` + `registerTelemetry`: tracing every AI SDK call |
| `src/index.ts` | Two models in parallel in one trace, gateway model strings, fallbacks, `propagateAttributes` (user/session/tags), cost lookup, vote → score, 402 handling |
| `src/prompt.ts` | The roast prompt both models get. Change it, then run the eval |
| `scripts/eval.ts` | Offline eval: 8 test majors × 2 models with `langfuse.experiment.run`, checked in code (on topic, under 50 words) |
| `scripts/setup-judge.ts` | Creates the Langfuse LLM judge (funny 1-5, breaks rules true/false) that grades every live roast, plus the `roast-majors` dataset. Re-run after editing the judge prompts |
| `scripts/compare.ts` | Try candidate models on the roast prompt: samples, speed, cost, rule breaks |
| `test/budget-gotcha.ts` | Reproduces the gotcha below against a fake gateway |
| `scripts/load.ts` | Fires 40 requests at once, like the class will. Run it before class |

## The gotcha

**A blown budget looks like a server crash.** The AI Gateway returns HTTP `402 quota_for_entity_exceeded`, but AI SDK 7 throws it as **`GatewayInternalServerError`**. Code an agent writes (`if (err instanceof GatewayRateLimitError) ... else "500, please retry"`) tells users the server is broken when the real problem is that your budget is spent. Check `err.statusCode === 402` instead. (We reproduced it in `test/budget-gotcha.ts`. It's also buried in the budgets docs.)

Also bit us:

- **Today's install command from the docs fails.** OpenTelemetry 0.300 / core 3.0 (released Oct 20) needs `@opentelemetry/api` 1.10, but Langfuse 6.1 pins core 2.x. A fresh `npm i` gives `ERESOLVE`, and forcing it gives `SeverityNumber` import errors at runtime. Fix: pin `@opentelemetry/sdk-node@0.223.0` plus the `overrides` in `package.json`.
- **Agents write AI SDK 6 code.** `experimental_telemetry: { isEnabled: true }` is now a deprecated alias. In v7 the switch is `registerTelemetry(...)`, and without it you get zero traces and no error.
- **Serverless drops traces.** If the function freezes before spans flush, the trace never shows up. Call `forceFlush()` before you respond.
- **Budgets are soft and slow.** They're checked at the *start* of a request, so the request that crosses the line still completes. A new key's budget can take a minute or two to kick in. On Vercel deploys (OIDC auth), set a **project** budget, because API-key budgets don't apply.

## Links

- [Langfuse × AI SDK integration](https://langfuse.com/integrations/frameworks/vercel-ai-sdk): the setup we used
- [AI Gateway budgets & spend limits](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets): read the "When a budget is exceeded" section
- [Langfuse online evals](https://langfuse.com/docs/evaluation/get-started/online): add a judge model to grade live roasts
- [Langfuse token & cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking): why cost sometimes shows $0
- [Langfuse 10-minute demo video](https://langfuse.com/watch-demo)
# cs52workshop
