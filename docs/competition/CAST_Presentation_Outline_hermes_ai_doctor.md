# Hermes AI Doctor — Presentation Outline (≤12 slides)

**CAST Global Youth Innovation & Entrepreneurship Summit**  
**Track A: STEM Innovation** (AI + Healthcare)  
**Format:** PDF or PPT, max 12 slides  
**Suggested time:** 8–10 minutes + Q&A  

---

## Slide 1 — Title

**Title:** Hermes AI Doctor: Personalized Health Q&A with MCP  
**Subtitle:** Connecting open-source AI agents to a secure health backend  
**On slide:**
- Student name(s), age group (10–14 / 15–18)
- School / city
- Team size (1–5)
- Photo or simple architecture icon (optional)

**Speaker notes:** One sentence: “We built a Telegram health assistant that only answers with *your* data, not generic AI guesses.”

---

## Slide 2 — The Problem

**Headline:** Why normal ChatGPT is not enough for health questions  

**Bullets:**
- General LLMs do not know *your* medications, allergies, or recent vitals
- Answers can sound confident but be wrong for *you*
- Putting full medical records inside chat “memory” is risky (mix-ups, stale data, privacy)

**Visual:** Left = generic bot (“Maybe take X…”); Right = question mark over user profile  

**Speaker notes:** Use one everyday example (e.g., “Can I take this with my current medicine?”).

---

## Slide 3 — Project Objectives

**Headline:** What we set out to build  

**Bullets:**
1. Personalized health answers grounded in the user’s own profile  
2. **Safe fallback** if data cannot be loaded (no fake personalization)  
3. Chat on **Telegram** (familiar app)  
4. **Daily health summary** pushed on a schedule  
5. Learn real AI engineering: **agents, tools, MCP, cron**

**Footer:** Educational prototype — not a medical device  

**Speaker notes:** Emphasize “guard first, answer second.”

---

## Slide 4 — Big Picture Architecture

**Headline:** Three layers, one pipeline  

**Diagram (simple boxes + arrows):**
```
Telegram User
    ↓
Hermes Gateway + LLM (Hermes Agent)
    ↓ MCP tools
mcp-doctor-agent-bridge
    ↓
doctor-agent backend (Node + Firebase)
```

**Bullets:**
- **Hermes** = conversation + scheduling + tools  
- **MCP bridge** = narrow, auditable connection  
- **doctor-agent** = system of record for health data  

**Speaker notes:** “We did not give the AI our database password.”

---

## Slide 5 — What is MCP?

**Headline:** Model Context Protocol — a USB port for AI tools  

**Bullets:**
- Open standard to connect AI apps to external data safely  
- Our MCP server exposes tools like `health_chat_guard`  
- Hermes registers them as `mcp_doctor_context_*` and calls them during chat  

**Visual:** Agent ↔ MCP ↔ Backend (three icons)  

**Speaker notes:** 20-second explanation; judges may not know MCP — keep it simple.

---

## Slide 6 — Core Workflow (M3 Guard)

**Headline:** Every health question: load context first  

**Numbered flow:**
1. User sends message on Telegram  
2. Agent calls **`health_chat_guard_for_telegram`** (`telegramChatId`)  
3. Backend runs `buildAIContext` (meds, vitals, profile, recent chat)  
4. If **OK** → model answers using `systemPromptContext`  
5. If **fail** → show fallback message only (no invented diagnosis)  

**Visual:** Flowchart, 5 steps  

**Speaker notes:** This is our main innovation slide — practice it clearly.

---

## Slide 7 — Key Innovations

**Headline:** What makes our project different  

**Bullets:**
| Innovation | Benefit |
|------------|---------|
| Guard-first design | Stops “fake personalization” |
| MCP bridge | Modular, auditable, reusable pattern |
| Dual identity (email + Telegram chat id) | Same backend, multiple channels |
| Open stack (Hermes + Node) | No vendor lock-in for learning |
| Cron + daily report | Continuous care, not one-off chat |

**Speaker notes:** Pick 2–3 to expand if time is short.

---

## Slide 8 — Safety & Privacy

**Headline:** Responsible AI for health  

**Bullets:**
- Medical truth lives in **Firebase/backend**, not Hermes `MEMORY.md`  
- MCP **user allowlist** in production (`MCP_ALLOWED_USER_IDS`)  
- Logs avoid full PHI (audit checklist M6)  
- Clear disclaimer: **not for emergencies** — call doctor / 911 when urgent  
- Telegram binding: user links account before personalized chat  

**Visual:** Shield icon + “No diagnosis device”  

**Speaker notes:** Shows maturity — important for healthcare track judges.

---

## Slide 9 — Demo & Results (What We Tested)

**Headline:** What worked in our prototype  

**Bullets:**
- ✓ MCP tools load personal profile in CLI tests  
- ✓ Telegram bot answers with profile fields when MCP + prompts configured  
- ✓ Wrong/missing MCP → bot refuses instead of hallucinating  
- ✓ Daily report webhook + trigger script + optional Hermes cron  
- ⚠ Learned: some LLM providers timeout on long tool loops → switched models  

**Visual:** 1–2 screenshots (Telegram chat, or `hermes cron list`) — **blur any private data**  

**Speaker notes:** Honest about limitations — judges respect that.

---

## Slide 10 — Daily Health Report

**Headline:** Beyond chat: scheduled summaries  

**Bullets:**
1. Cron calls `POST /internal/cron/daily-report` (secured with Bearer token)  
2. Backend: context → generate report → save → **Telegram sendMessage**  
3. User must have `telegramChatId` bound in settings  

**Visual:** Calendar / 7:00 AM notification mockup  

**Speaker notes:** Connect to “continuous ingestion” — new data in DB, fresh pull each time.

---

## Slide 11 — Impact & Future Work

**Headline:** Where this could go  

**Impact:**
- Better health literacy for teens and families  
- Reusable pattern for other domains (sports, nutrition, school health)  
- STEM skills: agents, APIs, security, testing  

**Future:**
- Automated test suite (20–30 scripted Q&A cases)  
- More languages; simpler summaries for youth  
- Wearable data via existing risk/anomaly tools  
- Ethics review before any public beta  

**Speaker notes:** End on ambition + responsibility.

---

## Slide 12 — Thank You / Q&A

**Headline:** Thank you  

**On slide:**
- Project repo: `github.com/JeffRen1977/hermes_ai_doctor`  
- One-line summary: **“Personal health AI that must load your data before it speaks.”**  
- Team contact / school email (optional)  
- **Questions?**

**Optional backup slide (not counted if you stay at 12):** Architecture diagram only, for deep technical questions  

---

## Design tips (for daughter)

| Tip | Detail |
|-----|--------|
| Font | Large titles (28–36 pt), bullets 18–24 pt |
| Colors | Calm medical blues/greens; avoid red except warnings |
| Slides | One main idea per slide; max 5 bullets |
| Demo | 30–60 s live Telegram or pre-recorded screen capture |
| Time | ~45–60 seconds per slide |
| Ethics | Always say “not a doctor replacement” once |

---

## Suggested slide order if you must cut to 10

Merge Slide 5 (MCP) into Slide 6 as one “How it works” slide; merge Slide 10 (Daily report) into Slide 11 as “Automation & future.”
