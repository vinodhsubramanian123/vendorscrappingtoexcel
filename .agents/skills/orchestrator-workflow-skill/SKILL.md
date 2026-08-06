---
name: orchestrator-workflow-skill
description: "Macro-architecture skill orchestrating the 6-stage Continuous Learning Loop: Ingestion, Sync, BOQ Eval, Notebook RAG, HITL Trial, and KnowledgeDelta learning. Use this skill to understand the end-to-end flow of the project and delegate tasks to sub-skills."
---

# Orchestrator Workflow Skill — End-to-End Autonomous Lifecycle

This skill defines the macro-architecture that ties all individual tools (`oca-catalog-scraper`, `boq-eval-skill`, `nlm-skill`) into a single **Continuous Learning Loop**. Whenever you are managing a complex task in this workspace, refer to this 6-stage lifecycle to understand your exact role and responsibilities.

---

## The 6-Stage Continuous Learning Loop

### 1. Ingestion (Live Scraping)
- **Actor**: `oca-catalog-scraper`
- **Action**: Live scrape the HPE OCA vendor portal using the CDP protocol over port 9222.
- **Output**: Generates classified JSON catalogs and multi-sheet Excel workbooks (`*_OCA_Catalog.xlsx`) containing comprehensive part configurations, quantity constraints, and configuration rules.
- **Goal**: Maintain up-to-date, structured intelligence of vendor hardware logic.

### 2. Knowledge Sync & Delta Tracking
- **Actor**: `diff_catalog.js` & `nlm-skill`
- **Action**: 
  - Compare newly scraped JSON against historical snapshots to determine additions, removals (tombstones), and price variations.
  - Sync the generated `*_OCA_Catalog.xlsx` to Google Drive as a source for Gemini NotebookLM using `nlm-skill`.
- **Goal**: Provide the AI brain (NotebookLM) with the latest, historically-tracked catalog rules and pricing logic without losing past data.

### 3. BOQ Upload & Pre-Flight Parsing
- **Actor**: `boq-eval-skill` (`npm run eval:boq <file>`)
- **Action**: Ingest a customer-provided Bill of Quantities (BOQ), multi-sheet proposal, or hardware list. Parse it into a structured format and run 6-aspect physical pre-checks (Compute, Memory, Storage, Networking, Power, Services).
- **Ambiguity Protocol**: If the user's workload intent is ambiguous (e.g., VDI vs DB), **do not block execution**. Proceed with evaluation, make educated assumptions based on the components, and output a Ranked Solution while explicitly stating your assumptions for the user to adjust later.
- **Goal**: Identify missing dependencies and physical layout violations before manual portal entry.

### 4. Notebook Validation (RAG)
- **Actor**: `nlm-skill`
- **Action**: Programmatically query Gemini NotebookLM to cross-reference identified constraints against the synced catalog documentation. Ask NotebookLM to solve complex mixing rules or identify substitute parts.
- **Goal**: Enhance the BOQ Evaluation report with intelligent, context-aware remediation steps based on vendor documentation.

### 5. Human-in-the-Loop (HITL) Portal Trial
- **Actor**: Human User
- **Action**: The system outputs a structured 5-Tier Strategic Resolution Report with ranked BOM solutions. The user takes the top-ranked solution and manually attempts to build it in the live vendor OCA portal.
- **Goal**: Serve as a live test to verify the AI's logic against the vendor's closed configuration engine (before full end-to-end automation is achieved).

### 6. Feedback & Automation Learning
- **Actor**: Human User & `boq-eval-skill`
- **Action**: If the vendor portal rejects the BOM (e.g., "Controller MR416i-p requires Cable Kit X"), the user provides this feedback to the agent.
- **Execution**: The agent runs `npm run eval:boq <boq> --simulate-portal-error "<error text>"` to permanently log a `KnowledgeDelta` in `outputs/history/catalog_deltas.json`.
- **Goal**: The system structurally learns from every portal rejection. Future evaluations automatically apply this learned rule, increasing confidence and closing the gap toward 100% autonomous quote generation.

---

## Agent Coordination Guidelines

When operating in this workspace, follow these delegation rules:
- If asked to extract or update product intelligence ➔ Switch to `oca-catalog-scraper`.
- If asked to validate a BOM, BOQ, or Excel quote ➔ Switch to `boq-eval-skill`.
- If asked to research constraints, query documentation, or sync files to Drive ➔ Switch to `nlm-skill`.
- If asked to track the overall health of the pipeline ➔ Run `npm run status`.
