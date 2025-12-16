// public/js/main.js
import { bootAuthUI } from "./auth.js";
import { initRouter } from "./router.js";

window.addEventListener("DOMContentLoaded", async () => {
  await bootAuthUI();
  initRouter();
});
