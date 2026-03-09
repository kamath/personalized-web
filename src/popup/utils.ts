import type { SliderStop } from "./types";

export function generateSliderStops(url: string): SliderStop[] {
  const stops: SliderStop[] = [];
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split("/").filter(Boolean);

    stops.push({
      label: `${u.host}/*`,
      pattern: `${u.origin}/*`,
    });

    for (let i = 1; i < pathParts.length; i++) {
      const base = pathParts.slice(0, i).join("/");
      stops.push({
        label: `${u.host}/${base}/*`,
        pattern: `${u.origin}/${base}/*`,
      });
    }

    stops.push({
      label: "Exact URL",
      pattern: `${u.origin}${u.pathname}`,
    });
  } catch {
    stops.push({ label: url, pattern: url });
  }
  return stops;
}

const SERVER_URL = "http://localhost:3456";

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, {
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
  const response = await fetch(`${SERVER_URL}/api/generate-pattern`, {
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

export async function requestModification(body: {
  prompt: string;
  urlPattern: string;
  currentUrl: string;
  pageContent: string;
}): Promise<{ css: string; js: string; rawResponse: string }> {
  const response = await fetch(`${SERVER_URL}/api/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `Server error ${response.status}`);
  }
  return response.json();
}
