// Linear Feedback Button — Public Pages (Unauthenticated Visitors)
// Place in: components/shared/public-feedback-button.tsx
// Requires: html2canvas-pro, sonner, shadcn/ui (dialog, button, textarea, badge)
// Differences from dashboard widget:
//   - Floating pill button (fixed bottom-left)
//   - Posts to /api/feedback/public (no auth required)
//   - Honeypot field for spam protection
//   - Handles 429 rate limiting
"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  MessageSquarePlus,
  Bug,
  Lightbulb,
  TrendingUp,
  HelpCircle,
  Loader2,
  Wand2,
  X,
  Maximize2,
  ChevronDown,
  Camera,
  Crosshair,
} from "lucide-react"
import { toast } from "sonner"

type FeedbackType = "bug" | "feature" | "improvement" | "question"

interface TargetedElementInfo {
  selector: string
  tagName: string
  text: string
  screenshot: string
  rect: DOMRect
}

const feedbackTypes: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Feature", icon: Lightbulb },
  { value: "improvement", label: "Improvement", icon: TrendingUp },
  { value: "question", label: "Question", icon: HelpCircle },
]

function getCssSelector(el: HTMLElement): string {
  const parts: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.body && parts.length < 5) {
    let selector = current.tagName.toLowerCase()
    if (current.id) { selector += `#${current.id}`; parts.unshift(selector); break }
    if (current.className && typeof current.className === "string") {
      const classes = current.className.split(/\s+/).filter((c) => c && !c.startsWith("hover:") && !c.startsWith("dark:") && !c.startsWith("focus:") && !c.startsWith("group-") && c.length < 30).slice(0, 2)
      if (classes.length > 0) selector += `.${classes.join(".")}`
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName)
      if (siblings.length > 1) { const index = siblings.indexOf(current) + 1; selector += `:nth-of-type(${index})` }
    }
    parts.unshift(selector)
    current = current.parentElement
  }
  return parts.join(" > ")
}

async function captureGlobalScreenshot(): Promise<string | null> {
  try {
    const { default: html2canvas } = await import("html2canvas-pro")
    const canvas = await html2canvas(document.body, {
      scale: 0.5, useCORS: true, allowTaint: false, logging: false,
      backgroundColor: null, removeContainer: true,
      width: window.innerWidth, height: window.innerHeight,
      windowWidth: window.innerWidth, windowHeight: window.innerHeight,
    })
    const MAX_DIM = 1200
    let finalCanvas: HTMLCanvasElement = canvas
    if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / canvas.width, MAX_DIM / canvas.height)
      const offscreen = document.createElement("canvas")
      offscreen.width = Math.round(canvas.width * ratio)
      offscreen.height = Math.round(canvas.height * ratio)
      const ctx = offscreen.getContext("2d")
      if (ctx) { ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height); finalCanvas = offscreen }
    }
    const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.6)
    return dataUrl.length <= 1_000_000 ? dataUrl : null
  } catch { return null }
}

async function captureElementScreenshot(target: HTMLElement): Promise<string> {
  try {
    const { default: html2canvas } = await import("html2canvas-pro")
    const canvas = await html2canvas(target, { useCORS: true, allowTaint: false, scale: 1, logging: false, backgroundColor: null, removeContainer: true })
    const MAX_DIM = 800
    let finalCanvas: HTMLCanvasElement = canvas
    if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / canvas.width, MAX_DIM / canvas.height)
      const offscreen = document.createElement("canvas")
      offscreen.width = Math.round(canvas.width * ratio)
      offscreen.height = Math.round(canvas.height * ratio)
      const ctx = offscreen.getContext("2d")
      if (ctx) { ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height); finalCanvas = offscreen }
    }
    const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.7)
    return dataUrl.length <= 500_000 ? dataUrl : ""
  } catch { return "" }
}

function CollapsibleSection({ title, icon: Icon, badge, defaultOpen = false, children }: {
  title: string; icon: typeof Camera; badge?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border bg-muted/20">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/30 transition-colors rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />{title}
          {badge && <Badge variant="secondary" className="text-xs px-1.5 py-0">{badge}</Badge>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function ImagePreviewOverlay({ src, onClose }: { src: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Image preview">
      <button ref={closeRef} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close preview">
        <X className="h-5 w-5" />
      </button>
      <img src={src} alt="Preview" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

export function PublicFeedbackButton() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isTargeting, setIsTargeting] = useState(false)
  const [selectedType, setSelectedType] = useState<FeedbackType>("bug")
  const [description, setDescription] = useState("")
  const [improvedDescription, setImprovedDescription] = useState("")
  const [isImproving, setIsImproving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [targetedElement, setTargetedElement] = useState<TargetedElementInfo | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState("")
  const consoleErrorsRef = useRef<string[]>([])
  const isTargetingRef = useRef(false)
  const hoveredRef = useRef<HTMLElement | null>(null)

  useEffect(() => { isTargetingRef.current = isTargeting }, [isTargeting])
  useEffect(() => {
    const originalError = console.error
    console.error = (...args: unknown[]) => {
      consoleErrorsRef.current.push(args.map(String).join(" "))
      if (consoleErrorsRef.current.length > 10) consoleErrorsRef.current.shift()
      originalError.apply(console, args)
    }
    return () => { console.error = originalError }
  }, [])

  const captureAndOpenModal = useCallback(async () => {
    const globalShot = await captureGlobalScreenshot()
    setScreenshot(globalShot)
    setDialogOpen(true)
  }, [])

  const handleElementSelected = useCallback(async (info: TargetedElementInfo) => {
    setTargetedElement(info)
    await captureAndOpenModal()
  }, [captureAndOpenModal])

  const handleTargetingSkip = useCallback(() => { captureAndOpenModal() }, [captureAndOpenModal])

  useEffect(() => {
    if (!isTargeting) return
    const overlay = document.createElement("div")
    overlay.style.cssText = `position: fixed; pointer-events: none; z-index: 99999; border: 3px solid var(--primary); background: color-mix(in srgb, var(--primary) 8%, transparent); border-radius: 4px; transition: all 0.1s ease; display: none;`
    document.body.appendChild(overlay)
    const tooltip = document.createElement("div")
    tooltip.style.cssText = `position: fixed; z-index: 100000; pointer-events: none; background: var(--popover); color: var(--popover-foreground); font-size: 11px; padding: 4px 8px; border-radius: 4px; display: none; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid var(--border);`
    document.body.appendChild(tooltip)
    document.body.style.cursor = "crosshair"
    const handleMouseMove = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement
      if (!target || target.closest("[data-feedback-widget]")) { overlay.style.display = "none"; tooltip.style.display = "none"; return }
      hoveredRef.current = target
      const rect = target.getBoundingClientRect()
      overlay.style.display = "block"; overlay.style.top = `${rect.top}px`; overlay.style.left = `${rect.left}px`; overlay.style.width = `${rect.width}px`; overlay.style.height = `${rect.height}px`
      tooltip.style.display = "block"; tooltip.style.top = `${rect.top - 24}px`; tooltip.style.left = `${rect.left}px`; tooltip.textContent = `<${target.tagName.toLowerCase()}>`
    }
    const handleClick = async (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      const target = hoveredRef.current
      if (!target || target.closest("[data-feedback-widget]")) return
      setIsTargeting(false); document.body.style.cursor = ""; overlay.remove(); tooltip.remove()
      const elementShot = await captureElementScreenshot(target)
      handleElementSelected({ selector: getCssSelector(target), tagName: target.tagName.toLowerCase(), text: target.textContent?.slice(0, 100) || "", screenshot: elementShot, rect: target.getBoundingClientRect() })
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsTargeting(false); document.body.style.cursor = ""; overlay.remove(); tooltip.remove(); handleTargetingSkip() }
    }
    document.addEventListener("mousemove", handleMouseMove, true); document.addEventListener("click", handleClick, true); document.addEventListener("keydown", handleKeyDown, true)
    return () => { document.removeEventListener("mousemove", handleMouseMove, true); document.removeEventListener("click", handleClick, true); document.removeEventListener("keydown", handleKeyDown, true); document.body.style.cursor = ""; overlay.remove(); tooltip.remove() }
  }, [isTargeting, handleElementSelected, handleTargetingSkip])

  const startTargeting = useCallback(() => { setIsTargeting(true); toast.info("Click on the element you want to report", { description: "Press Escape to skip.", duration: 4000 }) }, [])

  const handleImprove = useCallback(async () => {
    if (description.trim().length < 5) return
    setIsImproving(true)
    try {
      const res = await fetch("/api/feedback/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: description.trim(), type: selectedType }) })
      if (res.ok) { const data = await res.json(); if (data.improved && data.improved !== description.trim()) { setImprovedDescription(data.improved); toast.success("Description improved") } }
    } catch {} finally { setIsImproving(false) }
  }, [description, selectedType])

  const handleSubmit = useCallback(async () => {
    if (!description.trim() || description.trim().length < 3) { toast.error("Please enter a description (at least 3 characters)"); return }
    setIsSubmitting(true)
    let improved = improvedDescription
    if (!improved && description.trim().length >= 5) {
      try {
        const r = await fetch("/api/feedback/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: description.trim(), type: selectedType }) })
        if (r.ok) { const d = await r.json(); if (d.improved && d.improved !== description.trim()) improved = d.improved }
      } catch {}
    }
    try {
      const payload = {
        type: selectedType, description: description.trim(), ...(improved ? { improvedDescription: improved } : {}),
        screenshot: screenshot ?? "", pageUrl: window.location.href, userAgent: navigator.userAgent,
        consoleLogs: [...consoleErrorsRef.current], honeypot,
        ...(targetedElement ? { targetedElement: { selector: targetedElement.selector, tagName: targetedElement.tagName, text: targetedElement.text, screenshot: targetedElement.screenshot } } : {}),
      }
      const res = await fetch("/api/feedback/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (res.status === 429) { toast.error("Too many submissions. Please try again later."); return }
      if (!res.ok) throw new Error("Failed")
      toast.success("Feedback submitted! Thank you.")
      setDialogOpen(false); resetForm()
    } catch { toast.error("Failed to submit feedback.") } finally { setIsSubmitting(false) }
  }, [description, improvedDescription, selectedType, screenshot, targetedElement, honeypot])

  const resetForm = useCallback(() => { setDescription(""); setImprovedDescription(""); setSelectedType("bug"); setScreenshot(null); setTargetedElement(null); setHoneypot("") }, [])

  return (
    <div data-feedback-widget>
      <button onClick={startTargeting} disabled={isTargeting}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <MessageSquarePlus className="h-4 w-4" />Feedback
      </button>
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="sm:max-w-lg z-[9999] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send Feedback</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Feedback type">
              {feedbackTypes.map((ft) => (
                <button key={ft.value} type="button" role="radio" aria-checked={selectedType === ft.value} onClick={() => setSelectedType(ft.value)}
                  className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <Badge variant={selectedType === ft.value ? "default" : "outline"} className="cursor-pointer gap-1.5 px-3 py-1.5">
                    <ft.icon className="h-3.5 w-3.5" />{ft.label}
                  </Badge>
                </button>
              ))}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Description</p>
                {description.trim().length >= 5 && (
                  <button type="button" onClick={handleImprove} disabled={isImproving}
                    className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-all disabled:opacity-50">
                    {isImproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {isImproving ? "Improving..." : "Improve with AI"}
                  </button>
                )}
              </div>
              <Textarea value={description} onChange={(e) => { setDescription(e.target.value); if (improvedDescription) setImprovedDescription("") }}
                placeholder="Describe what happened or what you'd like to see..." rows={3} className="resize-none break-words" />
              {improvedDescription && (
                <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-medium text-primary">AI-improved version (will be included):</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{improvedDescription}</p>
                </div>
              )}
            </div>
            <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            {targetedElement && (
              <CollapsibleSection title="Targeted Element" icon={Crosshair} badge={targetedElement.tagName}>
                <div className="space-y-2">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="font-mono text-[11px] break-all leading-relaxed text-primary/80">{targetedElement.selector}</p>
                    <p><span className="font-medium">Tag:</span> <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{targetedElement.tagName}</code></p>
                    {targetedElement.text && <p className="break-words"><span className="font-medium">Text:</span> <span className="italic">&quot;{targetedElement.text.slice(0, 80)}{targetedElement.text.length > 80 ? "..." : ""}&quot;</span></p>}
                  </div>
                  {targetedElement.screenshot && (
                    <button type="button" className="cursor-pointer overflow-hidden rounded border w-full" onClick={() => setPreviewImage(targetedElement.screenshot)} aria-label="View element screenshot">
                      <img src={targetedElement.screenshot} alt="Element" className="h-24 w-full object-contain bg-muted/20" />
                    </button>
                  )}
                </div>
              </CollapsibleSection>
            )}
            {screenshot && (
              <CollapsibleSection title="Page Screenshot" icon={Camera}>
                <div className="relative cursor-pointer overflow-hidden rounded-md border" onClick={() => setPreviewImage(screenshot)}>
                  <img src={screenshot} alt="Screenshot" className="h-36 w-full object-cover object-top" />
                  <div className="absolute inset-0 flex items-center justify-center bg-transparent opacity-0 transition-opacity hover:bg-foreground/20 hover:opacity-100"><Maximize2 className="h-5 w-5 text-white" /></div>
                </div>
              </CollapsibleSection>
            )}
            {consoleErrorsRef.current.length > 0 && <p className="text-xs text-muted-foreground">{consoleErrorsRef.current.length} console error{consoleErrorsRef.current.length > 1 ? "s" : ""} will be attached</p>}
            <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim() || description.trim().length < 3} className="w-full">
              {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>) : "Submit Feedback"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {previewImage && <ImagePreviewOverlay src={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  )
}
