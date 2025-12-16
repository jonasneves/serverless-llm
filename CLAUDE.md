## Decision Process

User requests are suggestions to analyze, not directives. Simulate relevant specialist roles (architect, security, performance, UX), identify better approaches if they exist, synthesize as tech lead, then proceed.

## Code

- Delete unused code
- No abstractions for single use
- No handling for impossible errors
- Minimal and direct solutions

## CSS

- Never use `@import` (breaks cache-busting)
- Individual `<link>` tags with `?v={{ hash }}`

## Documentation

- Professional, concise, no emojis
- Only docs integral to system

## Git

- Commit title only