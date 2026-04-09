# Linear Feedback for Claude Code

A complete user feedback system powered by [Linear](https://linear.app), installed by [Claude Code](https://claude.ai/code) in one command. Works with any Next.js project using shadcn/ui.

## What it does

When you run `/linear-setup` in Claude Code, it installs:

1. **Feedback Widget** (dashboard) — Element targeting with crosshair mode, dual screenshots (page + element), console error capture, AI-powered description improvement
2. **Public Feedback Button** (marketing pages) — Floating pill button with honeypot spam protection and IP rate limiting
3. **API Routes** — Authenticated + public endpoints that create Linear issues with uploaded screenshots
4. **AI Improve** — Uses Claude to rewrite user feedback into clear, actionable descriptions
5. **Linear Labels** — Auto-creates Bug, Feature, Improvement labels with source tracking
6. **MCP Integration** — Configures Linear MCP server for Claude Code to read/manage tickets

## Quick Install

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/agentik-os/linear-feedback/main/install.sh | bash
```

Or manually:

```bash
# Copy the command to your Claude Code commands directory
mkdir -p ~/.claude/commands
curl -fsSL https://raw.githubusercontent.com/agentik-os/linear-feedback/main/commands/linear-setup.md \
  -o ~/.claude/commands/linear-setup.md
```

Then in Claude Code, inside your Next.js project:

```
/linear-setup
```

Claude will:
1. Ask for your **Linear API key** (get one at [linear.app/settings/api](https://linear.app/settings/api))
2. Detect your stack (Clerk, NextAuth, Better Auth, or no auth)
3. Install all components, routes, and configure everything
4. Run a build to verify it works

## Prerequisites

- **Next.js** project (App Router)
- **shadcn/ui** installed (for Dialog, Button, Textarea, Badge components)
- **Linear** account with API access
- **Claude Code** CLI or IDE extension

### Optional

- **Clerk / NextAuth / Better Auth** — for authenticated feedback
- **Anthropic API key** — for the "Improve with AI" feature (uses Claude Haiku)

## What gets installed

```
your-project/
  components/
    dashboard/
      feedback-widget.tsx        # Dashboard feedback widget
    shared/
      public-feedback-button.tsx # Public floating button (optional)
  app/
    api/
      feedback/
        route.ts                 # Authenticated feedback API
        improve/
          route.ts               # AI description improvement
        public/
          route.ts               # Public feedback API (optional)
```

### Environment variables

Added to `.env.local`:

```bash
LINEAR_API_KEY=lin_api_...    # Your Linear API key
LINEAR_TEAM_ID=...            # Auto-detected during setup
LINEAR_PROJECT_ID=...         # Auto-created "User Feedback" project
```

## Features

### Element Targeting
Click the Feedback button to enter crosshair mode. Hover over any element on the page — it highlights with a blue border showing the HTML tag. Click to select it. The element's CSS selector, tag name, text content, and a screenshot are captured automatically.

Press **Escape** to skip targeting and send general feedback. Press **Alt** as a shortcut to start targeting.

### Dual Screenshots
- **Global screenshot**: JPEG, 0.6 quality, max 1200px, max 1MB — captures the full visible page
- **Element screenshot**: JPEG, 0.7 quality, max 800px, max 500KB — captures just the targeted element

Both are uploaded to Linear as separate comments on the issue (not embedded in the description).

### AI Improve
Every feedback submission includes an "Improve with AI" button that rewrites the user's description into a clear, structured report. If the user doesn't click it, the description is auto-improved on submit. Uses Claude Haiku for speed and cost efficiency.

### Console Error Capture
Intercepts `console.error` and keeps the last 10 errors in a circular buffer. These are automatically attached to every feedback submission, helping developers reproduce issues.

### Spam Protection (Public)
- **Honeypot field**: Hidden input that only bots fill — returns fake success
- **IP rate limiting**: 5 submissions per minute per IP address

### Linear Integration
Each submission creates a Linear issue with:
- Title: `[BUG] Description...` or `[IDEA] Description...`
- Labels: `Source: User Feedback` + type label (Bug/Feature/Improvement)
- Priority: Bugs = Urgent, Features/Improvements = Medium, Questions = Low
- Screenshots as separate comments (global + element)
- Full context: page URL, user agent, CSS selector, console errors

## Auth Adapters

The feedback API route includes a `getUser()` function that you need to adapt to your auth provider. Claude Code handles this automatically during `/linear-setup`, but here's the manual reference:

### Clerk
```typescript
import { auth, currentUser } from "@clerk/nextjs/server"
async function getUser() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await currentUser()
  return { id: userId, name: user?.fullName || "Unknown", email: user?.emailAddresses?.[0]?.emailAddress || "" }
}
```

### NextAuth
```typescript
import { getServerSession } from "next-auth"
async function getUser() {
  const session = await getServerSession()
  if (!session?.user) return null
  return { id: session.user.id!, name: session.user.name || "Unknown", email: session.user.email || "" }
}
```

### Better Auth
```typescript
import { auth } from "@/lib/auth"
async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return { id: session.user.id, name: session.user.name || "Unknown", email: session.user.email || "" }
}
```

## Templates

All source code is in the [`templates/`](./templates) directory:

| File | Description |
|------|-------------|
| `feedback-widget.tsx` | Dashboard feedback widget with element targeting |
| `public-feedback-button.tsx` | Public floating feedback button |
| `feedback-route.ts` | Authenticated feedback API route |
| `feedback-improve-route.ts` | AI description improvement route |
| `feedback-public-route.ts` | Public (unauthenticated) feedback route |

## Workflow

```
User clicks "Feedback"
  -> Crosshair targeting mode
  -> Click element (or Escape to skip)
  -> Screenshot captured (page + element)
  -> Dialog opens with type selector + description
  -> "Improve with AI" rewrites description
  -> Submit creates Linear issue
  -> Screenshots uploaded as comments
  -> Labels auto-applied
  -> Team notified in Linear
```

## FAQ

**Q: Does it work with Pages Router?**
A: No, App Router only. The API routes use Next.js route handlers (`route.ts`).

**Q: Do I need shadcn/ui?**
A: Yes, the widget uses Dialog, Button, Textarea, and Badge components from shadcn/ui. Run `npx shadcn@latest add dialog button textarea badge` if missing.

**Q: Can I customize the widget appearance?**
A: Yes, it uses Tailwind CSS classes and shadcn/ui theming. Modify the component directly.

**Q: What about i18n?**
A: The templates use hardcoded English strings. For internationalization, replace the string literals with your i18n library (next-intl, react-i18next, etc.).

## Built by

[Agentik OS](https://agentik-os.com) — AI-powered development infrastructure.

## License

MIT
