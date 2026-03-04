# ModelRouter

A self-optimizing AI model router that dynamically selects the best LLM provider and model tier based on task type, latency, cost, and historical performance.

---

## Features

- **Multi-provider routing** — OpenAI and Anthropic, with a clean interface for adding more
- **Task classification** — automatically classifies prompts as coding, math, creative, or general
- **Strategy engine** — scores every known model using weighted confidence, cost, latency, and escalation metrics
- **Adaptive learning** — exponential moving averages (EMA) update per-model performance stats after every call
- **Epsilon-greedy exploration** — occasionally routes to less-used models to discover better options
- **Escalation** — when classifier confidence is low, automatically retries with a higher-tier model
- **Cost-aware routing** — `preferCost` and `optimizationMode` options bias routing toward cheaper models
- **Dark-mode dashboard** — Prompt, Metrics, and Insights tabs with routing decision visualization

---

## Architecture

```
User Prompt
     ↓
 Classifier          (domain + complexity + confidence)
     ↓
Strategy Engine      (score every known provider/tier, pick best)
     ↓
Provider Manager     (dispatch to OpenAI or Anthropic)
     ↓
 LLM Provider        (generate response)
     ↓
Performance Store    (record latency, cost, confidence via EMA)
```

---

## Tech Stack

| Layer     | Technology                                     |
|-----------|------------------------------------------------|
| Frontend  | React 19, Vite, TypeScript, Tailwind CSS v4    |
| Backend   | Node.js, TypeScript, Express                   |
| AI        | OpenAI API, Anthropic API                      |
| Database  | Supabase (PostgreSQL)                          |

---

## Project Structure

```
model-router-ai/
├── backend/                   Express API server
│   ├── src/
│   │   ├── providers/         OpenAI, Anthropic, mock providers
│   │   ├── services/          classifier, router, strategy engine, EMA store
│   │   ├── routes/            /route, /metrics, /performance endpoints
│   │   ├── middleware/        rate limiter, request logger, error handler
│   │   └── lib/               Supabase client
│   └── supabase/migrations/   SQL schema files
├── frontend/                  React dashboard
│   └── src/
│       ├── components/        PromptCard, ResponsePanel, MetricsPanel, InsightsPanel
│       └── types.ts           Shared TypeScript interfaces
├── docs/                      Architecture documentation
├── .env.example               Environment variable template
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- A [Supabase](https://supabase.com) project (for performance persistence)

### 1. Clone the repository

```bash
git clone https://github.com/mohidf/ModelRouter.git
cd ModelRouter
```

### 2. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Configure environment variables

```bash
cp .env.example backend/.env
# Edit backend/.env and fill in your API keys and Supabase credentials
```

### 4. Run the database migrations

Apply the SQL files in `backend/supabase/migrations/` to your Supabase project via the Supabase dashboard SQL editor, in order:

1. `001_performance_stats.sql`
2. `002_request_logs.sql`
3. `002b_request_logs_patch.sql`
4. `003_ema_performance.sql`

### 5. Start the backend

```bash
cd backend
npm run dev        # hot-reload dev server on http://localhost:3000
```

### 6. Start the frontend

```bash
cd frontend
npm run dev        # Vite dev server on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available Scripts

### Backend (`/backend`)

| Script          | Description                                 |
|-----------------|---------------------------------------------|
| `npm run dev`   | Start with nodemon + ts-node (hot reload)   |
| `npm run build` | Compile TypeScript to `dist/`               |
| `npm start`     | Run compiled `dist/index.js`                |
| `npm run test:db` | Verify Supabase connection                |

### Frontend (`/frontend`)

| Script            | Description                           |
|-------------------|---------------------------------------|
| `npm run dev`     | Vite dev server with HMR              |
| `npm run build`   | Type-check + build to `dist/`         |
| `npm run preview` | Preview the production build locally  |

### Root (convenience)

| Script                | Description                           |
|-----------------------|---------------------------------------|
| `npm run backend:dev` | Start backend dev server              |
| `npm run frontend:dev`| Start frontend dev server             |
| `npm run install:all` | Install all workspace dependencies    |

---

## How It Works

The router runs a three-stage pipeline on every request:

1. **Classify** — a keyword and pattern-based classifier assigns the prompt a `domain` (coding/math/creative/general) and `complexity` (low/medium/high) with a confidence score.

2. **Route** — the strategy engine scores every (provider, tier) combination it has seen before, using a weighted formula:
   ```
   score = confidenceWeight × avgConfidence
         - costWeight       × avgCostUsd
         - latencyWeight    × avgLatencyMs
         - escalationWeight × escalationRate
   ```
   With probability `ε` (default 10%) it randomly explores a different option instead.

3. **Learn** — after every call, EMA-smoothed stats are written to Supabase, so the next request benefits from the updated data.

See [docs/routing-strategy.md](docs/routing-strategy.md) for a deeper explanation.

---

## API Endpoints

| Method | Path               | Description                                    |
|--------|--------------------|------------------------------------------------|
| POST   | `/route`           | Route a prompt and return the LLM response     |
| GET    | `/metrics`         | Aggregate request statistics                   |
| GET    | `/performance`     | Per-model ranked insights by task type         |

### POST `/route` — request body

```json
{
  "prompt": "Explain binary search trees",
  "maxTokens": 1024,
  "preferCost": false,
  "optimizationMode": "balanced"
}
```

`optimizationMode`: `"cost"` | `"balanced"` | `"quality"`

---

## Screenshots

### Prompt — enter your query and routing options
![Prompt tab](assets/screenshots/ui1.png)

### Response — markdown output with routing decision pipeline
![Response panel](assets/screenshots/ui2.png)

### Metrics — live request statistics and per-model breakdown
![Metrics tab](assets/screenshots/ui3.png)

### Insights — best provider per task type with adaptive scores
![Insights tab](assets/screenshots/ui4.png)

---

## Future Improvements

- [ ] Streaming responses (Server-Sent Events)
- [ ] User authentication and per-user history
- [ ] Additional providers (Google Gemini, Cohere)
- [ ] Automated prompt evaluation and scoring
- [ ] Cost budget alerts
- [ ] Export routing logs as CSV

---

## License

[MIT](LICENSE)
