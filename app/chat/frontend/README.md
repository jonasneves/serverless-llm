# Serverless LLM Playground

Production-grade React interface for comparing LLM models with multiple visualization modes.

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Tailwind CSS** - Styling

## Development

```bash
# Install dependencies
npm install

# Run dev server (hot reload)
npm run dev

# Type check
npm run type-check
```

`npm run dev` proxies `/api/*` to `http://localhost:8080`, so run the FastAPI server on port 8080 for full functionality.

## Production Build

```bash
# Build for production
npm run build
```

This builds the app and outputs to `../static/playground/` where it's served by the FastAPI app.

## Local Preview (Static)

```bash
npm run preview
```

This builds to `dist/` with a `/` base and runs `vite preview`.

## Features

- **Compare Mode**: Side-by-side grid comparison
- **Council Mode**: Circular layout with chairman model in center
- **Roundtable Mode**: Collaborative discussion visualization

## Access

After building, access at: `http://localhost:8080/playground`
