import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawn } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const app = new Hono();
app.use("/*", cors({ origin: "*" }));

// Which ACP agent to use: "claude-agent-acp" (default) or "codex-acp"
const AGENT_COMMAND = process.env.AGENT || "claude-agent-acp";

// Manage ACP connections
let agentProcess: ReturnType<typeof spawn> | null = null;

class PageModifierClient implements acp.Client {
  collectedText = "";
  collectedCss = "";
  collectedJs = "";

  async requestPermission(
    params: acp.RequestPermissionRequest
  ): Promise<acp.RequestPermissionResponse> {
    console.log(`[ACP stream] permission_request: "${params.toolCall.title}"`);
    console.log(`  options: ${params.options.map(o => `${o.name} (${o.kind})`).join(", ")}`);
    // Auto-approve all permissions since this is a local tool
    const allowOption = params.options.find(
      (o) => o.kind === "allow_once" || o.kind === "allow_always"
    );
    const chosen = allowOption ?? params.options[0]!;
    console.log(`  -> auto-selecting: ${chosen.name} (${chosen.kind})`);
    return { outcome: { outcome: "selected", optionId: chosen.optionId } };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    const update = params.update;
    const tag = `[ACP stream]`;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
          this.collectedText += update.content.text;
        } else {
          console.log(`${tag} message chunk (${update.content.type})`);
        }
        break;
      case "tool_call":
        console.log(`\n${tag} tool_call: "${update.title}" [${update.status}]${update.toolCallId ? ` id=${update.toolCallId}` : ""}`);
        break;
      case "tool_call_update":
        console.log(`${tag} tool_call_update: ${update.toolCallId} -> ${update.status}`);
        break;
      case "plan":
        console.log(`${tag} plan: ${JSON.stringify(update)}`);
        break;
      case "agent_thought_chunk": {
        const content = "content" in update && update.content && typeof update.content === "object" && "type" in update.content && "text" in update.content
          ? update.content
          : null;
        if (content && content.type === "text") {
          console.log(`${tag} thought: ${content.text}`);
        } else {
          console.log(`${tag} thought chunk`);
        }
        break;
      }
      default:
        console.log(`${tag} ${update.sessionUpdate}: ${JSON.stringify(update).slice(0, 200)}`);
        break;
    }
  }
}

async function ensureConnection(): Promise<{
  connection: acp.ClientSideConnection;
  sessionId: string;
  client: PageModifierClient;
}> {
  // Spawn a fresh ACP agent process for each request to avoid session state issues
  console.log(`[ACP] Spawning ${AGENT_COMMAND}...`);
  const claudeProcess = spawn(AGENT_COMMAND, [], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const input = Writable.toWeb(claudeProcess.stdin!);
  // @ts-expect-error Readable.toWeb returns ReadableStream<any> but ndJsonStream expects ReadableStream<Uint8Array>
  const output: ReadableStream<Uint8Array> = Readable.toWeb(claudeProcess.stdout!);
  const stream = acp.ndJsonStream(input, output);

  const client = new PageModifierClient();
  const conn = new acp.ClientSideConnection(() => client, stream);

  const initResult = await conn.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  console.log(`[ACP] Connected (protocol v${initResult.protocolVersion})`);

  const sessionResult = await conn.newSession({
    cwd: process.cwd(),
    mcpServers: [],
  });
  console.log(`[ACP] Session: ${sessionResult.sessionId}`);

  // Store for cleanup
  agentProcess = claudeProcess;

  return { connection: conn, sessionId: sessionResult.sessionId, client };
}

function extractModifications(text: string): { css: string; js: string } {
  let css = "";
  let js = "";

  // Extract CSS blocks
  const cssMatches = text.matchAll(/```css\n([\s\S]*?)```/g);
  for (const match of cssMatches) {
    if (match[1]) css += match[1].trim() + "\n";
  }

  // Extract JS blocks
  const jsMatches = text.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g);
  for (const match of jsMatches) {
    if (match[1]) js += match[1].trim() + "\n";
  }

  return { css: css.trim(), js: js.trim() };
}

app.post("/api/generate-pattern", async (c) => {
  const body = await c.req.json<{
    description: string;
    currentUrl: string;
  }>();

  console.log(`[Server] Generate pattern for: ${body.description}`);
  console.log(`[Server] Current URL: ${body.currentUrl}`);

  let proc: ReturnType<typeof spawn> | undefined;

  try {
    const result = await ensureConnection();
    proc = agentProcess!;

    const promptText = `You are a URL pattern generator. Given a description of what web pages should match and an example URL, generate a glob-style URL pattern.

Rules:
- Return ONLY the pattern, nothing else - no explanation, no markdown, no code blocks
- Use * as a wildcard (e.g. https://github.com/*/*)
- The pattern will be matched against full URLs
- Be as specific as possible while still matching all described pages

Example URL the user is currently on: ${body.currentUrl}

Description of pages to match: ${body.description}`;

    const promptResult = await result.connection.prompt({
      sessionId: result.sessionId,
      prompt: [{ type: "text", text: promptText }],
    });

    console.log(`[ACP] Pattern generation completed: ${promptResult.stopReason}`);

    // Extract just the pattern from the response
    let pattern = result.client.collectedText.trim();
    // Clean up if the model wrapped it in backticks or quotes
    pattern = pattern.replace(/^[`"']+|[`"']+$/g, "").trim();
    // Take just the first line if multiple lines returned
    pattern = (pattern.split("\n")[0] ?? pattern).trim();

    console.log(`[Server] Generated pattern: ${pattern}`);

    return c.json({ pattern });
  } catch (err) {
    console.error("[Server] Error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  } finally {
    if (proc) {
      proc.kill();
    }
  }
});

app.post("/api/modify", async (c) => {
  const body = await c.req.json<{
    prompt: string;
    urlPattern: string;
    currentUrl: string;
    pageContent: string;
  }>();

  console.log(`[Server] Modify request for ${body.currentUrl}`);
  console.log(`[Server] Pattern: ${body.urlPattern}`);
  console.log(`[Server] Prompt: ${body.prompt}`);

  let proc: ReturnType<typeof spawn> | undefined;

  try {
    const result = await ensureConnection();
    proc = agentProcess!;

    const systemPrompt = `You are a web page modifier. The user wants to modify a web page.
You must respond with CSS and/or JavaScript code blocks that will be injected into the page.

Rules:
- Return CSS in a \`\`\`css code block
- Return JavaScript in a \`\`\`js code block
- The CSS will be appended as a <style> tag
- The JS will be executed via new Function() in the page context
- Do NOT use document.write or similar destructive methods
- The JS has access to the full DOM
- Be precise and targeted with your selectors
- Prefer CSS-only solutions when possible

Current page URL: ${body.currentUrl}
Here is a truncated version of the page HTML for context:
${body.pageContent.slice(0, 30000)}`;

    const promptResult = await result.connection.prompt({
      sessionId: result.sessionId,
      prompt: [
        {
          type: "text",
          text: `${systemPrompt}\n\nUser request: ${body.prompt}`,
        },
      ],
    });

    console.log(`[ACP] Prompt completed: ${promptResult.stopReason}`);

    const responseText = result.client.collectedText;
    const modifications = extractModifications(responseText);

    console.log(`[Server] CSS length: ${modifications.css.length}`);
    console.log(`[Server] JS length: ${modifications.js.length}`);

    return c.json({
      css: modifications.css,
      js: modifications.js,
      rawResponse: responseText,
    });
  } catch (err) {
    console.error("[Server] Error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  } finally {
    // Clean up the process
    if (proc) {
      proc.kill();
    }
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

console.log(`Page Modifier server starting on http://localhost:3456 (agent: ${AGENT_COMMAND})`);
export default {
  port: 3456,
  fetch: app.fetch,
};
