# Gemini Notebook (NotebookLM) MCP Setup Guide

This document provides step-by-step instructions to connect **Google Antigravity IDE** to **Gemini Notebooks (formerly NotebookLM)** using the `notebooklm-mcp-cli` Model Context Protocol (MCP) server. 

This integration allows Antigravity agents to perform live CRUD operations, grounded RAG searches, studio content creation (audio podcasts, reports, slides, infographics, data tables), and cross-notebook spec sheet queries across all your scraped hardware catalogs.

---

## 💻 1. Tested Setup for macOS (MacBook Air x86_64 / Apple Silicon)

> **Tested System**: macOS Monterey 12.7.6 (Intel x86_64 MacBook Air A1466)  
> **Package Version**: `notebooklm-mcp-cli` v0.9.6

### Step 1: Install `uv` Tool Manager
`uv` manages isolated Python environments and prebuilt wheels cleanly without interfering with system Python.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

### Step 2: Install `notebooklm-mcp-cli` with Pre-Built Wheels
Use the `--no-build` flag to force downloading prebuilt binary wheels (e.g. `cryptography`, `pydantic-core`, `beartype`) to prevent source compilation delays or Rust compiler requirements:

```bash
export PATH="$HOME/.local/bin:$PATH"
uv tool install --no-build notebooklm-mcp-cli
```

*Verification*:
```bash
nlm --version
# Expected output: notebooklm-mcp-cli 0.9.6
```

### Step 3: Establish Authentication Session
Run the login command to authenticate your Google Account:

```bash
export PATH="$HOME/.local/bin:$PATH"
nlm login
```

- Google Chrome will launch automatically.
- Log in to your Google Account (the account holding your Gemini Notebooks).
- Close Chrome once logged in.
- The CLI saves encrypted session cookies to `~/.notebooklm-mcp-cli/profiles/default`.

### Step 4: Configure Antigravity IDE MCP Connection
Register the local stdio MCP server inside Antigravity configuration:

```bash
export PATH="$HOME/.local/bin:$PATH"
nlm setup add antigravity
```

*Verification*:
```bash
nlm setup list
# Output table should show:
# Antigravity | Google Antigravity AI IDE | ✓ | ~/.gemini/antigravity/mcp_config.json
```

### Step 5: Ingest the Expert Agentic Skill
Install `nlm-skill` into Antigravity's active skills directory:

```bash
export PATH="$HOME/.local/bin:$PATH"
nlm skill install antigravity

# Copy to workspace skills for local workspace activation:
mkdir -p .agents/skills
cp -R "$HOME/.gemini/antigravity/skills/nlm-skill" .agents/skills/
```

### Step 6: Verify Overall Health
```bash
export PATH="$HOME/.local/bin:$PATH"
nlm doctor
nlm notebook list
```

---

## 🐧 2. Setup Guide for Linux Mint / Ubuntu / Debian

### Prerequisites
- Google Chrome or Chromium browser installed (`sudo apt install google-chrome-stable` or `sudo apt install chromium-browser`)
- `curl` installed (`sudo apt install curl`)

### Step 1: Install `uv` Tool Manager
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Step 2: Install `notebooklm-mcp-cli`
```bash
uv tool install --no-build notebooklm-mcp-cli
```

### Step 3: Authenticate Session
```bash
nlm login
```
*Note for Headless Server / Remote Linux Mint (SSH)*:
If running on a remote Linux server without display, use external CDP provider mode:
```bash
nlm login --provider openclaw --cdp-url http://127.0.0.1:9222
```

### Step 4: Register Antigravity MCP Server & Install Skill
```bash
nlm setup add antigravity
nlm skill install antigravity
mkdir -p .agents/skills
cp -R ~/.gemini/antigravity/skills/nlm-skill .agents/skills/
```

### Step 5: Verify
```bash
nlm doctor
nlm notebook list
```

---

## 🪟 3. Setup Guide for Windows 10 / Windows 11 (PowerShell & Command Prompt)

### Prerequisites
- Google Chrome installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`
- PowerShell 5.1+ or PowerShell 7+

### Step 1: Install `uv` Tool Manager via PowerShell
Open PowerShell as Administrator:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Close and reopen PowerShell to reload `$env:PATH`, or run:
```powershell
$env:Path += ";$env:USERPROFILE\.local\bin"
```

### Step 2: Install `notebooklm-mcp-cli`
```powershell
uv tool install --no-build notebooklm-mcp-cli
```

*Verify installation*:
```powershell
nlm --version
```

### Step 3: Authenticate Session
```powershell
nlm login
```
- Chrome opens automatically. Log in to your Google Account.
- Close Chrome after logging in.

### Step 4: Register Antigravity MCP Server & Skill
```powershell
nlm setup add antigravity
nlm skill install antigravity

# Copy skill to local project root:
if (-not (Test-Path .agents\skills)) { New-Item -ItemType Directory -Path .agents\skills }
Copy-Item -Recurse -Force "$env:USERPROFILE\.gemini\antigravity\skills\nlm-skill" ".agents\skills\"
```

### Step 5: Verify Setup
```powershell
nlm doctor
nlm notebook list
```

---

## 🚨 Troubleshooting & Key Gotchas

| Issue | Cause | Fix / Solution |
|---|---|---|
| **Compilation hanging on `cryptography`** | Machine lacks Rust compiler (`rustc`/`cargo`) or Python C++ build tools | Use `uv tool install --no-build notebooklm-mcp-cli` to force using pre-built binary wheels. |
| **`nlm: command not found`** | `~/.local/bin` is not in system `$PATH` | Run `export PATH="$HOME/.local/bin:$PATH"` (Linux/macOS) or add `$env:USERPROFILE\.local\bin` to Windows Environment Variables. |
| **Auth Expiration / Cookie Stale** | Google session cookies expired after 2-4 weeks | Run `nlm login` in terminal, re-authenticate in Chrome, then run `nlm doctor`. |
| **MCP Server Not Appearing in Antigravity** | IDE requires application restart to load newly added MCP config | Fully restart Antigravity IDE after running `nlm setup add antigravity`. |
| **Multiple Google Accounts** | Need to switch between work & personal notebooks | Run `nlm login --profile work`, then switch default profile with `nlm login switch work`. |
