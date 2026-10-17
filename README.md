# Northfield Outfitters: n8n lead-qualifier demo

This is the live demo for Part 5 of the **AI & LLMs workshop** (slides 27–31). An inquiry comes in from the store. n8n looks up the company, the AI scores the lead as hot, warm or cold, and n8n checks the store for a cart. It then routes the lead one of three ways.

```
Storefront form ──► n8n webhook ──► Look up company ──► AI · Research & score ──► Check cart ──► Hot? Cart?
                                                                                                │
             ┌──────────────────────────────────────────────────────────────────────────────────┼──────────────────────┐
         Hot + cart                                                                        Hot, no cart           Warm or cold
   AI · Draft outreach ──► "Needs approval"                                                 "Rep queue"             "Nurture"
                                   └───────────────────────── Rep console (live) ◄──────────────┴──────────────────────┘
```

## What's here

| Path | What it is |
|---|---|
| `server.js` | Zero-dependency Node server. It serves the store and the rep console, plus the API that n8n calls. |
| `public/index.html` | **Storefront.** Products, a cart stored on the server, a demo persona picker, and the team-sales inquiry form. |
| `public/rep.html` | **Rep console.** A live ticket board with four lanes: In flight, Needs approval, Rep queue and Nurture. Click a card to see the AI score, the company lookup, the cart, the draft editor and the timeline. |
| `n8n/northfield-lead-qualifier.json` | The n8n workflow (already imported into your local n8n). |
| `n8n/build-workflow.js` | Regenerates that JSON. Edit the prompts here. Set `CLAUDE_MODEL=...` to change the model. |
| `data/seed.json` | Products, personas, pre-filled carts and the fake company directory. |

## One-time setup

1. **Start the store:** `node server.js`, then open http://localhost:3000 (store) and http://localhost:3000/rep (rep console).
2. **In n8n** (http://localhost:5678), open **"Northfield · Lead qualifier + cart check"**:
   - Open **Claude (scoring)** and **Claude (writing)** and pick your Anthropic credential. If you don't have one, create it: *Credentials → Anthropic → API key*. The model is set by ID to `claude-sonnet-5`. You can pick any model or swap in an OpenAI chat model node.
   - Then choose how you want it to run:
     - **Watch nodes fire live (recommended on stage):** click **Execute workflow** so the test webhook is listening, then submit from the store. The server falls back to the test URL automatically when the workflow isn't published. You have to click Execute again before each submission.
     - **Hands-off:** click **Publish**. Every submission then runs in the background, and you can see the runs under *Executions*.

n8n runs in Docker, so it calls the store at `http://host.docker.internal:3000`. The server sends that address in each webhook payload as `callbackBase`. If you want a different address, set `CALLBACK_BASE`, and set `N8N_WEBHOOK_URL` if your webhook URL is different.

## Demo script (matches the slide 31 speaker notes)

Pick the persona from the dark strip at the top of the store, scroll to **Outfitting a team?**, click **Fill in …'s inquiry**, then **Send inquiry**. Keep the rep console open next to n8n.

| # | Persona | What happens | Talking point |
|---|---|---|---|
| 1 | **Dana Whitfield**, Cascade Adventure Guides | HOT, empty cart → **Rep queue** | "Worth a human's time today. The research summary is already attached." |
| 2 | **Marcus Lee**, Ridgeway Outdoor School | HOT and 24 items in the cart → AI drafts an email that names the exact boots and packs → **Needs approval** | "The cart check is a real lookup, not an AI guess. The AI only writes the draft, and a person approves it." Edit the draft, then click **Approve & send**. |
| 3 | **Sam Rivera** (gmail) | COLD, even with a fleece in the cart → **Nurture** | "The cart alone doesn't make a lead hot. Both signals decide." |
| 4 | **Jordan Kim**, Peak Point Software | WARM (no budget or authority) → **Nurture** | Optional |

To show the cart is live, go back to the store as Dana and add a few shells to her cart. Submit again, and this time she goes to **Needs approval**.

**Reset demo** (top right of the rep console) clears all tickets and puts the seeded carts back.
