# Page Modifier

> ⚠️ **This project is in very early stages.** Expect breaking changes, bugs, and incomplete features. Not recommended for production use.

A Chrome extension that uses AI to modify web pages on-demand. Write a prompt, and an AI coding agent generates CSS/JS that gets injected into the page. Rules are saved and automatically re-applied when you revisit matching URLs.

## Prerequisites

- [Bun](https://bun.sh) runtime
- One of the following ACP agents installed globally:

  **Claude** (uses Claude Code under the hood):
  ```bash
  npm install -g @zed-industries/claude-agent-acp
  ```

  **Codex** (uses OpenAI Codex under the hood):
  ```bash
  npm install -g @zed-industries/codex-acp
  ```

## Installation

```bash
bun install
```

## Running the Server

By default, the server uses `claude-agent-acp`. To switch agents, set the `AGENT` environment variable.

**With Claude (default):**
```bash
bun run server
```

**With Codex:**
```bash
AGENT=codex-acp bun run server
```

The server starts on `http://localhost:3456`.

## Loading the Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` directory from this repo

## Usage

1. Navigate to any web page
2. Click the extension icon in the toolbar
3. Enter a prompt describing the modification (e.g. "make the background dark", "hide the sidebar")
4. Choose a URL pattern to control which pages the rule applies to
5. Click **Apply Modification**

Rules are saved locally and automatically re-applied when you visit matching pages.
