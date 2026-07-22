import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the anonymous localized game start experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /포인터로 플레이/);
  assert.match(html, /카메라는 이 기기에서만 처리돼요/);
  assert.match(html, />KO<\/button>/);
  assert.match(html, />EN<\/button>/);
  assert.match(html, /night-museum-hero\.png/);
  assert.equal(
    html.match(/href="https:\/\/manse-showcase\.ran584000\.chatgpt\.site"/g)?.length,
    2,
    "wordmark and Browse games must both return to the exact public Showcase",
  );
  assert.match(html, /게임 둘러보기/);
  assert.match(html, /https:\/\/github\.com\/ahndohun\/manse-game-museum-statues/);
  assert.doesNotMatch(html, /replace-me/);
  assert.doesNotMatch(html, /signin-with-chatgpt|<iframe\b|<form\b/i);
});

test("platform shell keeps its compact mobile contract", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\.platform-shell\s*\{[^}]*min-height:\s*68px/s);
  assert.match(css, /@media \(max-width:\s*620px\)[\s\S]*\.platform-shell\s*\{[^}]*min-height:\s*64px/s);
  assert.match(css, /\.browse-games\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.shell-divider, \.shell-game\s*\{\s*display:\s*none/s);
});

test("build bundles the public contract and pose runtime", async () => {
  const manifest = JSON.parse(await readFile("public/.well-known/manse-game.json", "utf8"));
  assert.equal(typeof manifest.slug, "string");
  assert.equal(manifest.slug.length > 0, true);
  await access(`public/packs/${manifest.slug}/manse.pack.json`);
  await access("dist/client/sw.js");
  await access("dist/client/models/pose_landmarker_lite.task");
  await access("dist/client/vendor/mediapipe/wasm/vision_wasm_internal.wasm");
  const clientEntries = await readdir("dist/client", { recursive: true });
  const scripts = await Promise.all(
    clientEntries.filter((entry) => entry.endsWith(".js")).map((entry) => readFile(`dist/client/${entry}`, "utf8")),
  );
  assert.equal(
    scripts.some((script) => script.includes("serviceWorker") && script.includes("/sw.js")),
    true,
    "the production client must register the bundled service worker",
  );
});
