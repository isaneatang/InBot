// Headless verification harness. Drives Chromium over the DevTools protocol using Node's
// built-in WebSocket, so it needs no extra dependencies installed.
//
// For each route it records uncaught exceptions, console errors and failed network requests,
// then captures a screenshot at three viewport widths.

const BASE = process.env.BASE_URL || "http://localhost:4173";
const CDP = process.env.CDP_URL || "http://127.0.0.1:9222";

const ROUTES = [
  ["landing", "/"],
  ["marketplace", "/marketplace"],
  ["dashboard", "/dashboard"],
  ["create", "/create"],
  ["invoice-0", "/invoice/0"],
  ["invoice-1", "/invoice/1"],
  ["profile", "/profile/0x6eD0537a202B0B1A71C5cFb4c6cAcc3a9aD79641"],
  ["settings", "/settings"],
  ["docs", "/docs"],
  ["activity", "/activity"],
];

const VIEWPORTS = [
  ["mobile", 375, 812],
  ["tablet", 768, 1024],
  ["desktop", 1440, 900],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const res = await fetch(`${CDP}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      listeners.forEach((fn) => fn(msg));
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  return { send, on: (fn) => listeners.push(fn), close: () => ws.close() };
}

function describeArg(arg) {
  if (arg.value !== undefined) return String(arg.value);
  if (arg.description) return arg.description;
  return arg.type;
}

(async () => {
  const client = await connect();
  const findings = [];

  client.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      findings.push({
        kind: "exception",
        text: d.exception?.description || d.text,
      });
    }
    if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
      findings.push({
        kind: msg.params.type === "error" ? "console.error" : "console.warn",
        text: (msg.params.args || []).map(describeArg).join(" "),
      });
    }
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      findings.push({ kind: "log", text: msg.params.entry.text, url: msg.params.entry.url });
    }
    if (msg.method === "Network.loadingFailed") {
      findings.push({ kind: "network", text: `${msg.params.errorText} ${msg.params.type}` });
    }
  });

  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Page.enable");
  await client.send("Network.enable");

  const results = [];

  for (const [name, path] of ROUTES) {
    for (const [vpName, width, height] of VIEWPORTS) {
      const before = findings.length;

      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: vpName === "mobile",
      });

      await client.send("Page.navigate", { url: BASE + path });
      await sleep(vpName === "desktop" ? 3500 : 2200);

      // Did React actually mount and paint something?
      const probe = await client.send("Runtime.evaluate", {
        expression: `(() => {
          const root = document.getElementById("root");
          const body = document.body;
          return JSON.stringify({
            nodes: root ? root.querySelectorAll("*").length : 0,
            text: (root?.innerText || "").trim().length,
            h1: document.querySelector("h1")?.innerText || null,
            scrollW: body.scrollWidth,
            clientW: body.clientWidth,
            overflowing: [...document.querySelectorAll("*")]
              .filter(el => el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflowX === "visible")
              .slice(0, 3)
              .map(el => el.tagName + "." + (el.className?.toString?.().slice(0,40) || "")),
          });
        })()`,
        returnByValue: true,
      });

      const info = JSON.parse(probe.result.value);
      const newFindings = findings.slice(before);

      results.push({ route: name, viewport: vpName, width, ...info, findings: newFindings });

      if (vpName === "mobile" || vpName === "desktop") {
        const shot = await client.send("Page.captureScreenshot", { format: "png" });
        const fs = await import("node:fs");
        fs.mkdirSync("verify-shots", { recursive: true });
        fs.writeFileSync(`verify-shots/${name}-${vpName}.png`, Buffer.from(shot.data, "base64"));
      }
    }
  }

  // Report
  console.log("\n=== RENDER CHECK ===");
  console.log("route".padEnd(14), "vp".padEnd(8), "nodes".padEnd(7), "chars".padEnd(7), "hscroll", " h1");
  let failures = 0;
  for (const r of results) {
    const hscroll = r.scrollW > r.clientW + 2 ? `YES(${r.scrollW}>${r.clientW})` : "no";
    const blank = r.nodes < 20 || r.text < 20;
    if (blank) failures++;
    if (r.scrollW > r.clientW + 2) failures++;
    console.log(
      r.route.padEnd(14),
      r.viewport.padEnd(8),
      String(r.nodes).padEnd(7),
      String(r.text).padEnd(7),
      hscroll.padEnd(8),
      (blank ? "BLANK PAGE " : "") + (r.h1 || "").slice(0, 40)
    );
    if (r.overflowing.length) console.log("               overflow:", r.overflowing.join(", "));
  }

  console.log("\n=== ERRORS AND WARNINGS ===");
  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.kind}: ${f.text}`.slice(0, 220);
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  if (grouped.size === 0) {
    console.log("none");
  } else {
    for (const [text, count] of [...grouped].sort((a, b) => b[1] - a[1])) {
      console.log(`  [x${count}] ${text}`);
    }
  }

  console.log(`\nrender failures: ${failures}`);
  client.close();
  process.exit(0);
})().catch((err) => {
  console.error("harness failed:", err);
  process.exit(1);
});
