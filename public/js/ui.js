export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

export function toast(msg, type="info") {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.style.borderColor =
    type === "error" ? "rgba(255,50,70,.45)" :
    type === "success" ? "rgba(35,210,140,.45)" :
    "rgba(255,255,255,.18)";
  el.style.background =
    type === "error" ? "rgba(60,0,10,.55)" :
    type === "success" ? "rgba(0,40,25,.55)" :
    "rgba(0,0,0,.65)";
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(()=> el.classList.add("hidden"), 2200);
}

export function setActiveButton(selector, key, attr="data-route") {
  document.querySelectorAll(selector).forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute(attr) === key);
  });
}

