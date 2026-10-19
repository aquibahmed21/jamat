// Service worker (a classic script: no imports/exports). scripts/build.mjs prepends
//   const BUILD = { version: "<content hash>", files: ["...relative paths..."] };
// Strategy, chosen to avoid ever trapping users on a half-updated app:
//  - One versioned cache per build holds the whole app shell (precached at install, all-or-nothing).
//  - The shell is always served from that cache, so HTML, scripts and styles can never come from different builds.
//  - A new build installs in the background and WAITS. It only takes over when the page asks (SKIP_WAITING after the
//    user clicks Reload) or when every tab is closed, so open forms are never discarded unexpectedly.
//  - Only precached, same-origin GET requests are handled; everything else (other origins, POST, unknown URLs) goes
//    straight to the network. User data lives in IndexedDB and is never touched here.
declare const BUILD: { version: string; files: string[] };

(() => {
  interface Waitable { waitUntil(p: Promise<unknown>): void }
  interface FetchLike extends Waitable { request: Request; respondWith(r: Promise<Response> | Response): void }
  interface MessageLike { data: unknown }
  interface Scope {
    registration: { scope: string };
    skipWaiting(): Promise<void>;
    clients: { claim(): Promise<void> };
    addEventListener(type: "install" | "activate", cb: (e: Waitable) => void): void;
    addEventListener(type: "fetch", cb: (e: FetchLike) => void): void;
    addEventListener(type: "message", cb: (e: MessageLike) => void): void;
  }
  const sw = self as unknown as Scope;

  const PREFIX = "jamat-";
  const CACHE = `${PREFIX}${BUILD.version}`;
  const scope = sw.registration.scope;
  const urls = BUILD.files.map((f) => new URL(f, scope).href);
  const shell = new URL("./", scope).href;
  const known = new Set(urls);

  sw.addEventListener("install", (e) => {
    // `reload` bypasses the HTTP cache so the cache holds exactly what the server has now. addAll is all-or-nothing:
    // if any file fails, this worker does not install and the previous build keeps running.
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(urls.map((u) => new Request(u, { cache: "reload" })))));
  });

  sw.addEventListener("activate", (e) => {
    e.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
        .then(() => sw.clients.claim()),
    );
  });

  sw.addEventListener("message", (e) => {
    const data = e.data as { type?: unknown } | null;
    if (data && data.type === "SKIP_WAITING") void sw.skipWaiting();
  });

  sw.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    url.hash = "";
    const isShell = req.mode === "navigate" && (url.href === shell || url.href === new URL("index.html", scope).href);
    url.search = "";
    if (!isShell && !known.has(url.href)) return;
    const key = isShell ? new URL("index.html", scope).href : url.href;
    e.respondWith(
      caches.open(CACHE)
        .then((c) => c.match(key))
        .then((hit) => hit ?? fetch(req)),
    );
  });
})();
