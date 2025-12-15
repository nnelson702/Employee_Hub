// public/js/main.js
import { bootAuthUI } from "./auth.js";
import { initRouter } from "./router.js";

window.addEventListener("DOMContentLoaded", async () => {
  // auth UI wires up sign-in/out + renders app shell when session exists
  await bootAuthUI();

  // router handles tab navigation and page mounting
  initRouter();
});

