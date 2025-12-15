function show(msg, kind = "info") {
  const el = document.getElementById("toast");
  el.classList.remove("hidden");
  el.textContent = msg;

  const base = "1px solid rgba(255,255,255,0.10)";
  if (kind === "ok") el.style.border = "1px solid rgba(35,194,107,0.35)";
  else if (kind === "error") el.style.border = "1px solid rgba(255,77,77,0.35)";
  else el.style.border = base;

  clearTimeout(show._t);
  show._t = setTimeout(() => el.classList.add("hidden"), 4500);
}

export const toast = {
  ok: (m) => show(m, "ok"),
  error: (m) => show(m, "error"),
  info: (m) => show(m, "info"),
};
