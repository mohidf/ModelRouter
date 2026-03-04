# Provider Abstraction

This document describes how ModelRouter abstracts over multiple LLM providers so that new ones can be added with minimal changes.

---

## Interface: `IModelProvider`

All providers implement the interface defined in `src/providers/baseProvider.ts`:

```typescript
interface IModelProvider {
  readonly name: string;

  generate(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<GenerateResult>;
}
```

`GenerateResult` carries:

| Field             | Type     | Description                                    |
|-------------------|----------|------------------------------------------------|
| `text`            | `string` | The model's response text                      |
| `inputTokens`     | `number` | Tokens in the prompt                           |
| `outputTokens`    | `number` | Tokens generated                               |
| `latencyMs`       | `number` | Wall-clock time for the API call               |
| `modelConfidence` | `0–1`    | Simulated or real confidence in the response   |

---

## Provider Registry

The `ProviderManager` (`src/providers/providerManager.ts`) maintains:

1. A registry of all loaded providers, keyed by name.
2. A **routing table** that maps `(domain, complexity)` to `(providerName, tier)`.
3. An **escalation table** that maps `(providerName, tier)` to the next tier up.

### Key methods

| Method                           | Description                                           |
|----------------------------------|-------------------------------------------------------|
| `resolve(domain, complexity)`    | Returns the default model for a task                  |
| `resolveExplicit(name, tier, reason)` | Returns a specific provider + tier combination  |
| `escalate(model, domain)`        | Returns the next-tier model, or null if at max tier   |
| `dispatch(model, prompt, opts)`  | Calls the provider and returns result + cost          |
| `listProviders()`                | Returns all registered provider instances             |

---

## Adding a New Provider

1. Create `src/providers/myProvider.ts` implementing `IModelProvider`.
2. Register it in `src/providers/index.ts`:
   ```typescript
   providerManager.registerProvider(new MyProvider());
   ```
3. Add routing table entries in `src/providers/providerManager.ts` if needed.
4. Add the API key to `.env.example` and `backend/.env`.

---

## Mock Providers

`src/providers/mockProvider.ts` simulates latency, cost, and confidence for local development without spending API credits. It follows the same `IModelProvider` interface and is swapped out by replacing the provider registered in `src/providers/index.ts`.

---

## Cost Estimation

`dispatch()` calls `estimateCost()` on the provider, which computes:

```
inputCostUsd  = inputTokens  × pricePerInputToken  × tierMultiplier
outputCostUsd = outputTokens × pricePerOutputToken × tierMultiplier
totalCostUsd  = inputCostUsd + outputCostUsd
```

Tier multipliers increase with tier: `cheap (1×) < balanced (2×) < premium (4×)`.
