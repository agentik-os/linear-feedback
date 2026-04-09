// Linear Feedback API Route — Public (Unauthenticated Visitors)
// Place in: app/api/feedback/public/route.ts
//
// No auth required. Includes:
//   - IP-based rate limiting (5/min)
//   - Honeypot spam protection
//   - "Source: Public Feedback" label

import { NextRequest, NextResponse } from "next/server"
import { LinearClient } from "@linear/sdk"

function getLinear() {
  const apiKey = process.env.LINEAR_API_KEY
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured")
  return new LinearClient({ apiKey })
}

// In-memory rate limiting (per-process only — use Upstash Redis for serverless production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  // Prune stale entries when map gets large
  if (rateLimitMap.size > 1000) {
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key)
    }
  }
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

const priorityMap: Record<string, number> = { bug: 2, feature: 3, improvement: 3, question: 4 }
const emojiMap: Record<string, string> = { bug: "BUG", feature: "IDEA", improvement: "UP", question: "?" }
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
    const headers: Record<string, string> = { "Content-Type": mimeType, "Cache-Control": "public, max-age=31536000" }
    if (uploadData.headers) { for (const { key, value } of uploadData.headers) { headers[key] = value } }
    const res = await fetch(uploadData.uploadUrl, { method: "PUT", headers, body: buffer })
    return res.ok ? uploadData.assetUrl : null
  } catch (error) { console.error("Screenshot upload failed:", error); return null }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }

    const body = await req.json()
    const { type = "bug", description, improvedDescription, screenshot, pageUrl, userAgent, consoleLogs, targetedElement, honeypot } = body

    if (!description || typeof description !== "string" || description.trim().length < 3) {
      return NextResponse.json({ error: "Description required" }, { status: 400 })
    }

    // Honeypot: if filled, return fake success (bot detected)
    if (honeypot) return NextResponse.json({ success: true })

    const linear = getLinear()
    const teamId = process.env.LINEAR_TEAM_ID?.trim()
    if (!teamId) return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    const projectId = process.env.LINEAR_PROJECT_ID?.trim()

    const title = `[${emojiMap[type] || "?"}] ${description.slice(0, 80)}${description.length > 80 ? "..." : ""}`

    let issueBody = `## Description (original)\n\n${description}\n\n`
    if (improvedDescription) issueBody += `---\n\n## Description (AI-improved)\n\n${improvedDescription}\n\n`
    issueBody += `---\n\n## Context\n\n- **Source:** Public visitor\n- **IP:** ${ip}\n- **URL:** ${pageUrl || "N/A"}\n- **User Agent:** ${userAgent || "N/A"}\n`
    if (targetedElement) {
      issueBody += `\n## Targeted Element\n\n- **Selector:** \`${targetedElement.selector}\`\n- **Tag:** \`${targetedElement.tagName}\`\n- **Text:** "${targetedElement.text}"\n`
    }
    if (consoleLogs?.length) issueBody += `\n## Console Errors\n\n\`\`\`\n${consoleLogs.join("\n")}\n\`\`\`\n`

    const sourceLabel = await findOrCreateLabel(linear, teamId, "Source: Public Feedback", "#10B981")
    const typeInfo = typeLabelMap[type] || typeLabelMap.bug
    const typeLabel = await findOrCreateLabel(linear, teamId, typeInfo.name, typeInfo.color)

    const issuePayload = await linear.createIssue({
      teamId, title, description: issueBody,
      priority: priorityMap[type] || 3,
      labelIds: [sourceLabel, typeLabel],
      ...(projectId ? { projectId } : {}),
    })
    const issue = await issuePayload.issue
    if (!issue) return NextResponse.json({ error: "Failed to create issue" }, { status: 500 })

    // Upload screenshots
    if (screenshot && screenshot.startsWith("data:image/")) {
      const url = await uploadToLinear(linear, screenshot, `public-feedback-${issue.identifier}.jpeg`)
      if (url) await linear.createComment({ issueId: issue.id, body: `### Screenshot\n\n![Screenshot](${url})` })
    }
    if (targetedElement?.screenshot && targetedElement.screenshot.startsWith("data:image/")) {
      const url = await uploadToLinear(linear, targetedElement.screenshot, `public-element-${issue.identifier}.jpeg`)
      if (url) await linear.createComment({ issueId: issue.id, body: `### Targeted Element Screenshot\n\n**Selector:** \`${targetedElement.selector}\`\n\n![Element Screenshot](${url})` })
    }

    // Don't expose issue IDs to public users
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Public Feedback API]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
