// AI Feedback Improvement Route
// Place in: app/api/feedback/improve/route.ts
//
// Uses Claude (Anthropic SDK) to rewrite user feedback into clear, actionable descriptions.
// Requires: ANTHROPIC_API_KEY env var (or defaults from the SDK).
//
// Optional: Add auth check and rate limiting for production use.

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { description, type } = await req.json()

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      return NextResponse.json({ improved: description }, { status: 200 })
    }

    const typeLabel =
      type === "bug" ? "bug report"
        : type === "feature" ? "feature request"
        : type === "improvement" ? "improvement suggestion"
        : "question"

    const systemPrompt = `You are a QA assistant that rewrites user feedback into clear, structured ${typeLabel}s that developers can immediately act on.

Output format (plain text, no markdown):
- Line 1: One-sentence summary of the issue/request
- Line 2-3: Steps to reproduce or expected behavior (if applicable)
- Line 4: Expected vs actual result (for bugs) or desired outcome (for features)

Rules:
- Keep the user's original meaning intact
- Be specific and technical where possible
- Remove filler words, keep it concise (2-5 sentences max)
- Write in English
- Do NOT add a title, heading, or bullet points — just flowing text`

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `Rewrite this user ${typeLabel} into a clear, actionable description:\n\n"${description.trim()}"`,
      }],
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : description
    return NextResponse.json({ improved: text.trim() })
  } catch (error) {
    console.error("[Feedback Improve]", error)
    return NextResponse.json({ improved: "" }, { status: 500 })
  }
}
