window.HubWalks = (function () {
  async function init(host) {
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="muted">Dept Walks scaffolded. Next: templates, execution flow, issues + image upload.</div>
        </div>
      </div>
    `;
  }
  return { init };
})();

