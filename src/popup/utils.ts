import type { Rule, SliderStop } from "./types";

export function generateSliderStops(url: string): SliderStop[] {
  const stops: SliderStop[] = [];
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);

    // Broadest: entire domain
    stops.push({
      label: `${u.host}/*`,
      pattern: `${u.origin}/*`,
    });

    // Progressive paths from shallowest to deepest
    for (let i = 1; i < pathParts.length; i++) {
      const base = pathParts.slice(0, i).join("/");
      stops.push({
        label: `${u.host}/${base}/*`,
        pattern: `${u.origin}/${base}/*`,
      });
    }

    // Most specific: exact URL
    stops.push({
      label: "Exact URL",
      pattern: `${u.origin}${u.pathname}`,
    });
  } catch {
    stops.push({ label: url, pattern: url });
  }
  return stops;
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:3456/health", {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function generatePatternFromPrompt(
  description: string,
  currentUrl: string
): Promise<string> {
  const response = await fetch("http://localhost:3456/api/generate-pattern", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description, currentUrl }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `Server error ${response.status}`);
  }
  const data = await response.json();
  return data.pattern;
}

export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

export async function getPageContent(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  return results[0]?.result ?? "";
}

export async function applyModification(
  tabId: number,
  css: string,
  js: string
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (css, js) => {
      if (css) {
        const style = document.createElement("style");
        style.setAttribute("data-page-modifier", "true");
        style.textContent = css;
        document.head.appendChild(style);
      }
      if (js) {
        try {
          new Function(js)();
        } catch (e) {
          console.error("Page Modifier JS error:", e);
        }
      }
    },
    args: [css, js],
  });
}

export async function saveRule(rule: {
  urlPattern: string;
  prompt: string;
  css?: string;
  js?: string;
}): Promise<void> {
  const { rules = [] } = await chrome.storage.local.get("rules");
  rules.push({
    ...rule,
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ rules });
}

export async function getRules(): Promise<Rule[]> {
  const { rules = [] } = await chrome.storage.local.get("rules");
  return rules;
}

export async function deleteRule(index: number): Promise<void> {
  const { rules = [] } = await chrome.storage.local.get("rules");
  rules.splice(index, 1);
  await chrome.storage.local.set({ rules });
}

export async function modifyPageViaServer(
  prompt: string,
  urlPattern: string,
  currentUrl: string,
  pageContent: string
): Promise<{ css?: string; js?: string }> {
  const response = await fetch("http://localhost:3456/api/modify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      urlPattern,
      currentUrl,
      pageContent: pageContent.slice(0, 50000),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `Server error ${response.status}`);
  }

  return await response.json();
}

export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
