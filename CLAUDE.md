## Code

- Delete unused code (imports, variables, functions, props, files)
- No abstractions for single use
- No handling for impossible errors
- Minimal and direct solutions
- Consolidate duplicate code immediately
- Replace multiple similar functions with configuration objects
- Remove trailing whitespace and excess blank lines
- Prefer direct solutions over complex patterns
- Simplify conditional logic where possible
- After making significant code changes, run @agent-code-simplifier:code-simplifier to identify and remove cruft

## CSS

- Never use `@import` (breaks cache-busting)
- Individual `<link>` tags with `?v={{ hash }}`

## Documentation

- Professional, concise, no emojis
- Only docs integral to system
- Script output may use functional emojis