window.HubFeed = (function () {
  async function init(host) {
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="muted">Comms Feed scaffolded. Next: posts, targets, comments, reactions, read receipts.</div>
        </div>
      </div>
    `;
  }
  return { init };
})();

