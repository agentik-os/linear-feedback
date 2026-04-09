---
name: linear-setup
description: >
  Complete Linear feedback system setup wizard. Installs a feedback widget with element targeting,
  screenshots, console error capture, and AI description improvement — all backed by Linear.
  Works with any Next.js project using shadcn/ui. Supports Clerk, NextAuth, Better Auth, or no auth.
  Use when user says "/linear-setup", "setup linear", "add feedback system", or "install Linear widget".
---

# /linear-setup — Linear Feedback System for Next.js

> Install a complete user feedback loop: widget with element targeting + screenshots + AI improve,
> API routes, public feedback button, Linear labels, and MCP integration.

## Phase 0: Project Analysis

Before anything, analyze the current project:

```bash
# Stack detection
cat package.json | grep -E '"(next|clerk|@clerk|@auth|better-auth|stripe|convex|supabase|prisma|drizzle)"'

# Auth provider
ls lib/auth* 2>/dev/null; ls app/api/auth* 2>/dev/null
grep -r "ClerkProvider\|SessionProvider\|AuthProvider" app/layout.tsx src/app/layout.tsx 2>/dev/null

# UI library
ls components/ui/dialog.tsx 2>/dev/null && echo "shadcn/ui detected"

# Existing Linear setup
grep -r "LINEAR_API_KEY\|linear" .env.local .mcp.json 2>/dev/null

# Sonner (toast library)
grep -q '"sonner"' package.json && echo "sonner detected" || echo "sonner NOT found"

# Source directory structure
ls src/app 2>/dev/null && echo "src/ prefix" || echo "No src/ prefix"
```

Determine: Auth provider (Clerk/NextAuth/Better Auth/none), UI framework, source prefix.

---

## Phase 1: Dependencies

```bash
# Core dependencies (use npm/pnpm/yarn depending on project)
bun add @linear/sdk html2canvas-pro @anthropic-ai/sdk sonner

# Verify Toaster in layout
grep -r "Toaster" app/layout.tsx src/app/layout.tsx 2>/dev/null || echo "WARNING: Add <Toaster /> to root layout"
```

If `<Toaster />` is missing from root layout, add it:
```tsx
import { Toaster } from "sonner"
// Inside body:
<Toaster position="bottom-right" />
```

---

## Phase 2: Linear API Key & Team Setup

### Step 1: Get Linear API Key

Check `.env.local` first:
```bash
grep 'LINEAR_API_KEY' .env.local 2>/dev/null
```

If not found, ask the user:
> I need a Linear API key to connect your feedback system.
> 1. Go to **https://linear.app/settings/api**
> 2. Create a **Personal API key** with full access
> 3. Paste it here

Write immediately to `.env.local`:
```bash
echo "" >> .env.local
echo "# Linear Feedback System" >> .env.local
echo "LINEAR_API_KEY=THE_TOKEN" >> .env.local
```

### Step 2: Verify API Key

```bash
LINEAR_KEY=$(grep '^LINEAR_API_KEY=' .env.local | tail -1 | cut -d= -f2-)

curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_KEY" \
  -d '{"query":"{ viewer { id name email } teams { nodes { id name key } } }"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'errors' in d:
    print('ERROR: ' + str(d['errors']))
    sys.exit(1)
viewer = d['data']['viewer']
print(f'Connected as: {viewer[\"name\"]} ({viewer[\"email\"]})')
teams = d['data']['teams']['nodes']
print(f'Teams ({len(teams)}):')
for t in teams:
    print(f'  {t[\"key\"]} - {t[\"name\"]} (ID: {t[\"id\"]})')
"
```

If this fails: token is invalid. Ask user to regenerate.
If successful: ask which team to use.

### Step 3: Create Labels

Required labels (create only if missing):
| Label | Color | Purpose |
|-------|-------|---------|
| `Source: User Feedback` | `#4EA7FC` | Authenticated user feedback |
| `Source: Public Feedback` | `#10B981` | Public visitor feedback |
| `Bug` | `#EF4444` | Bug reports |
| `Feature` | `#8B5CF6` | Feature requests |
| `Improvement` | `#F59E0B` | Improvement suggestions |

### Step 4: Save Config

```bash
echo "LINEAR_TEAM_ID=$TEAM_ID" >> .env.local
echo "LINEAR_PROJECT_ID=$PROJECT_ID" >> .env.local
```

---

## Phase 3: Install Components

The template files are available in this repo's `templates/` directory. Clone or download from:
**https://github.com/agentik-os/linear-feedback/tree/main/templates**

### Files to install:

| Template | Install to | Purpose |
|----------|-----------|---------|
| `feedback-widget.tsx` | `components/dashboard/feedback-widget.tsx` | Dashboard widget (auth users) |
| `public-feedback-button.tsx` | `components/shared/public-feedback-button.tsx` | Public floating button |
| `feedback-route.ts` | `app/api/feedback/route.ts` | Auth feedback API |
| `feedback-improve-route.ts` | `app/api/feedback/improve/route.ts` | AI improve API |
| `feedback-public-route.ts` | `app/api/feedback/public/route.ts` | Public feedback API |

**Adapt paths if project uses `src/`** (e.g., `src/app/api/feedback/route.ts`).

### Auth Adapter (CRITICAL)

The `feedback-route.ts` has a `getUser()` function that must be replaced with your auth provider:

**Clerk:**
```typescript
import { auth, currentUser } from "@clerk/nextjs/server"
async function getUser() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await currentUser()
  return { id: userId, name: user?.fullName || "Unknown", email: user?.emailAddresses?.[0]?.emailAddress || "" }
}
```

**NextAuth:**
```typescript
import { getServerSession } from "next-auth"
async function getUser() {
  const session = await getServerSession()
  if (!session?.user) return null
  return { id: session.user.id!, name: session.user.name || "Unknown", email: session.user.email || "" }
}
```

### Add to Layouts

**Dashboard (authenticated pages):**
```tsx
import { FeedbackWidget } from "@/components/dashboard/feedback-widget"
// In header actions:
<FeedbackWidget />
```

**Marketing (public pages — optional):**
```tsx
import { PublicFeedbackButton } from "@/components/shared/public-feedback-button"
// At bottom of layout body:
<PublicFeedbackButton />
```

---

## Phase 4: MCP Configuration

Add Linear MCP server to `.mcp.json`:
```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/linear-mcp-server"],
      "env": {
        "LINEAR_API_KEY": "<key from .env.local>"
      }
    }
  }
}
```

Ensure `.mcp.json` is gitignored:
```bash
grep -q '.mcp.json' .gitignore 2>/dev/null || echo '.mcp.json' >> .gitignore
```

---

## Phase 5: Verification

```bash
echo "=== Files ==="
for f in "components/dashboard/feedback-widget.tsx" "app/api/feedback/route.ts" "app/api/feedback/improve/route.ts"; do
  if [ -f "$f" ] || [ -f "src/$f" ]; then echo "OK: $f"; else echo "MISSING: $f"; fi
done

echo "=== Env vars ==="
for var in LINEAR_API_KEY LINEAR_TEAM_ID; do
  grep -q "^${var}=" .env.local && echo "OK: $var" || echo "MISSING: $var"
done

echo "=== Dependencies ==="
for pkg in "@linear/sdk" "html2canvas-pro" "@anthropic-ai/sdk" "sonner"; do
  grep -q "\"$pkg\"" package.json && echo "OK: $pkg" || echo "MISSING: $pkg"
done

echo "=== Build ==="
npm run build 2>&1 | tail -5
```

---

## Features Installed

- **Element targeting:** Click Feedback -> crosshair mode -> select element -> dialog
- **Dual screenshots:** Global (JPEG 0.6, max 1MB) + Element (JPEG 0.7, max 500KB)
- **Console errors:** Last 10 captured automatically
- **User Agent + Page URL:** Sent with every submission
- **AI improve:** "Improve with AI" button + auto-improve on submit
- **Collapsible sections:** Targeted element + page screenshot
- **Fullscreen image preview**
- **Honeypot anti-spam** (public route)
- **IP rate limiting** (public route, 5/min)
- **Toast feedback** via Sonner

---

## Workflow

```
User clicks Feedback -> Targets element -> Writes description -> AI improves it
  -> Submits -> Linear issue created with screenshots as comments
  -> Labels auto-applied -> Team gets notified
```
