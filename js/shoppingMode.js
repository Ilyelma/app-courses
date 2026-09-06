import * as db from "./db.js";
import { el, formatQty, showToast } from "./helpers.js";
import { openConfirm } from "./confirm.js";

export async function openShoppingMode({ onFinished }) {
  const overlay = document.getElementById("shopping-mode");
  overlay.hidden = false;

  async function render() {
    const items = await db.getAllItems();
    const toBuy = items.filter((i) => !i.purchased).sort(sortItems);
    const bought = items.filter((i) => i.purchased).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = items.length;
    const done = bought.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    overlay.innerHTML = `
      <div class="shopping-header">
        <div class="shopping-header-top">
          <button data-action="close" class="btn-ghost" style="padding:6px 4px;">Fermer</button>
          <strong>${done} / ${total} articles</strong>
          <span style="width:52px"></span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="shopping-body" id="shopping-body"></div>
      <div class="shopping-footer">
        <button class="btn btn-primary btn-block" data-action="finish" ${total === 0 ? "disabled" : ""}>Terminer les courses</button>
      </div>
    `;

    const body = overlay.querySelector("#shopping-body");

    if (total === 0) {
      body.appendChild(el(`
        <div class="empty-state">
          <span class="emoji">🛒</span>
          <h3>Liste vide</h3>
          <p>Ajoutez des articles avant de commencer vos courses.</p>
        </div>
      `));
    } else {
      if (toBuy.length) {
        body.appendChild(el(`<div class="section-label">À acheter</div>`));
        const list = el(`<div class="item-list"></div>`);
        toBuy.forEach((item) => list.appendChild(renderShoppingRow(item)));
        body.appendChild(list);
      }
      if (bought.length) {
        body.appendChild(el(`<div class="section-label">Achetés</div>`));
        const list = el(`<div class="item-list"></div>`);
        bought.forEach((item) => list.appendChild(renderShoppingRow(item)));
        body.appendChild(list);
      }
    }

    overlay.querySelector('[data-action="close"]').addEventListener("click", () => {
      overlay.hidden = true;
      onFinished?.({ closedWithoutFinishing: true });
    });

    overlay.querySelector('[data-action="finish"]')?.addEventListener("click", handleFinish);
  }

  function renderShoppingRow(item) {
    const row = el(`
      <div class="item-row ${item.purchased ? "purchased" : ""}" data-id="${item.id}">
        <button class="checkbox big ${item.purchased ? "checked" : ""}" data-action="toggle">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            ${item.priority === "importante" ? `<span class="tag-priority">⚠️ Importante</span>` : ""}
            <span>${item.category}</span>
          </div>
        </div>
        <div class="item-qty">${formatQty(item)}</div>
      </div>
    `);
    row.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await db.updateItem(item.id, { purchased: !item.purchased });
      render();
    });
    return row;
  }

  async function handleFinish() {
    const items = await db.getAllItems();
    const bought = items.filter((i) => i.purchased);
    const notBought = items.filter((i) => !i.purchased);

    const confirmed = await openConfirm({
      title: "Terminer les courses ?",
      message: `${bought.length} article(s) acheté(s), ${notBought.length} non acheté(s). La liste sera sauvegardée dans l'historique puis vidée.`,
      confirmLabel: "Terminer",
      danger: false,
    });
    if (!confirmed) return;

    const totalPrice = items.reduce((sum, i) => {
      const t = i.priceTotal ? Number(i.priceTotal) : (i.priceUnit ? Number(i.priceUnit) * Number(i.quantity || 1) : 0);
      return sum + (Number.isFinite(t) ? t : 0);
    }, 0);

    await db.addHistoryEntry({
      items: items.map((i) => ({ ...i })),
      totalCount: items.length,
      purchasedCount: bought.length,
      notPurchasedCount: notBought.length,
      totalPrice: totalPrice > 0 ? totalPrice : null,
    });
    await db.clearActiveList();

    overlay.hidden = true;
    showToast("Courses enregistrées dans l'historique 🎉");
    onFinished?.({ closedWithoutFinishing: false });
  }

  function sortItems(a, b) {
    if (a.priority !== b.priority) return a.priority === "importante" ? -1 : 1;
    return a.category.localeCompare(b.category, "fr");
  }

  function escapeHtml(str) {
    return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  await render();
}
