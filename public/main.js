import { initAuth } from "./js/auth.js";
import { initRouter } from "./js/router.js";
import { mountAdminPanel } from "./js/pages/adminPanel.js";

document.addEventListener("DOMContentLoaded", async () => {
  initRouter();
  mountAdminPanel(document.querySelector("#route-admin-panel"));
  await initAuth();
});

