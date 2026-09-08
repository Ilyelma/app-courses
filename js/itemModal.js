import * as db from "./db.js";
import { el, showToast } from "./helpers.js";

// Ouvre le popup (centré) d'ajout / édition d'un article.
// `existingItem` (optionnel) : si fourni, le formulaire est pré-rempli et
// la validation met à jour l'article au lieu d'en créer un nouveau.
export async function openItemModal({ existingItem = null, onSaved } = {}) {
  const backdrop = document.getElementById("item-modal");
  const [categories, recurrents, supermarkets, activeSupermarketId] = await Promise.all([
    db.getAllCategories(),
    db.getRecurrents(),
    db.getSupermarkets(),
    db.getActiveSupermarket(),
  ]);

  const isEdit = !!existingItem;
  let selectedPriority = existingItem?.priority || "normale";

  const currentSupermarketId = existingItem?.supermarketId || activeSupermarketId;

  const categoryOptions = categories
    .map((c) => `<option value="${c.name}" ${existingItem?.category === c.name ? "selected" : ""}>${c.name}</option>`)
    .join("");

  const unitOptions = db.DEFAULT_UNITS
    .map((u) => `<option value="${u}" ${existingItem?.unit === u ? "selected" : ""}>${u}</option>`)
    .join("");

  const supermarketOptions = supermarkets
    .map((s) => `<option value="${s.id}" ${s.id === currentSupermarketId ? "selected" : ""}>${s.icon} ${s.name}</option>`)
    .join("");

  const sheet = el(`
    <div class="modal-sheet modal-centered" role="dialog" aria-modal="true">
      <div class="modal-head">
        <button data-action="cancel">Annuler</button>
        <h2>${isEdit ? "Modifier" : "Nouvel article"}</h2>
        <button data-action="save" class="save-btn">${isEdit ? "Enregistrer" : "Ajouter"}</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="f-name">Nom de l'article</label>
          <input id="f-name" type="text" placeholder="Ex. Lait" autocomplete="off" value="${existingItem?.name ?? ""}" />
        </div>
        <div id="f-suggestions"></div>

        <div class="row-2">
          <div class="field">
            <label for="f-qty">Quantité</label>
            <input id="f-qty" type="number" min="0" step="any" value="${existingItem?.quantity ?? 1}" />
          </div>
          <div class="field">
            <label for="f-unit">Unité</label>
            <select id="f-unit">${unitOptions}</select>
          </div>
        </div>

        <div class="field">
          <label for="f-category">Catégorie</label>
          <select id="f-category">${categoryOptions}</select>
        </div>

        <div class="field">
          <label for="f-supermarket">Supermarché</label>
          <select id="f-supermarket">${supermarketOptions}</select>
        </div>

        <button type="button" class="collapsible-toggle" data-action="expand">+ Plus d'options (priorité, prix, notes)</button>

        <div id="f-more" class="hidden">
          <div class="field">
            <label>Priorité</label>
            <div class="priority-toggle">
              <button type="button" data-priority="normale" class="${selectedPriority === "normale" ? "selected normale" : ""}">Normale</button>
              <button type="button" data-priority="importante" class="${selectedPriority === "importante" ? "selected importante" : ""}">⚠️ Importante</button>
            </div>
          </div>

          <div class="row-2">
            <div class="field">
              <label for="f-price-unit">Prix unitaire (DH)</label>
              <input id="f-price-unit" type="number" min="0" step="0.01" placeholder="Facultatif" value="${existingItem?.priceUnit ?? ""}" />
            </div>
            <div class="field">
              <label for="f-price-total">Prix total (DH)</label>
              <input id="f-price-total" type="number" min="0" step="0.01" placeholder="Facultatif" value="${existingItem?.priceTotal ?? ""}" />
            </div>
          </div>

          <div class="field">
            <label for="f-notes">Notes (facultatif)</label>
            <textarea id="f-notes" placeholder="Ex. marque préférée, taille...">${existingItem?.notes ?? ""}</textarea>
          </div>
        </div>
      </div>
    </div>
  `);

  backdrop.innerHTML = "";
  backdrop.appendChild(sheet);
  backdrop.hidden = false;

  const nameInput = sheet.querySelector("#f-name");
  const suggestionsBox = sheet.querySelector("#f-suggestions");
  const saveBtn = sheet.querySelector(".save-btn");

  if (isEdit) {
    sheet.querySelector("#f-more").classList.remove("hidden");
    sheet.querySelector('[data-action="expand"]').remove();
  }

  function renderSuggestions() {
    const q = nameInput.value.trim().toLowerCase();
    if (!q || isEdit) { suggestionsBox.innerHTML = ""; return; }
    const matches = recurrents.filter((r) => r.name.toLowerCase().includes(q) && r.name.toLowerCase() !== q).slice(0, 4);
    if (matches.length === 0) { suggestionsBox.innerHTML = ""; return; }
    suggestionsBox.innerHTML = `
      <div class="suggestions-list">
        ${matches.map((m) => `<button type="button" data-fill="${m.id}"><b>${m.name}</b> · ${m.category}</button>`).join("")}
      </div>
    `;
  }

  nameInput.addEventListener("input", renderSuggestions);
  nameInput.focus();

  suggestionsBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fill]");
    if (!btn) return;
    const match = recurrents.find((r) => r.id === btn.dataset.fill);
    if (!match) return;
    nameInput.value = match.name;
    sheet.querySelector("#f-category").value = match.category;
    sheet.querySelector("#f-unit").value = match.unit;
    suggestionsBox.innerHTML = "";
  });

  sheet.querySelector('[data-action="expand"]')?.addEventListener("click", (e) => {
    sheet.querySelector("#f-more").classList.remove("hidden");
    e.target.remove();
  });

  sheet.querySelectorAll("[data-priority]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedPriority = btn.dataset.priority;
      sheet.querySelectorAll("[data-priority]").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.classList.toggle(b.dataset.priority, b === btn);
      });
    });
  });

  function close() {
    backdrop.hidden = true;
    backdrop.innerHTML = "";
  }

  sheet.querySelector('[data-action="cancel"]').addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); }, { once: true });

  async function save() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const payload = {
      name,
      category: sheet.querySelector("#f-category")?.value || existingItem?.category || "Autre",
      quantity: Number(sheet.querySelector("#f-qty")?.value || existingItem?.quantity || 1),
      unit: sheet.querySelector("#f-unit")?.value || existingItem?.unit || "pièce",
      supermarketId: sheet.querySelector("#f-supermarket")?.value || null,
      priority: selectedPriority,
      notes: sheet.querySelector("#f-notes")?.value?.trim() || "",
      priceUnit: sheet.querySelector("#f-price-unit")?.value || null,
      priceTotal: sheet.querySelector("#f-price-total")?.value || null,
    };

    if (isEdit) {
      await db.updateItem(existingItem.id, payload);
      showToast("Article modifié");
    } else {
      await db.addItem(payload);
      showToast("Article ajouté");
    }
    close();
    onSaved?.();
  }

  saveBtn.addEventListener("click", save);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
  });
}
