// public/js/utils.js

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  (children || []).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

export function setText(node, text) {
  if (!node) return;
  node.textContent = text ?? "";
}

export function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
export function fmtInt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function monthKeyFromInput(value) {
  // value from <input type="month">: "2025-12"
  if (!value) return null;
  const [y, m] = value.split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return null;
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-01`; // store months as first-of-month date
}

export function isoDate(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function debounce(fn, ms = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ✅ This is what adminPanel.js is asking for
export function escapeHtml(input) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function toast(message, type = "info") {
  const host = document.getElementById("toastHost");
  if (!host) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }
  const item = el("div", { class: `toast ${type}` }, [String(message)]);
  host.appendChild(item);
  setTimeout(() => item.classList.add("show"), 10);
  setTimeout(() => {
    item.classList.remove("show");
    setTimeout(() => item.remove(), 200);
  }, 2600);
}
