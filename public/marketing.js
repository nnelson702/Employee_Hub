window.HubMarketing = (function () {
  async function init(host) {
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="muted">Marketing & Training scaffolded. Next: upload, categorize, download tracking.</div>
        </div>
      </div>
    `;
  }
  return { init };
})();

