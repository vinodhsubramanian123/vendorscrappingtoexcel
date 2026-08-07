---
name: knowledge-sync-skill
description: Bi-directional knowledge synchronization skill between Antigravity AI evaluation engine and Gemini NotebookLM RAG notebooks across multi-product generations (DL380 Gen12, Gen11, Alletra, Synergy, Cray).
---

# Knowledge Sync Skill — Bi-Directional Agent & Gemini NotebookLM Alignment Protocol

## Overview
This skill ensures that **Antigravity AI local evaluation engines** and **Gemini NotebookLM RAG notebooks** never diverge in their understanding of HPE server configuration rules, physical constraints, and vendor portal rejection feedback.

---

## Scope Taxonomy Rules
Learnings captured from HPE OCA portal rejections (`KnowledgeDeltas`) are automatically categorized into a 3-tier scope taxonomy:

1. **`UNIVERSAL_VENDOR`**: Applies across ALL HPE product lines (e.g. BTO/CTO mode exclusions, TAA/GTA regional exclusions, -48VDC lug kit mandatory pairings).
2. **`FAMILY_GEN`**: Applies to a specific product family + generation (e.g. ProLiant Gen12 DDR5-6400 memory bit-width rules, Alletra 9000 storage controller write-cache protection).
3. **`CHASSIS_SPECIFIC`**: Applies to an exact chassis model (e.g. DL380 Gen12 SFF drive-less FIO kit `873763-B21`).

---

## Synchronization Execution Workflow

### 1. Ingest & Consolidate Master Registry
Runs `buildMasterKnowledgeRegistry()` to scan all `outputs/{Family}/{Gen}/{Model}/history/catalog_deltas.json` files and build `outputs/history/master_knowledge_registry.json`.

```bash
# Run Master Knowledge Sync
npm run sync:knowledge

# Output JSON payload for Dashboard SSE
node scripts/lib/knowledge_sync.js --json
```

### 2. Generate NotebookLM Sync Payload
Generates a clean Markdown document (`outputs/history/notebook_sync_payload_{chassis}.md`) structured specifically for Gemini NotebookLM source import:
- Section 1: Universal Vendor Rules
- Section 2: Family & Generation Rules
- Section 3: Chassis-Specific Rules & Physical Gotchas

### 3. Automated NotebookLM RAG Push (`nlm`)
When the `nlm` CLI is authenticated:
```bash
node scripts/lib/knowledge_sync.js --chassis DL380_Gen12_SFF --auto-upload-nlm
```
This automatically invokes `nlm source add <notebook_id> --file <payload.md>` to update NotebookLM RAG sources instantly.

### 4. Drift Inspection Protocol
Run `inspectKnowledgeDrift(chassisName)` at the start of any evaluation cycle to verify that local evaluation rules and NotebookLM sources match 100%.

---

## Target Notebook Registry (`scripts/config/notebooks.json`)

```json
{
  "defaultNotebookId": "1d190853-4e9c-48df-aa70-eae66c6f2c1f",
  "notebooks": {
    "DL380_Gen12_SFF": "1d190853-4e9c-48df-aa70-eae66c6f2c1f",
    "DL380_Gen11": "NOTEBOOK_ID_GEN11",
    "Alletra_Storage_System": "NOTEBOOK_ID_ALLETRA",
    "MSL3040_Tape": "NOTEBOOK_ID_TAPE",
    "SY100Gb_F32_Module": "NOTEBOOK_ID_SYNERGY"
  }
}
```
