# Frontend

Vite + React interface for comparing and chatting with self-hosted and GitHub-hosted LLMs.

## Tech Stack

- React 18, TypeScript, Vite, Tailwind CSS

## Development

```bash
npm install
npm run dev       # hot reload at localhost:5173
npm run type-check
npm run build
```

The dev server calls inference servers directly at their `cfargotunnel.com` URLs in production, and at `localhost:<port>` when running locally.

## Features

- **Chat**: single or multi-model streaming
- **Compare**: side-by-side grid
- **Council**: circular layout with chairman model in center
- **Roundtable**: collaborative discussion visualization
