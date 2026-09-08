import * as db from "./db.js";
import { el, formatQty, showToast } from "./helpers.js";

export async function openShoppingMode({ onFinished, supermarketId = null }) {
  const overlay = document.getElementById("shopping-mode");
  overlay.hidden = false;

  // Nom du magasin affiche en en-tete lorsqu'une session est ciblee.
  let supermarketLabel = "";
  if (supermarketId) {
    const sms = await db.getSupermarkets();
    const sm = sms.find((s) => s.id === supermarketId);
    supermarketLabel = sm ? `${sm.icon} ${sm.name}` : "Sans supermarché";
  }

  // Ne retient que les articles du magasin choisi (tous si supermarketId est null).
  function inScope(item) {
    if (!supermarketId) return true;
    return (item.supermarketId || "sans-supermarche") === supermarketId;
  }

  async function render() {
    const items = (await db.getAllItems()).filter(inScope);
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
        ${supermarketLabel ? `<div class="shopping-store">${supermarketLabel}</div>` : ""}
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
    const items = (await db.getAllItems()).filter(inScope);
    const bought = items.filter((i) => i.purchased);
    const notBought = items.filter((i) => !i.purchased);

    const confirmed = await openSessionSummary({ items, bought, notBought });
    if (!confirmed) return;

    const totalPrice = items.reduce((sum, i) => {
      const t = i.priceTotal ? Number(i.priceTotal) : (i.priceUnit ? Number(i.priceUnit) * Number(i.quantity || 1) : 0);
      return sum + (Number.isFinite(t) ? t : 0);
    }, 0);

    await db.addHistoryEntry({
      supermarketId: supermarketId || null,
      supermarketLabel: supermarketLabel || null,
      items: items.map((i) => ({ ...i })),
      totalCount: items.length,
      purchasedCount: bought.length,
      notPurchasedCount: notBought.length,
      totalPrice: totalPrice > 0 ? totalPrice : null,
    });
    // Ne supprime que les articles de la session en cours : les articles
    // rattaches aux autres supermarches restent dans la liste.
    for (const item of items) await db.deleteItem(item.id);

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

// ----------------------------------------------------------------------------
// Popup de fin de session : bilan chiffré avant enregistrement dans l'historique
// ----------------------------------------------------------------------------
function openSessionSummary({ items, bought, notBought }) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("item-modal");
    const total = items.length;
    const pct = total ? Math.round((bought.length / total) * 100) : 0;

    let verdict;
    if (pct === 100) verdict = { emoji: "🎉", text: "Liste complète, tout est acheté !" };
    else if (pct >= 80) verdict = { emoji: "👍", text: "Presque tout y est." };
    else if (pct >= 50) verdict = { emoji: "🙂", text: "Plus de la moitié de la liste." };
    else if (pct > 0) verdict = { emoji: "🧐", text: "Il reste beaucoup à acheter." };
    else verdict = { emoji: "🤔", text: "Aucun article coché." };

    const missingPreview = notBought.slice(0, 5);

    const sheet = el(`
      <div class="modal-sheet modal-centered" role="dialog" aria-modal="true">
        <div class="modal-body" style="padding: 22px 20px 18px;">
          <div style="text-align:center;margin-bottom:18px;">
            <div style="font-size:46px;line-height:1;">${verdict.emoji}</div>
            <div style="font-size:34px;font-weight:800;margin-top:10px;">${pct}%</div>
            <div style="color:var(--ink-soft);font-size:14.5px;margin-top:4px;">${verdict.text}</div>
          </div>

          <div class="progress-track" style="margin-bottom:18px;">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>

          <div class="stat-row" style="margin-bottom:16px;">
            <div class="stat-box"><div class="num">${total}</div><div class="lbl">Articles</div></div>
            <div class="stat-box"><div class="num">${bought.length}</div><div class="lbl">Achetés</div></div>
            <div class="stat-box"><div class="num">${notBought.length}</div><div class="lbl">Manquants</div></div>
          </div>

          ${missingPreview.length ? `
            <div style="background:var(--surface-alt);border-radius:12px;padding:12px 14px;margin-bottom:18px;">
              <div style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:6px;">NON ACHETÉS</div>
              <div style="font-size:14px;line-height:1.6;">
                ${missingPreview.map((i) => escapeHtmlLocal(i.name)).join(", ")}${notBought.length > 5 ? ` et ${notBought.length - 5} autre(s)` : ""}
              </div>
            </div>
          ` : ""}

          <p style="color:var(--ink-soft);font-size:13px;margin:0 0 16px;text-align:center;">
            La liste sera enregistrée dans l'historique puis vidée.
          </p>

          <button class="btn btn-primary btn-block" data-action="confirm" style="margin-bottom:8px;">Terminer et enregistrer</button>
          <button class="btn btn-secondary btn-block" data-action="cancel">Continuer les courses</button>
        </div>
      </div>
    `);

    backdrop.innerHTML = "";
    backdrop.appendChild(sheet);
    backdrop.hidden = false;

    function close(result) {
      backdrop.hidden = true;
      backdrop.innerHTML = "";
      resolve(result);
    }

    sheet.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    sheet.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); }, { once: true });
  });
}

function escapeHtmlLocal(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
