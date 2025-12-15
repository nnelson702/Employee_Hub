export function createRouter({ onRoute }) {
  let started = false;

  function getRoute() {
    const h = location.hash || "#goals_admin";
    return h.replace("#", "");
  }

  async function run() {
    const key = getRoute();
    await onRoute(key);
  }

  async function start() {
    if (started) return;
    started = true;

    window.addEventListener("hashchange", () => run().catch(console.error));
    await run();
  }

  function refresh() {
    run().catch(console.error);
  }

  return { start, refresh };
}

