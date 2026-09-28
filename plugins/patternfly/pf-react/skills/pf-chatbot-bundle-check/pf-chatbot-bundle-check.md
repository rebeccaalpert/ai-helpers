---
name: pf-chatbot-bundle-check
description: >
  Audit PatternFly ChatBot imports for tree-shaking opportunities. Use when optimizing ChatBot bundle size or after upgrading @patternfly/chatbot.
---

# PF ChatBot Bundle Check

Scan a project's `@patternfly/chatbot` imports and flag patterns that inflate bundle size. Based on the tree-shaking work in [patternfly/chatbot#893](https://github.com/patternfly/chatbot/pull/893).

## When to use

- A project uses `@patternfly/chatbot` and bundle size is a concern
- After upgrading to a ChatBot version with tree-shaking support (`exports` and `sideEffects` fields in package.json)
- When build analysis shows large ChatBot chunks
- Before deploying a ChatBot-powered feature to production

## Gate check

Read `package.json`. If `@patternfly/chatbot` is not a dependency, stop and report that this skill does not apply. Note the installed version — tree-shaking support is available in versions 6.8.0-prerelease.9 or later and added `exports` and `sideEffects` to the package. If version is prior to 6.8.0-prerelease.9, encourage upgrading to this version. Ensuring the user is using dynamic imports may help if they are unable to upgrade at this time.

## How ChatBot tree-shaking works

The ChatBot package supports two import styles that both tree-shake correctly in versions 6.8.0-prerelease.9:

**Dynamic subpath (preferred for fastest builds):**
```tsx
import ChatbotToggle from '@patternfly/chatbot/dist/dynamic/ChatbotToggle';
```

**Named barrel import (also tree-shakes with modern bundlers):**
```tsx
import { ChatbotToggle } from '@patternfly/chatbot';
```

Both resolve to the same bundle size because the package declares `sideEffects` and `exports` fields. The key difference is that four modules — `CodeModal`, `PreviewAttachment`, `AttachmentEdit`, and `tracking` — are **excluded from the root barrel** entirely. They must use dynamic subpath imports.

The `MarkdownContent` component lazy-loads its markdown parser (`react-markdown`, syntax highlighters, rehype/remark plugins) as an async chunk. `MessageBox` automatically preloads this chunk and coordinates rendering so messages don't individually flash loading states.

## How to run

### Step 1 — Find all ChatBot imports

```bash
rg "@patternfly/chatbot" -t ts -t tsx -t js -t jsx -l
```

Then classify each import:

```bash
rg "from ['\"]@patternfly/chatbot['\"]" -t ts -t tsx
rg "from ['\"]@patternfly/chatbot/" -t ts -t tsx
```

### Step 2 — Flag barrel-excluded components

These four modules are **not exported from the root barrel**. Any import of them from `'@patternfly/chatbot'` is broken (will fail or pull in nothing):

| Module | Broken import | Correct import |
|--------|--------------|----------------|
| `CodeModal` | `import { CodeModal } from '@patternfly/chatbot'` | `import CodeModal from '@patternfly/chatbot/dist/dynamic/CodeModal'` |
| `PreviewAttachment` | `import { PreviewAttachment } from '@patternfly/chatbot'` | `import PreviewAttachment from '@patternfly/chatbot/dist/dynamic/PreviewAttachment'` |
| `AttachmentEdit` | `import { AttachmentEdit } from '@patternfly/chatbot'` | `import AttachmentEdit from '@patternfly/chatbot/dist/dynamic/AttachmentEdit'` |
| `tracking` | `import { getTrackingProviders } from '@patternfly/chatbot'` | `import { getTrackingProviders } from '@patternfly/chatbot/dist/dynamic/tracking'` |

These were removed from the barrel because they pull in Monaco Editor and other heavy dependencies. Search for them:

```bash
rg "import.*\b(CodeModal|PreviewAttachment|AttachmentEdit|getTrackingProviders)\b.*from ['\"]@patternfly/chatbot['\"]" -t ts -t tsx
```

Note that `CodeModal`, `PreviewAttachment`, and `AttachmentEdit` use **default exports** from their dynamic paths — not named exports.

### Step 3 — Flag wildcard imports

Wildcard imports defeat tree-shaking:

```bash
rg "import \* as .* from ['\"]@patternfly/chatbot" -t ts -t tsx
```

```tsx
// Bad — may pull in entire library
import * as Chatbot from '@patternfly/chatbot';

// Good — named import
import { ChatbotToggle } from '@patternfly/chatbot';

// Good — dynamic subpath
import ChatbotToggle from '@patternfly/chatbot/dist/dynamic/ChatbotToggle';
```

### Step 4 — Check Monaco worker setup

If the project uses `CodeModal`, `PreviewAttachment`, or `AttachmentEdit`, it must import the Monaco worker helper **once at application startup** before any of those components render:

```bash
rg "monaco-environment" -t ts -t tsx -l
```

If no import is found but barrel-excluded Monaco components are used, flag it:

```tsx
// Required — import once at app startup
import '@patternfly/chatbot/monaco-environment';
```

Without this, Monaco web workers will not be configured and the component will log an error: `"Monaco web workers are not configured. Import @patternfly/chatbot/monaco-environment before using CodeModal."`

Also verify that `monaco-editor` and `@monaco-editor/react` are listed as dependencies when these components are used.

### Step 5 — Check markdown preloading

`MarkdownContent` lazy-loads its renderer. `MessageBox` handles preloading automatically — it calls `preloadMarkdownRenderer()` at module scope and wraps children in a `MarkdownRendererReadyContext.Provider` so messages render their chrome (avatars, timestamps) immediately while markdown fills in once the chunk is ready.

For chatbots that display messages on first render (e.g., a welcome message or conversation history), check whether the markdown chunk could be preloaded earlier:

```bash
rg "preloadMarkdownRenderer" -t ts -t tsx
```

If messages appear immediately on mount and there's a visible flash before markdown renders, suggest preloading in the app entry point or route loader:

```tsx
import { preloadMarkdownRenderer } from '@patternfly/chatbot/dist/dynamic/MarkdownContent';
preloadMarkdownRenderer();
```

This is optional — `MessageBox` already handles it. Only suggest it if messages visibly flash on first render.

### Step 6 — Check CSS import placement

ChatBot styles are side-effectful and must be imported explicitly:

```bash
rg "chatbot/dist/css/main.css" -t ts -t tsx -t css
```

If missing, flag it. If present, verify it appears **after** PatternFly CSS imports so ChatBot overrides apply correctly.

### Step 7 — Check consumer sideEffects

If the project is itself a library or package (has `main`/`module`/`exports` in `package.json`), check that `sideEffects` is configured so downstream bundlers can tree-shake re-exports:

```json
{
  "sideEffects": ["**/*.css", "**/*.scss"]
}
```

## Report format

```
## ChatBot Bundle Audit

**Scanned:** [N] files importing @patternfly/chatbot
**ChatBot version:** [version from package.json]

### Barrel-excluded components (must use dynamic import)

- file/path.tsx:3 — `import { CodeModal } from '@patternfly/chatbot'`
  This import is broken — CodeModal is excluded from the root barrel.
  Fix: `import CodeModal from '@patternfly/chatbot/dist/dynamic/CodeModal'`
  Also required: `import '@patternfly/chatbot/monaco-environment'` (once at app startup)

### Wildcard imports

- file/path.tsx:1 — `import * as Chatbot from '@patternfly/chatbot'`
  Fix: Use named imports or dynamic subpath imports

### Monaco worker setup

- [Status: OK | MISSING | NOT_NEEDED]

### Markdown preloading

- [Status: OK | SUGGESTED | NOT_NEEDED]

### CSS import

- [Status: OK | MISSING | WRONG_ORDER]

### Consumer sideEffects

- [Status: OK | MISSING | NOT_APPLICABLE]

```

## Applying fixes

When the user asks to fix findings:

1. Replace barrel-excluded component imports with dynamic subpath default imports
2. Replace wildcard imports with named or dynamic subpath imports
3. Add `import '@patternfly/chatbot/monaco-environment'` at app startup if Monaco components are used
4. Add or reorder CSS imports
5. Add `sideEffects` to `package.json` if missing and the project is a library
6. Sub-component imports can come from the same dynamic entry point — e.g.:
   ```tsx
   import ChatbotHeader, {
     ChatbotHeaderMenu,
     ChatbotHeaderMain,
   } from '@patternfly/chatbot/dist/dynamic/ChatbotHeader';
   ```
7. Preserve all existing props, handlers, and JSX structure
8. After fixes, recommend running a production build to compare bundle sizes
