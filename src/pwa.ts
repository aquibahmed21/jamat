// Service worker registration, update prompt and online/offline state. Native APIs only.

export interface PwaHooks {
  /** A new build is installed and waiting. Call `apply` (after the user agrees) to switch and reload. */
  onUpdateReady(apply: () => void): void;
  onOnlineChange(online: boolean): void;
}

const HOUR = 60 * 60 * 1000;

export function startPwa(hooks: PwaHooks): void {
  hooks.onOnlineChange(navigator.onLine);
  window.addEventListener("online", () => hooks.onOnlineChange(true));
  window.addEventListener("offline", () => hooks.onOnlineChange(false));

  // Best effort: ask the browser not to evict our IndexedDB data under storage pressure.
  void navigator.storage?.persist?.().catch(() => undefined);

  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let reloading = false;
  // The first install also fires controllerchange (clients.claim); only reload when the user applied an update.
  let applying = false;
  sw.addEventListener("controllerchange", () => {
    if (applying && !reloading) {
      reloading = true;
      location.reload();
    }
  });

  const offer = (waiting: ServiceWorker) => hooks.onUpdateReady(() => {
    applying = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  });

  // Relative URL + scope: works under any base path such as /jamat/. `none` makes the browser re-fetch sw.js
  // instead of trusting the HTTP cache, so updates are noticed promptly.
  sw.register("./sw.js", { scope: "./", updateViaCache: "none" }).then((reg) => {
    if (reg.waiting && sw.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed" && sw.controller) offer(installing);
      });
    });
    const check = () => { void reg.update().catch(() => undefined); };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    setInterval(check, HOUR);
  }).catch(() => undefined); // unsupported/insecure context: the app still works, just without offline support
}
