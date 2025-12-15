window.HubInsights = (function () {
  async function init(host) {
    host.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="muted">Insights module scaffolded. Next: actual vs goal, MTD pace, ATV.</div>
        </div>
      </div>
    `;
  }
  return { init };
})();

