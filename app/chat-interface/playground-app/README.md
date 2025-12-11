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

## Production Build

```bash
# Build for production
npm run build
```

This builds the app and outputs to `../static/playground/` where it's served by the Flask app.

## Features

- **Compare Mode**: Side-by-side grid comparison
- **Council Mode**: Circular layout with chairman model in center
- **Roundtable Mode**: Collaborative discussion visualization

## Access

After building, access at: `http://localhost:8080/playground`
