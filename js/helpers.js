export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function formatDateLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatQty(item) {
  const unit = item.unit && item.unit !== "pièce" ? ` ${item.unit}` : "";
  return `${item.quantity}${unit}`;
}

export function formatPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(2).replace(/\.00$/, "")} DH`;
}

export function computeItemTotal(item) {
  if (item.priceTotal !== null && item.priceTotal !== undefined && item.priceTotal !== "") {
    return Number(item.priceTotal);
  }
  if (item.priceUnit !== null && item.priceUnit !== undefined && item.priceUnit !== "") {
    return Number(item.priceUnit) * Number(item.quantity || 1);
  }
  return null;
}

export function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
