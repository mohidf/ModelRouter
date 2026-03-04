# Adaptive Learning

This document explains how ModelRouter improves routing decisions over time using exponential moving averages (EMA).

---

## Overview

Every time a provider call completes, ModelRouter records the outcome and updates a per-(provider, tier, taskType) performance bucket. These buckets are used by the strategy engine to score and rank models on the next request.

---

## Performance Buckets

Each bucket tracks:

| Metric              | Description                                           |
|---------------------|-------------------------------------------------------|
| `averageConfidence` | EMA of `modelConfidence` values from past calls       |
| `averageLatencyMs`  | EMA of response times in milliseconds                 |
| `averageCostUsd`    | EMA of per-call cost in USD                           |
| `escalationRate`    | EMA of whether the call required escalation (0 or 1)  |
| `totalRequests`     | Count of calls to this (provider, tier, taskType)     |

---

## Exponential Moving Average (EMA)

Each metric is updated using:

```
newValue = α × latestObservation + (1 − α) × previousEMA
```

Where `α` (`EMA_ALPHA`, default `0.2`) controls how quickly the average responds to new data:

- **High α (0.5–1.0)** — recent observations dominate; adapts quickly but noisy.
- **Low α (0.05–0.1)** — older history matters more; stable but slow to adapt.
- **Default (0.2)** — responsive without excessive noise.

---

## Persistence

Performance stats are persisted to Supabase (PostgreSQL) after every request via `PerformanceStore` (`src/services/performanceStore.ts`). This means:

- Stats survive server restarts.
- Multiple server instances share the same learning data.
- Historical trends are queryable for offline analysis.

The SQL schema is defined in `backend/supabase/migrations/003_ema_performance.sql`.

---

## Exploration vs. Exploitation

EMA stats only improve exploitation — choosing the known best option. To discover whether untested or under-used models have improved, the strategy engine uses **epsilon-greedy** exploration:

- With probability `ε` (default 10%), a random (provider, tier) is chosen regardless of score.
- The result is recorded normally, so the EMA for that combination updates.
- Over time, all combinations accumulate enough data for exploitation to be reliable.

---

## Learning Timeline

| Requests | Expected behaviour                                          |
|----------|-------------------------------------------------------------|
| 0–5      | Fallback routing (no data); EMA not yet meaningful          |
| 5–20     | Early EMA values; occasional exploration still dominant     |
| 20–100   | Scores stabilize; exploitation begins to dominate           |
| 100+     | High-confidence routing; ε exploration acts as variance check |

---

## Request Logging

In addition to EMA stats, every completed request is written to a `request_logs` table in Supabase. This provides a full audit trail and enables future features like:

- Manual performance review
- Cost reporting per time period
- Debugging unexpected routing decisions
