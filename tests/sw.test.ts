import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

// Runs the real service worker source inside a sandbox with an in-memory Cache API, so install / activate /
// fetch / update behaviour (including "offline") is tested without a browser.

const SCOPE = "https://example.test/jamat/";
const FILES = ["./", "index.html", "styles/main.css", "src/main.js", "manifest.webmanifest"];
const source = stripTypeScriptTypes(readFileSync(new URL("../src/sw.ts", import.meta.url), "utf8"));

class FakeCache {
  entries = new Map<string, Response>();
  network: Network;
  constructor(network: Network) { this.network = network; }
  async addAll(reqs: Request[]): Promise<void> {
    const got: [string, Response][] = [];
    for (const r of reqs) {
      const res = await this.network.fetch(r);
      if (!res.ok) throw new TypeError("addAll failed");
      got.push([r.url, res]);
    }
    for (const [u, res] of got) this.entries.set(u, res); // all-or-nothing, like the real Cache.addAll
  }
  async match(key: string | Request): Promise<Response | undefined> {
    const hit = this.entries.get(typeof key === "string" ? key : key.url);
    return hit?.clone();
  }
}

class Network {
  offline = false;
  missing = new Set<string>();
  log: { url: string; cache?: string }[] = [];
  async fetch(input: string | Request): Promise<Response> {
    const req = typeof input === "string" ? new Request(input) : input;
    this.log.push({ url: req.url, cache: req.cache });
    if (this.offline) throw new TypeError("offline");
    if (this.missing.has(req.url)) return new Response("nope", { status: 404 });
    return new Response(`body of ${req.url}`, { status: 200 });
  }
}

type Handler = (e: Record<string, unknown>) => void;

function boot(version: string, shared?: { store: Map<string, FakeCache>; network: Network }) {
  const network = shared?.network ?? new Network();
  const store = shared?.store ?? new Map<string, FakeCache>();
  const handlers: Record<string, Handler[]> = {};
  const calls = { skipWaiting: 0, claim: 0 };
  const self = {
    registration: { scope: SCOPE },
    skipWaiting: async () => { calls.skipWaiting++; },
    clients: { claim: async () => { calls.claim++; } },
    addEventListener: (type: string, cb: Handler) => { (handlers[type] ??= []).push(cb); },
  };
  const caches = {
    open: async (name: string) => { if (!store.has(name)) store.set(name, new FakeCache(network)); return store.get(name)!; },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const ctx = vm.createContext({ self, caches, fetch: (r: Request) => network.fetch(r), Request, Response, URL, Promise, TypeError });
  vm.runInContext(`const BUILD = ${JSON.stringify({ version, files: FILES })};\n${source}`, ctx);

  const dispatch = async (type: "install" | "activate"): Promise<void> => {
    const waits: Promise<unknown>[] = [];
    for (const h of handlers[type] ?? []) h({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) => {
    const req = new Request(url, { method: init.method ?? "GET" });
    // Request.mode is read-only and "cors" for scripts; navigations are what we need to simulate.
    const request = init.mode === "navigate" ? new Proxy(req, { get: (t, k) => (k === "mode" ? "navigate" : Reflect.get(t, k).bind?.(t) ?? Reflect.get(t, k)) }) : req;
    let response: Promise<Response> | null = null;
    for (const h of handlers.fetch ?? []) h({ request, respondWith: (r: Promise<Response> | Response) => { response = Promise.resolve(r); } });
    return response as Promise<Response> | null;
  };
  const message = (data: unknown) => { for (const h of handlers.message ?? []) h({ data }); };
  return { network, store, calls, dispatch, fetchEvent, message };
}

const U = (p: string) => new URL(p, SCOPE).href;

test("install precaches the whole shell, bypassing the HTTP cache, and does not skip waiting", async () => {
  const sw = boot("v1");
  await sw.dispatch("install");
  const cache = sw.store.get("jamat-v1")!;
  assert.deepEqual([...cache.entries.keys()].sort(), FILES.map(U).sort());
  assert.ok(sw.network.log.every((l) => l.cache === "reload"));
  assert.equal(sw.calls.skipWaiting, 0);
});

test("a failed download aborts install and leaves nothing partial", async () => {
  const sw = boot("v1");
  sw.network.missing.add(U("src/main.js"));
  await assert.rejects(sw.dispatch("install"));
  assert.equal(sw.store.get("jamat-v1")?.entries.size ?? 0, 0);
});

test("offline: shell and assets are served from the cache", async () => {
  const sw = boot("v1");
  await sw.dispatch("install");
  await sw.dispatch("activate");
  sw.network.offline = true;
  for (const path of ["./", "index.html"]) {
    const res = await sw.fetchEvent(U(path), { mode: "navigate" })!;
    assert.equal(await res.text(), `body of ${U("index.html")}`);
  }
  assert.equal(await (await sw.fetchEvent(U("src/main.js"))!).text(), `body of ${U("src/main.js")}`);
  assert.equal(await (await sw.fetchEvent(U("styles/main.css") + "?v=3")!).text(), `body of ${U("styles/main.css")}`); // query ignored
  assert.equal(await (await sw.fetchEvent(U("./#/members"), { mode: "navigate" })!).text(), `body of ${U("index.html")}`); // hash route
});

test("shell hits never touch the network", async () => {
  const sw = boot("v1");
  await sw.dispatch("install");
  sw.network.log.length = 0;
  await sw.fetchEvent(U("src/main.js"))!;
  assert.equal(sw.network.log.length, 0);
});

test("requests it does not own are left alone (cross-origin, non-GET, unknown paths, outside scope)", async () => {
  const sw = boot("v1");
  await sw.dispatch("install");
  assert.equal(sw.fetchEvent("https://other.test/jamat/src/main.js"), null);
  assert.equal(sw.fetchEvent(U("src/main.js"), { method: "POST" }), null);
  assert.equal(sw.fetchEvent(U("unknown/file.json")), null);
  assert.equal(sw.fetchEvent("https://example.test/other-app/index.html", { mode: "navigate" }), null);
});

test("activate removes old builds of this app only, keeps foreign caches, and claims clients", async () => {
  const shared = { store: new Map<string, FakeCache>(), network: new Network() };
  const old = boot("v1", shared);
  await old.dispatch("install");
  await old.dispatch("activate");
  shared.store.set("someone-elses-cache", new FakeCache(shared.network));
  const next = boot("v2", shared);
  await next.dispatch("install");
  // while v2 is only installed, v1's cache must still be there (v1 keeps serving)
  assert.deepEqual([...shared.store.keys()].sort(), ["jamat-v1", "jamat-v2", "someone-elses-cache"]);
  await next.dispatch("activate");
  assert.deepEqual([...shared.store.keys()].sort(), ["jamat-v2", "someone-elses-cache"]);
  assert.equal(next.calls.claim, 1);
});

test("an update waits: it never takes over by itself, only on an explicit SKIP_WAITING message", async () => {
  const sw = boot("v2");
  await sw.dispatch("install");
  assert.equal(sw.calls.skipWaiting, 0);
  sw.message({ type: "SOMETHING_ELSE" });
  sw.message(null);
  sw.message("SKIP_WAITING");
  assert.equal(sw.calls.skipWaiting, 0);
  sw.message({ type: "SKIP_WAITING" });
  assert.equal(sw.calls.skipWaiting, 1);
});

test("the worker never touches user data stores or opens other network paths", () => {
  assert.ok(!/indexedDB|localStorage|sessionStorage/.test(source));
  assert.ok(!/importScripts|XMLHttpRequest/.test(source));
});
