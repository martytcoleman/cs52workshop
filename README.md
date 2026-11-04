# LLM ops: gateways, tracing, evals, cost

CS52 workshop, Friday Nov 6, 2 PM. Marty & Timur, with Gene as TA. [Slides](SLIDES_LINK)

Calling a model in production is a network request that costs money, fails in new ways, and gives you a different answer every time. LLM ops is the layer that makes that survivable. You need three things:

- A **gateway** that every call goes through, so you can route between models, fall back when one is down, and cap spend.
- **Tracing**, so you can see what went in, what came out, how long it took, and what it cost.
- **Evals**, so "is it good?" gets a number instead of a vibe.

We use the Vercel AI Gateway, Langfuse (open source, self-hostable), and AI SDK 7. The demo is a small Hono app on Vercel.

## The demo: roast my major

Two models roast the same major side by side. You don't know which wrote which. You vote for the funnier one, and only then does the page tell you who it was, how long it took, and what it cost.

Model A is Gemini 3.8 Flash, the cheap one. Model B is Claude Sonnet 5.5, which costs about 2.7x more per roast. Which side of the screen each one lands on is random, so position doesn't decide the vote.

Every battle becomes a trace in Langfuse, your vote becomes a score on that trace, and an LLM judge grades each roast on its own about a minute later. The live board reads all of that back out and puts the class next to the judge.

- Play: **[llm-ops-workshop.vercel.app](https://llm-ops-workshop.vercel.app)**
- Board: **[llm-ops-workshop.vercel.app/board](https://llm-ops-workshop.vercel.app/board?since=2026-11-06T14:00-05:00)**

## How the session runs

1. **Predict.** Before anyone opens the app, hands up: who thinks the expensive model will be funnier? Most people assume price buys quality. Remember the count.
2. **Roast and vote (about 10 minutes).** Everyone opens the site on their phone, enters a major, and picks the funnier roast. After voting, open your trace and look at both model calls, their tokens, and their cost. Try a fake major too. The prompt tells the models to roast you for inventing one.
3. **Put the board up.** Show the class split next to the judge's split. If the cheap model won, go back to the hands from step 1. That's the whole argument for evals: you test it on your task instead of guessing.
4. **Argue with the judge.** The bottom of the board lists battles where the class and the judge disagreed, along with the judge's reasoning. Read one out and ask who agrees with the judge. Then ask the real question: should a third model be refereeing two others?
5. **Talk about cost.** The board shows the total spend for the room. A full class is well under a dollar, and the key has a hard $10 cap.

The board link above only counts battles from 2 PM Eastern on Friday, so practice runs from earlier don't show up. The `-05:00` is Eastern time after daylight saving ended. Without `since`, the board shows the last 6 hours.

## The judge

The judge lives in Langfuse, not in our code. The app only records each roast as a span (`model-A` or `model-B`) with the major as input and the roast as output. A Langfuse rule watches for those spans and sends each one to GPT-4.1 mini with two prompts:

- `judge_funny` scores the roast 1 to 5 against a stingy comedy-booker rubric. Most roasts get a 2 or 3, and stacking campus references isn't a punchline.
- `judge_breaks_rules` answers true or false against the content rules, and quotes the offending words when it's true.

We picked a model that isn't in the contest so the judge has no home-team bias. It runs through the same gateway key, so it counts against the same budget, at roughly $0.0003 a grade.

Grading happens in the background on purpose. Showing the score before the vote would bias it, and waiting for it would slow every roast down. That's also how judges usually run in production: they watch quality without sitting in the request path.

`scripts/setup-judge.ts` creates all of this through Langfuse's API: the gateway connection, both evaluators, the rules that trigger them, and the `roast-majors` dataset. Rerun it after you change a judge prompt and it publishes a new version.

## Offline evals

The judge grades live traffic. `npm run eval` is the other half: before you ship a prompt change, run the same eight majors through both models and check the results.

Each roast gets four checks written in plain code: on topic, nothing sexual, no F-bombs, under 50 words. The judge also grades every eval run, so you get both kinds of check. Code checks are cheap and give the same answer every time. The judge catches things a regex can't, like a stereotype dressed up as a joke about a major.

The test majors live in the Langfuse dataset `roast-majors`, so you can add rows in the UI without touching code. Runs show up side by side under Datasets → roast-majors.

The eval earned its keep while we built this. It caught Gemini calling Government "a four-year circle jerk", which both the regex and the judge flagged, and that roast is why the prompt now names the phrase.

## Content rules

Swearing is fine. A roast should sting. These are off limits:

- "fuck" in any form
- anything sexual
- jokes about suicide or death
- jokes about race, gender, religion, or any other group. Roast the choices people make, not who they are.

The rules live in `src/prompt.ts`, and a prompt isn't a guarantee: in testing Gemini still dropped an F-bomb about once in 30 roasts. So there are three layers:

- **Before you see it:** the app runs a word check (`src/checks.ts`) on every roast. If it finds an F-bomb or something sexual, it quietly asks the model again, up to three tries, and bleeps it if all three fail. You only pay the extra couple of seconds on a bad roast. Langfuse records `tries` on the span, so you can see when it happened.
- **After you see it:** the LLM judge flags anything the word list can't catch, like a stereotype.
- **Before you ship a prompt change:** `npm run eval` scores the raw model output with the same word checks, without the re-roll, so you see how well the prompt holds by itself.

## Run it yourself

```sh
cp .env.example .env    # add Langfuse keys and an AI Gateway key
npm i
npm run dev             # http://localhost:3000
```

No keys? `MOCK_MODELS=1 npm run dev` runs a fake model, and `npm test` exercises the whole pipeline against a fake Langfuse.

The AI Gateway needs a credit card on file even if you have credit. Put a budget on the key before you share a URL:

```sh
vercel ai-gateway budgets set api-key <key-id> --amount 10 --refresh-period none
```

## What's in the repo

| File | What it does |
| --- | --- |
| `src/index.ts` | The app. Runs both models in parallel inside one trace, tags everything with user and session, turns a vote into a score, and serves the board API. |
| `src/prompt.ts` | The roast prompt and the settings both models share. Change it, then run the eval. |
| `src/page.ts` | The page the class uses. Plain HTML and fetch, no build step. |
| `src/checks.ts` | The word checks: F-bombs and sexual content. The app re-rolls on them; the eval scores with them. |
| `src/board.ts` | The live board. Pulls votes and judge scores out of Langfuse and lines them up. |
| `src/instrumentation.ts` | OpenTelemetry plus Langfuse's span processor, so every AI SDK call gets traced. |
| `scripts/eval.ts` | The offline eval: dataset × both models, with code checks. |
| `scripts/setup-judge.ts` | Sets up the LLM judge and the dataset in Langfuse. Safe to rerun. |
| `scripts/compare.ts` | Quick look at candidate models: sample roasts, speed, cost, rule breaks. This is how we ruled out Grok. |
| `scripts/load.ts` | Fires 40 requests at once, like a class does. Run it before you present. |
| `test/budget-gotcha.ts` | Reproduces the budget gotcha below against a fake gateway. |
| `test/e2e.ts` | End-to-end check with mocked models and a fake Langfuse. |

## Things that bit us

**A blown budget looks like a server crash.** When you hit the cap, the gateway returns HTTP 402, but AI SDK 7 throws it as `GatewayInternalServerError`. The error handling an agent writes for you will tell users the server is broken when the real problem is that you're out of money. Check `err.statusCode === 402`. `test/budget-gotcha.ts` reproduces it.

**Thinking tokens count against your output cap.** With `maxOutputTokens: 150`, a model that decides to think first can spend all 150 tokens reasoning and send back an empty roast. Gemini 3.8 Flash ignored "no thinking" about a quarter of the time. What worked was setting thinking to "low" and raising the cap to 1024. Short answers still come back short; the cap only stops a runaway.

**Cost is in the response.** The gateway puts what you actually paid in `providerMetadata.gateway.cost`. Looking it up afterward by generation ID often failed because the record wasn't there yet.

**The documented install fails.** OpenTelemetry 0.300 needs a newer `@opentelemetry/api` than Langfuse 6.1 allows. A fresh `npm i` errors out, and forcing it breaks at runtime. Pin `@opentelemetry/sdk-node@0.223.0` and keep the `overrides` in `package.json`.

**Agents write AI SDK 6 code.** `experimental_telemetry: { isEnabled: true }` is a deprecated alias in v7. The real switch is `registerTelemetry(...)`. Without it you get no traces and no error.

**Serverless drops traces.** Vercel can freeze the function the moment you respond, before the spans have been sent. Call `forceFlush()` first.

**Vercel needs `.js` on relative imports.** It runs the code as plain ESM, so `./prompt` works locally under tsx and crashes on deploy. Write `./prompt.js`.

**Langfuse is retiring `GET /traces`.** It stops working on Nov 16, 2026. The board reads `/v2/observations` and `/v3/scores` instead.

**Budgets are soft and slow.** The gateway checks the budget when a request starts, so the request that crosses the line still finishes. A new budget can take a minute or two to start working. If your deploy authenticates with OIDC instead of an API key, a key budget does nothing, so set a project budget instead. (This deploy uses a key.)

## After class

```sh
npx vercel env add KILL_SWITCH --environment production --value 1 --yes
npx vercel deploy --prod
```

The roast endpoint shuts off, and the board stays up so you can still show results. Rotate the gateway key too.

## Links

- [Langfuse × AI SDK](https://langfuse.com/integrations/frameworks/vercel-ai-sdk), the setup we followed
- [Langfuse LLM-as-a-judge](https://langfuse.com/docs/evaluation/get-started/online)
- [Langfuse datasets and experiments](https://langfuse.com/docs/evaluation/dataset-runs/datasets)
- [AI Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets). Read "When a budget is exceeded."
- [Langfuse token and cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking), for when cost shows $0
