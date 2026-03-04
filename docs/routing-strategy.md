# Routing Strategy

This document explains how ModelRouter decides which LLM provider and model tier to use for each request.

---

## Overview

Every request passes through a three-stage pipeline:

```
Prompt → Classifier → Strategy Engine → Provider Manager → LLM
```

The strategy engine is the brain: it combines historical performance data with configurable scoring weights to pick the best available option, while occasionally exploring less-used models.

---

## Stage 1: Classification

The classifier (`src/services/classifier.ts`) analyses the prompt text and returns:

| Field              | Type                                    | Description                                  |
|--------------------|-----------------------------------------|----------------------------------------------|
| `domain`           | `coding \| math \| creative \| general` | The primary task category                    |
| `complexity`       | `low \| medium \| high`                 | Estimated difficulty                         |
| `confidence`       | `0–1`                                   | How certain the classifier is about `domain` |
| `estimatedTokens`  | `number`                                | Approximate prompt token count               |

Domain and complexity together drive the initial model tier selection. Complexity maps to tier:

| Complexity | Tier     |
|------------|----------|
| `low`      | `cheap`  |
| `medium`   | `balanced`|
| `high`     | `premium`|

---

## Stage 2: Strategy Engine

The strategy engine (`src/services/strategyEngine.ts`) implements **epsilon-greedy** model selection.

### Scoring formula

Each recorded (provider, tier) bucket is scored:

```
score = (confidenceWeight  × avgConfidence)
      - (costWeight        × avgCostUsd)
      - (latencyWeight     × avgLatencyMs)
      - (escalationWeight  × escalationRate)
```

Higher scores are better. Confidence increases the score; cost, latency, and escalation rate decrease it.

### Decision flow

1. **No history** → fall back to the built-in routing table (`providerManager.resolve()`).
2. **Random draw < ε** → **explore**: pick a random (provider, tier) from all registered options.
3. **Otherwise** → **exploit**: pick the highest-scoring bucket.

ε defaults to `0.1` (10% exploration). It decays toward 0 automatically as the performance store fills with reliable data.

### Weight configuration

Weights can be customised at three levels, in order of precedence:

| Level                | How                                            |
|----------------------|------------------------------------------------|
| Per-domain defaults  | Hardcoded in `DEFAULT_TASK_WEIGHTS`            |
| Startup env vars     | `CODE_WEIGHTS`, `MATH_WEIGHTS`, etc.           |
| Per-request override | `optimizationMode` or `customWeights` in body |

Env var format: `CODE_WEIGHTS=confidence:2.0,cost:5.0,latency:0.001,escalation:1.5`

`optimizationMode` presets:

| Mode         | Effect                                          |
|--------------|-------------------------------------------------|
| `cost`       | Strongly penalise cost, accept lower confidence |
| `quality`    | Reward confidence, tolerate higher cost         |
| `balanced`   | Use domain defaults unchanged                   |

---

## Stage 3: Escalation

After the initial model responds, the router checks whether to escalate:

```
if (classifierConfidence < CONFIDENCE_THRESHOLD) → try next tier up
```

Escalation is recorded as a separate performance stat, so future routing learns which models cause escalation most.

---

## `preferCost` flag

Setting `preferCost: true` downgrades the effective complexity by one level before routing:

```
high → medium → low
```

This biases routing toward cheaper models without changing the scoring weights.
