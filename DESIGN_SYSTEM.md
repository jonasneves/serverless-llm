# LLM Arena - Unified Design System

## Overview

All 4 modes (Arena, Discussion, AutoGen, Diversity) now share a **unified design system** for consistent look and feel across the platform.

---

## 🎨 Design Tokens

### Colors

**Background**
- `--bg-primary`: Main background (#ffffff / #0a0e14 dark)
- `--bg-secondary`: Card backgrounds (#FAFAFA / #12161e dark)
- `--bg-tertiary`: Subtle backgrounds (#F3F4F6 / #1a1f2b dark)

**Text**
- `--text-primary`: Main text (#111827 / #e4e7eb dark)
- `--text-secondary`: Secondary text (#6B7280 / #9ca3af dark)
- `--text-tertiary`: Tertiary text (#9CA3AF / #6b7280 dark)

**Accent**
- `--accent-color`: Primary brand color (#1e3a5f)
- `--accent-hover`: Hover state (#2c4f7c)
- `--accent-text`: Text on accent (#ffffff)

**Status**
- `--danger-color`: Errors, warnings (#DC2626)
- `--warning-color`: Warnings (#D97706)
- `--success-color`: Success states (#059669)
- `--info-color`: Information (#0284C7)

**Mode-specific**
- `--direct-color`: Direct prompting (#EF4444)
- `--vs-color`: Verbalized sampling (#10B981)
- `--tool-color`: Tools/utilities (#8B5CF6)

---

### Spacing

- `--spacing-xs`: 4px
- `--spacing-sm`: 8px
- `--spacing-md`: 16px
- `--spacing-lg`: 24px
- `--spacing-xl`: 32px

---

### Border Radius

- `--radius-sm`: 6px (buttons, inputs)
- `--radius-md`: 8px (cards)
- `--radius-lg`: 12px (large cards)
- `--radius-full`: 9999px (pills, badges)

---

### Shadows

- `--shadow-sm`: Subtle shadow for cards
- `--shadow-md`: Medium shadow for elevated elements
- `--shadow-lg`: Large shadow for modals/popovers

---

### Typography

- `--font-sans`: System font stack
- `--font-mono`: Monospace font for code

---

## 🧩 Components

### Header
Consistent across all modes:
- Gradient background (accent-color → accent-hover)
- Logo with icon + title + subtitle
- Navigation modes
- Icon buttons (theme toggle, etc.)

### Buttons

**Primary Button (`.btn-primary`)**
```css
padding: 12px 32px
background: gradient(accent-color → accent-hover)
color: white
border-radius: 8px
```

**Secondary Button (`.btn-secondary`)**
```css
background: bg-secondary
border: 1px solid border-color
color: text-primary
```

### Cards

**Standard Card (`.card`)**
```css
background: bg-secondary
border: 1px solid border-color
border-radius: 12px
padding: 24px
box-shadow: shadow-sm
```

### Input Fields
All inputs styled consistently:
- Border: 1px solid border-color
- Border-radius: 8px
- Padding: 12px
- Focus: Blue ring

### Badges

**Status Badges**
- `.badge-success`: Green
- `.badge-warning`: Orange
- `.badge-danger`: Red
- `.badge-info`: Blue

---

## 🌗 Dark Mode Support

All design tokens have dark mode variants.

Toggle with:
```javascript
document.body.setAttribute('data-theme', 'dark');
```

---

## 📱 Responsive Design

**Mobile-first approach**

Breakpoint: `@media (max-width: 768px)`
- Smaller header padding
- Hide logo subtitle
- Compact navigation
- Stacked layouts

---

## 🎯 Usage

### In HTML Files

```html
<head>
  <link rel="stylesheet" href="/static/common-styles.css">
</head>
```

### Page-specific Styles

Each page keeps unique styles in its own `<style>` block:

```html
<link rel="stylesheet" href="/static/common-styles.css">
<style>
  /* Page-specific styles here */
  .my-special-component { }
</style>
```

---

## 🔧 Utility Classes

**Text Alignment**
- `.text-center`, `.text-left`, `.text-right`

**Margins**
- `.mt-sm`, `.mt-md`, `.mt-lg` (top)
- `.mb-sm`, `.mb-md`, `.mb-lg` (bottom)

**Flexbox**
- `.flex`, `.flex-col`
- `.items-center`, `.justify-center`
- `.gap-sm`, `.gap-md`, `.gap-lg`

---

## 📊 Consistency Across Modes

### Arena (`/`)
- Side-by-side model comparison
- Uses: header, buttons, cards, input fields

### Discussion (`/discussion`)
- Multi-model roundtable
- Uses: header, message bubbles, streaming indicators

### AutoGen (`/autogen`)
- Multi-agent orchestration
- Uses: header, tool badges, orchestration timeline

### Diversity (`/diversity`)
- Verbalized Sampling comparison
- Uses: header, comparison grid, response cards

---

## 🎨 Visual Consistency Checklist

✅ **All pages share:**
- Same header gradient
- Same navigation style
- Same button styling
- Same card designs
- Same input fields
- Same badge system
- Same loading spinners
- Same empty states
- Same color palette
- Same typography
- Same spacing system
- Same dark mode support

---

## 🚀 Benefits

1. **Consistent UX** - Users feel at home across all modes
2. **Easier Maintenance** - Change once, apply everywhere
3. **Faster Development** - Reuse components
4. **Smaller CSS** - No duplication
5. **Better Performance** - Shared stylesheet cached
6. **Accessibility** - Consistent focus states, contrast
7. **Professional Look** - Polished, cohesive design

---

## 📝 Implementation Details

### File Structure
```
app/chat-interface/
├── static/
│   ├── common-styles.css       ← Shared design system
│   ├── discussion.html          ← Links to common-styles
│   ├── orchestrator.html        ← Links to common-styles
│   └── verbalized_sampling.html ← Links to common-styles
└── chat_server.py               ← Arena (inline HTML)
```

### Loading Order
1. Common styles loaded first (base styles)
2. Page-specific styles override/extend
3. JavaScript can add dynamic styles

---

## 🎯 Design Principles

1. **Minimalism** - Clean, uncluttered interfaces
2. **Consistency** - Same patterns repeated
3. **Accessibility** - High contrast, keyboard navigation
4. **Performance** - Lightweight, fast loading
5. **Responsiveness** - Works on all screen sizes
6. **Modern** - Contemporary design language

---

## 📦 Components Included

- Header with navigation
- Logo system
- Button variants
- Card components
- Form inputs
- Badges
- Loading spinners
- Empty states
- Scrollbar styling
- Utility classes

---

## 🔮 Future Enhancements

Potential additions to the design system:
- Modal/dialog component
- Toast notifications
- Dropdown menus
- Tabs component
- Progress bars
- Tooltips
- Skeleton loaders

---

Your LLM Arena now has a **cohesive, professional design** across all modes! 🎨✨

