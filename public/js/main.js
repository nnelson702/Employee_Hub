import { bootAuthUI, getSession } from "./auth.js";
import { renderAdminPanel } from "./pages/adminPanel.js";

async function boot() {
  await bootAuthUI();

  const session = await getSession();
  if (!session) return;

  const root = document.getElementById("app");
  if (!root) return;

  renderAdminPanel(root, session);
}

boot();
