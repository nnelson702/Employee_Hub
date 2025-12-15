import { State } from "./state.js";
import { setActiveButton } from "./ui.js";

export function initRouter() {
  document.querySelectorAll("[data-route]").forEach(btn => {
    btn.addEventListener("click", () => {
      const route = btn.getAttribute("data-route");
      go(route);
    });
  });

  // default
  go(State.route);
}

export function go(route) {
  State.route = route;
  setActiveButton(".nav-item", route, "data-route");

  document.querySelectorAll(".route-view").forEach(v => v.classList.add("hidden"));
  const el = document.querySelector(`#route-${route}`);
  el?.classList.remove("hidden");
}
