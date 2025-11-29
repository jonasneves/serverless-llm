# Styling Consistency - TODO

## Current Status

We have a unified design system (`common-styles.css`) but pages still have duplicate CSS that overrides it.

## Issue

Each page (Discussion, AutoGen, Diversity) has duplicate base CSS:
- `:root` variables (already in common-styles.css)
- `body` styles (already in common-styles.css)
- `header` styles (already in common-styles.css)
- `.logo`, `.logo-icon`, `.logo-text` (already in common-styles.css)
- `.modes`, `.mode-link` (already in common-styles.css)
- `.icon-btn` (already in common-styles.css)

This causes inconsistent sizing because page-specific CSS overrides common-styles.css.

## Solution Needed

### For Each Page:
1. **Remove** all duplicate base styles
2. **Keep ONLY** page-specific styles:
   - Unique CSS variables (e.g., `--qwen-color`, `--tool-colors`)
   - Page-specific components
   - Unique layouts

### Files to Fix:
- ❌ `static/discussion.html` - Has ~100 lines of duplicate CSS
- ❌ `static/orchestrator.html` - Has ~150 lines of duplicate CSS  
- ❌ `static/verbalized_sampling.html` - Has duplicate CSS

### Expected Result:

```html
<link rel="stylesheet" href="/static/common-styles.css">
<style>
  /* ONLY page-specific styles here */
  :root {
    --tool-reasoning: #8B5CF6;  /* Unique to AutoGen */
  }
  
  .turn-card { /* Unique component */ }
  .orchestrator-bar { /* Unique component */ }
</style>
```

## Sizes from Arena (Main Page)

All pages should match these exact dimensions:

### Header
- Padding: `16px 20px`
- Background: `linear-gradient(135deg, #1e3a5f 0%, #2c4f7c 100%)`

### Logo
- Icon: `32x32px`, padding `6px`, border-radius `8px`
- Title: `18px`, font-weight `700`, letter-spacing `-0.02em`
- Subtitle: `11px`, opacity `0.85`
- Gap: `12px`

### Mode Links
- Padding: `8px 16px`
- Font-size: `14px`
- Font-weight: `500` (normal), `600` (active)
- Border-radius: `6px`
- Gap: `8px`

### Icon Button
- Size: `36x36px`
- Border-radius: `8px`

## Action Items

1. [ ] Clean Discussion page CSS
2. [ ] Clean AutoGen page CSS
3. [ ] Clean Diversity page CSS
4. [ ] Test all pages have identical header dimensions
5. [ ] Verify no visual regressions

## Testing Checklist

After fixes:
- [ ] All headers same height
- [ ] All logos same size
- [ ] All mode links same size
- [ ] All spacing identical
- [ ] Page-specific features still work
- [ ] Dark mode works
- [ ] Responsive layout works

