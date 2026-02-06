# LLM Playground

React interface for comparing LLM models with multiple visualization modes.

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
npm run build
```

Outputs to `dist/`. Deployed to GitHub Pages at `chat.neevs.io`.

## Local Preview

```bash
npm run preview
```

## Features

- **Compare Mode**: Side-by-side grid comparison
- **Council Mode**: Circular layout with chairman model in center
- **Roundtable Mode**: Collaborative discussion visualization
