export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function qs(sel, el = document) {
  return el.querySelector(sel);
}

export function qsa(sel, el = document) {
  return [...el.querySelectorAll(sel)];
}

export function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
