// Linear Feedback API Route — Authenticated Users
// Place in: app/api/feedback/route.ts
//
// AUTH ADAPTER: This file uses a generic getUser() function.
// Replace with your auth provider (Clerk, Better Auth, NextAuth, etc.)
// See comments marked with "AUTH:" for what to change.

import { NextRequest, NextResponse } from "next/server"
import { LinearClient } from "@linear/sdk"

// ─── AUTH: Replace this with your auth provider ───────────────────
// Example for Clerk:
//   import { auth, currentUser } from "@clerk/nextjs/server"
//   async function getUser() {
//     const { userId } = await auth()
//     if (!userId) return null
//     const user = await currentUser()
//     return { id: userId, name: user?.fullName || "Unknown", email: user?.emailAddresses?.[0]?.emailAddress || "" }
//   }
//
// Example for NextAuth:
//   import { getServerSession } from "next-auth"
//   async function getUser() {
//     const session = await getServerSession()
//     if (!session?.user) return null
//     return { id: session.user.id, name: session.user.name || "Unknown", email: session.user.email || "" }
//   }

async function getUser(): Promise<{ id: string; name: string; email: string } | null> {
  // AUTH: Replace this placeholder with your actual auth check
  // For now, returns null (will 401). You MUST implement this.
  return null
}
// ─── End AUTH section ─────────────────────────────────────────────

function getLinear() {
  const apiKey = process.env.LINEAR_API_KEY?.trim()
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured")
  return new LinearClient({ apiKey })
}

const priorityMap: Record<string, number> = {
  bug: 2, feature: 3, improvement: 3, question: 4,
}

const emojiMap: Record<string, string> = {
  bug: "BUG", feature: "IDEA", improvement: "UP", question: "?",
}

const typeLabelMap: Record<string, { name: string; color: string }> = {
  bug: { name: "Bug", color: "#EF4444" },
  feature: { name: "Feature", color: "#8B5CF6" },
  improvement: { name: "Improvement", color: "#F59E0B" },
  question: { name: "Bug", color: "#EF4444" },
}

async function findOrCreateLabel(
  linear: LinearClient, teamId: string, labelName: string, color?: string
): Promise<string> {
  const allLabels = await linear.issueLabels({ first: 250, filter: { name: { eq: labelName } } })
  const existing = allLabels.nodes.find((l) => l.name === labelName)
  if (existing) return existing.id

  const created = await linear.createIssueLabel({ name: labelName, color: color || "#6B7280", teamId })
  const label = await created.issueLabel
  if (!label) throw new Error(`Failed to create label: ${labelName}`)
  return label.id
}

async function uploadToLinear(
  linear: LinearClient, base64DataUrl: string, filename: string
): Promise<string | null> {
  try {
    const base64Data = base64DataUrl.split(",")[1]
    if (!base64Data || base64Data.length > 2_000_000) return null

    const mimeMatch = base64DataUrl.match(/^data:(image\/\w+);base64,/)
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const buffer = Buffer.from(base64Data, "base64")

    const uploadPayload = await linear.fileUpload(mimeType, filename, buffer.length)
    const uploadData = await uploadPayload.uploadFile
    if (!uploadData?.uploadUrl || !uploadData?.assetUrl) return null

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000",
    }
    if (uploadData.headers) {
      for (const { key, value } of uploadData.headers) {
        headers[key] = value
      }
    }

    const res = await fetch(uploadData.uploadUrl, { method: "PUT", headers, body: buffer })
    return res.ok ? uploadData.assetUrl : null
  } catch (error) {
    console.error("Screenshot upload failed:", error)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const {
      type = "bug",
      description,
      improvedDescription,
      screenshot,
      pageUrl,
      userAgent,
      consoleLogs,
      targetedElement,
    } = body as {
      type?: string; description?: string; improvedDescription?: string
      screenshot?: string; pageUrl?: string; userAgent?: string
      consoleLogs?: string[]; targetedElement?: { selector: string; tagName: string; text: string; screenshot?: string }
    }

    if (!description || typeof description !== "string" || description.trim().length < 3) {
      return NextResponse.json({ error: "Description required (min 3 chars)" }, { status: 400 })
    }

    const linear = getLinear()
    const teamId = process.env.LINEAR_TEAM_ID?.trim()
    if (!teamId) return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    const projectId = process.env.LINEAR_PROJECT_ID?.trim()

    const title = `[${emojiMap[type as string] || "?"}] ${description.slice(0, 80)}${description.length > 80 ? "..." : ""}`

    let issueBody = `## Description (original)\n\n${description}\n\n`
    if (improvedDescription) issueBody += `---\n\n## Description (AI-improved)\n\n${improvedDescription}\n\n`
    issueBody += `---\n\n## Context\n\n`
    issueBody += `- **User:** ${user.name} (${user.email})\n`
    issueBody += `- **URL:** ${pageUrl || "N/A"}\n`
    issueBody += `- **User Agent:** ${userAgent || "N/A"}\n`

    if (targetedElement) {
      issueBody += `\n## Targeted Element\n\n`
      issueBody += `- **Selector:** \`${targetedElement.selector}\`\n`
      issueBody += `- **Tag:** \`${targetedElement.tagName}\`\n`
      issueBody += `- **Text:** "${targetedElement.text}"\n`
    }

    if (consoleLogs?.length) {
      issueBody += `\n## Console Errors\n\n\`\`\`\n${consoleLogs.join("\n")}\n\`\`\`\n`
    }

    const labelIds: string[] = []
    try {
      const sourceLabel = await findOrCreateLabel(linear, teamId, "Source: User Feedback", "#4EA7FC")
      labelIds.push(sourceLabel)
      const typeInfo = typeLabelMap[type as string] || typeLabelMap.bug
      const typeLabel = await findOrCreateLabel(linear, teamId, typeInfo.name, typeInfo.color)
      labelIds.push(typeLabel)
    } catch (labelErr) {
      console.error("[Feedback API] Label creation failed:", labelErr)
    }

    const issuePayload = await linear.createIssue({
      teamId, title, description: issueBody,
      priority: priorityMap[type as string] || 3,
      ...(labelIds.length > 0 ? { labelIds } : {}),
      ...(projectId ? { projectId } : {}),
    })

    const issue = await issuePayload.issue
    if (!issue) return NextResponse.json({ error: "Failed to create issue" }, { status: 500 })

    // Upload screenshots as comments (non-blocking)
    try {
      if (screenshot && screenshot.startsWith("data:image/")) {
        const url = await uploadToLinear(linear, screenshot, `feedback-screenshot-${issue.identifier}.jpeg`)
        if (url) await linear.createComment({ issueId: issue.id, body: `### Screenshot\n\n![Screenshot](${url})` })
      }
      if (targetedElement?.screenshot && targetedElement.screenshot.startsWith("data:image/")) {
        const url = await uploadToLinear(linear, targetedElement.screenshot, `feedback-element-${issue.identifier}.jpeg`)
        if (url) await linear.createComment({ issueId: issue.id, body: `### Targeted Element Screenshot\n\n**Selector:** \`${targetedElement.selector}\`\n\n![Element Screenshot](${url})` })
      }
    } catch (uploadErr) {
      console.error("[Feedback API] Screenshot upload failed:", uploadErr)
    }

    return NextResponse.json({ success: true, issueId: issue.id, identifier: issue.identifier })
  } catch (error) {
    console.error("[Feedback API] Error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
