import * as db from "./db.js";
import {
  el,
  formatDateLong,
  formatTime,
  formatQty,
  formatPrice,
  computeItemTotal,
  showToast,
  escapeHtml,
} from "./helpers.js";
import { openItemModal } from "./itemModal.js";
import { openShoppingMode } from "./shoppingMode.js";
import { openConfirm, openPrompt, openChoice } from "./confirm.js";

const screenEl = document.getElementById("screen");
const headerTitle = document.getElementById("header-title");
const headerAction = document.getElementById("header-action");
const navButtons = document.querySelectorAll(".nav-btn");

let currentRoute = "home";
let historyDetailId = null;
let activeListStoreId = null; // magasin dont on compose la liste (persiste entre les redessins) // quand on est sur l'écran de détail d'une session d'historique

// ============================================================================
// Routage
// ============================================================================
async function navigate(route) {
  currentRoute = route;
  historyDetailId = null;
  navButtons.forEach((b) =>
    b.classList.toggle("active", b.dataset.route === route),
  );
  document.getElementById("fab-add").hidden = route !== "courses";
  headerAction.hidden = true;

  if (route === "home") {
    headerTitle.textContent = "Accueil";
    await renderHome();
  } else if (route === "list") {
    headerTitle.textContent = "Liste d'achat";
    await renderShoppingList();
  } else if (route === "courses") {
    headerTitle.textContent = "Courses";
    await renderCourses();
  } else if (route === "history") {
    headerTitle.textContent = "Historique";
    await renderHistory();
  } else if (route === "settings") {
    headerTitle.textContent = "Paramètres";
    await renderSettings();
  }
}

navButtons.forEach((btn) =>
  btn.addEventListener("click", () => navigate(btn.dataset.route)),
);

document.getElementById("fab-add").addEventListener("click", () => {
  openItemModal({ onSaved: () => refreshCurrentScreen() });
});

function refreshCurrentScreen() {
  if (historyDetailId) renderHistoryDetail(historyDetailId);
  else navigate(currentRoute);
}

// ============================================================================
// Écran : Accueil — vue d'ensemble des courses à faire, par supermarché.
// Volontairement dépouillé : aucune saisie ici, seulement l'état des lieux.
// ============================================================================
async function renderHome() {
  const [items, supermarkets] = await Promise.all([
    db.getAllItems(),
    db.getSupermarkets(),
  ]);
  const toBuy = items.filter((i) => !i.purchased);

  screenEl.innerHTML = "";

  if (toBuy.length === 0) {
    screenEl.appendChild(
      el(`
      <div class="empty-state">
        <span class="emoji">✅</span>
        <h3>Rien à acheter</h3>
        <p>Votre liste est vide. Ouvrez « Liste d'achat » pour choisir vos produits.</p>
      </div>
    `),
    );
    const goBtn = el(
      `<button class="btn btn-primary btn-block">Composer ma liste</button>`,
    );
    goBtn.addEventListener("click", () => navigate("list"));
    screenEl.appendChild(goBtn);
    return;
  }

  // Total en tête
  screenEl.appendChild(
    el(`
    <div class="summary-card">
      <div class="count">${toBuy.length}</div>
      <div class="label">${toBuy.length <= 1 ? "article à acheter" : "articles à acheter"}</div>
    </div>
  `),
  );

  // Une carte par supermarché concerné
  const byStore = groupBy(toBuy, (i) => i.supermarketId || "sans-supermarche");
  screenEl.appendChild(el(`<div class="section-label">Par supermarché</div>`));

  for (const [storeId, storeItems] of byStore) {
    const sm = supermarkets.find((s) => s.id === storeId);
    const label = sm ? `${sm.icon} ${sm.name}` : "🧺 Sans supermarché";
    const important = storeItems.filter(
      (i) => i.priority === "importante",
    ).length;
    const preview = storeItems
      .slice(0, 4)
      .map((i) => escapeHtml(i.name))
      .join(", ");
    const rest = storeItems.length - 4;

    const card = el(`
      <div class="store-card">
        <div class="store-card-head">
          <span class="store-card-name">${escapeHtml(label)}</span>
          <span class="store-card-count">${storeItems.length}</span>
        </div>
        <div class="store-card-preview">${preview}${rest > 0 ? ` et ${rest} autre${rest > 1 ? "s" : ""}` : ""}</div>
        ${important ? `<div class="store-card-flag">⚠️ ${important} article${important > 1 ? "s" : ""} important${important > 1 ? "s" : ""}</div>` : ""}
      </div>
    `);
    card.addEventListener("click", () => navigate("courses"));
    screenEl.appendChild(card);
  }
}

// ============================================================================
// Écran : À acheter (liste complète, groupée par catégorie, gestion fine)
// ============================================================================
// ============================================================================
// Écran : Courses (liste groupée par supermarché)
// ============================================================================
async function renderCourses() {
  const [items, supermarkets] = await Promise.all([
    db.getAllItems(),
    db.getSupermarkets(),
  ]);
  const toBuy = items.filter((i) => !i.purchased);

  screenEl.innerHTML = "";

  const header = el(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 4px 14px;gap:8px;">
      <span style="color:var(--ink-soft);font-size:14.5px;">${toBuy.length} article${toBuy.length > 1 ? "s" : ""}</span>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary" id="export-list" style="padding:8px 12px;font-size:12.5px;cursor:pointer;">📥 Exporter</button>
        <button class="btn btn-primary" data-action="start-shopping" style="padding:8px 16px;font-size:12.5px;" ${toBuy.length === 0 ? "disabled" : ""}>🛒 Commencer</button>
      </div>
    </div>
  `);
  screenEl.appendChild(header);

  header
    .querySelector('[data-action="start-shopping"]')
    .addEventListener("click", startShopping);

  header.querySelector("#export-list").addEventListener("click", async () => {
    const csv = generateListCSV(toBuy, supermarkets);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `liste-courses-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Liste exportée");
  });

  if (toBuy.length === 0) {
    screenEl.appendChild(
      el(`
      <div class="empty-state">
        <span class="emoji">🛒</span>
        <h3>Rien à acheter</h3>
        <p>Appuyez sur le bouton + en bas à droite pour ajouter un article.</p>
      </div>
    `),
    );
    return;
  }

  // Grouper par supermarché
  const bySupermarket = groupBy(
    toBuy,
    (i) => i.supermarketId || "sans-supermarche",
  );
  for (const [smId, smItems] of bySupermarket) {
    const sm = supermarkets.find((s) => s.id === smId);
    const smName = sm ? `${sm.icon} ${sm.name}` : "Sans supermarché";
    screenEl.appendChild(
      el(`<div class="section-label">${escapeHtml(smName)}</div>`),
    );

    // Sous-grouper par catégorie
    const byCategory = groupBy(smItems, (i) => i.category);
    for (const [category, catItems] of byCategory) {
      const subLabel = el(
        `<div style="font-size:13px;color:var(--ink-soft);padding:8px 16px;margin:0 0 8px 0;">${escapeHtml(category)}</div>`,
      );
      screenEl.appendChild(subLabel);

      const list = el(`<div class="item-list"></div>`);
      catItems.sort(sortByPriorityThenCategory).forEach((item) => {
        list.appendChild(
          renderItemRow(item, { onChange: renderCourses, editable: true }),
        );
      });
      screenEl.appendChild(list);
    }
  }
}

function generateListCSV(items, supermarkets) {
  const bySupermarket = groupBy(
    items,
    (i) => i.supermarketId || "sans-supermarche",
  );
  let csv = "Supermarché,Catégorie,Produit,Quantité,Unité,Notes\n";

  for (const [smId, smItems] of bySupermarket) {
    const sm = supermarkets.find((s) => s.id === smId);
    const smName = sm ? sm.name : "Sans supermarché";

    const byCategory = groupBy(smItems, (i) => i.category);
    for (const [category, catItems] of byCategory) {
      catItems.forEach((item) => {
        const notes = item.notes ? `"${item.notes}"` : "";
        csv += `"${smName}","${category}","${item.name}",${item.quantity},"${item.unit}",${notes}\n`;
      });
    }
  }

  return csv;
}

// ============================================================================
// Écran : Liste d'achat — une liste distincte par supermarché.
//
// Le magasin sélectionné cadre TOUTE la page : la liste affichée, ce que
// « déjà dans la liste » signifie, et la destination des ajouts. Un même
// produit peut donc figurer indépendamment dans la liste de deux magasins.
// ============================================================================
async function renderShoppingList() {
  const [items, recurrents, supermarkets] = await Promise.all([
    db.getAllItems(),
    db.getRecurrents(),
    db.getSupermarkets(),
  ]);

  screenEl.innerHTML = "";

  if (supermarkets.length === 0) {
    screenEl.appendChild(
      el(`
      <div class="empty-state">
        <span class="emoji">🏬</span>
        <h3>Aucun supermarché</h3>
        <p>Créez d'abord un supermarché dans les Paramètres : chaque magasin a sa propre liste d'achat.</p>
      </div>
    `),
    );
    const goBtn = el(
      `<button class="btn btn-primary btn-block">Aller aux paramètres</button>`,
    );
    goBtn.addEventListener("click", () => navigate("settings"));
    screenEl.appendChild(goBtn);
    return;
  }

  // Le magasin courant est mémorisé au niveau du module : il doit survivre
  // aux redessins de la page, sinon chaque ajout renverrait au premier magasin.
  if (!supermarkets.some((s) => s.id === activeListStoreId)) {
    activeListStoreId = supermarkets[0].id;
  }
  const store = supermarkets.find((s) => s.id === activeListStoreId);

  // Portée : uniquement les articles de CE magasin.
  const storeItems = items.filter(
    (i) => !i.purchased && i.supermarketId === activeListStoreId,
  );
  const isInStoreList = (name) =>
    storeItems.some((i) => i.name.toLowerCase() === name.toLowerCase());

  // --- Sélecteur de magasin + recherche ---
  const controls = el(`
    <div class="list-controls">
      <label class="list-store">
        <span>Liste de</span>
        <select id="target-store">
          ${supermarkets.map((sm) => `<option value="${sm.id}" ${sm.id === activeListStoreId ? "selected" : ""}>${sm.icon} ${escapeHtml(sm.name)}</option>`).join("")}
        </select>
      </label>
      <input id="list-search" type="search" placeholder="Rechercher un produit..." autocomplete="off" />
    </div>
  `);
  screenEl.appendChild(controls);

  const storeSelect = controls.querySelector("#target-store");
  const searchInput = controls.querySelector("#list-search");

  storeSelect.addEventListener("change", () => {
    activeListStoreId = storeSelect.value;
    renderShoppingList();
  });

  const resultsEl = el(`<div id="list-results"></div>`);
  screenEl.appendChild(resultsEl);

  async function addProduct({ name, category, unit }) {
    await db.addItem({
      name,
      category,
      unit,
      supermarketId: activeListStoreId,
    });
    showToast(`« ${name} » → ${store.name}`);
    renderShoppingList();
  }

  async function removeProduct(item) {
    await db.deleteItem(item.id);
    showToast(`« ${item.name} » retiré`);
    renderShoppingList();
  }

  // Catalogue = produits prédéfinis + tout ce qui a déjà été acheté,
  // dédoublonné sur le nom. Il est commun à tous les magasins.
  const catalog = (() => {
    const seen = new Map();
    for (const r of recurrents)
      seen.set(r.name.toLowerCase(), {
        name: r.name,
        category: r.category,
        unit: r.unit,
      });
    for (const f of db.getPredefinedFoods())
      if (!seen.has(f.name.toLowerCase())) seen.set(f.name.toLowerCase(), f);
    return [...seen.values()];
  })();

  function catalogRow(product) {
    const already = isInStoreList(product.name);
    const row = el(`
      <div class="item-row ${already ? "purchased" : ""}">
        <button class="checkbox ${already ? "checked" : ""}" data-action="add">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="item-info">
          <div class="item-name">${escapeHtml(product.name)}</div>
          <div class="item-meta"><span>${escapeHtml(product.category)}</span>${already ? `<span> · dans cette liste</span>` : ""}</div>
        </div>
        <div class="item-qty">${escapeHtml(product.unit)}</div>
      </div>
    `);
    row.querySelector('[data-action="add"]').addEventListener("click", () => {
      if (already) return;
      addProduct(product);
    });
    return row;
  }

  function renderResults(query = "") {
    const q = query.trim().toLowerCase();
    resultsEl.innerHTML = "";

    // --- La liste du magasin courant ---
    // Masquee pendant une recherche : seuls les resultats doivent rester visibles.
    if (!q) {
      resultsEl.appendChild(
        el(
          `<div class="section-label">Liste ${escapeHtml(store.icon)} ${escapeHtml(store.name)} · ${storeItems.length} article${storeItems.length > 1 ? "s" : ""}</div>`,
        ),
      );

      if (storeItems.length === 0) {
        resultsEl.appendChild(
          el(
            `<p class="list-empty-note">Cette liste est vide. Choisissez des produits ci-dessous.</p>`,
          ),
        );
      } else {
        const current = el(`<div class="item-list"></div>`);
        storeItems
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "fr"))
          .forEach((item) => {
            const row = el(`
            <div class="item-row">
              <button class="checkbox checked" data-action="remove">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="item-info">
                <div class="item-name">${escapeHtml(item.name)}</div>
                <div class="item-meta"><span>${escapeHtml(item.category)}</span></div>
              </div>
              <div class="item-qty">${formatQty(item)}</div>
            </div>
          `);
            row
              .querySelector('[data-action="remove"]')
              .addEventListener("click", () => removeProduct(item));
            current.appendChild(row);
          });
        resultsEl.appendChild(current);
      }
    }

    // --- Achetés fréquemment ---
    const frequent = recurrents
      .filter(
        (r) =>
          (r.useCount || 0) >= 1 && (!q || r.name.toLowerCase().includes(q)),
      )
      .slice(0, 8);

    if (frequent.length) {
      resultsEl.appendChild(
        el(`<div class="section-label">Achetés fréquemment</div>`),
      );
      const chips = el(`<div class="chip-row"></div>`);
      frequent.forEach((r) => {
        const already = isInStoreList(r.name);
        const chip = el(
          `<button type="button" class="chip ${already ? "selected" : ""}">${already ? "✓ " : '<span class="plus">+</span>'}${escapeHtml(r.name)}</button>`,
        );
        chip.addEventListener("click", () => {
          if (already) return;
          addProduct({ name: r.name, category: r.category, unit: r.unit });
        });
        chips.appendChild(chip);
      });
      resultsEl.appendChild(chips);
    }

    // --- Catalogue ---
    const filtered = q
      ? catalog.filter((p) => p.name.toLowerCase().includes(q))
      : catalog;

    if (filtered.length === 0) {
      resultsEl.appendChild(
        el(`
        <div class="empty-state" style="padding:28px 12px;">
          <span class="emoji">🔍</span>
          <h3>Aucun produit trouvé</h3>
          <p>« ${escapeHtml(query)} » n'est pas dans votre catalogue.</p>
        </div>
      `),
      );
    } else {
      resultsEl.appendChild(
        el(
          `<div class="section-label">${q ? "Résultats" : "Tous les produits"}</div>`,
        ),
      );
      for (const [category, catProducts] of groupBy(
        filtered,
        (p) => p.category,
      )) {
        resultsEl.appendChild(
          el(`<div class="cat-label">${escapeHtml(category)}</div>`),
        );
        const list = el(`<div class="item-list"></div>`);
        catProducts
          .sort((a, b) => a.name.localeCompare(b.name, "fr"))
          .forEach((p) => list.appendChild(catalogRow(p)));
        resultsEl.appendChild(list);
      }
    }

    // --- Produit absent du catalogue ---
    const addBtn = el(`
      <button class="btn btn-secondary btn-block add-missing-btn">
        ➕ ${q ? `Ajouter « ${escapeHtml(query)} »` : "Ajouter un produit absent de la liste"}
      </button>
    `);
    addBtn.addEventListener("click", () => {
      openItemModal({
        presetName: q ? query.trim() : "",
        presetSupermarketId: activeListStoreId,
        onSaved: () => renderShoppingList(),
      });
    });
    resultsEl.appendChild(addBtn);
  }

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderResults(searchInput.value), 120);
  });

  renderResults();
}

// ============================================================================
// Démarrage d'une session de courses.
// Si les articles sont répartis sur plusieurs magasins, on demande lequel :
// la session ne portera alors que sur les articles de ce magasin.
// ============================================================================
async function startShopping() {
  const [items, supermarkets] = await Promise.all([
    db.getAllItems(),
    db.getSupermarkets(),
  ]);
  const toBuy = items.filter((i) => !i.purchased);
  if (toBuy.length === 0) return;

  const usedIds = [
    ...new Set(toBuy.map((i) => i.supermarketId || "sans-supermarche")),
  ];

  let supermarketId = null;
  if (usedIds.length > 1) {
    const options = usedIds.map((id) => {
      const sm = supermarkets.find((s) => s.id === id);
      const count = toBuy.filter(
        (i) => (i.supermarketId || "sans-supermarche") === id,
      ).length;
      const name = sm ? `${sm.icon} ${sm.name}` : "Sans supermarché";
      return {
        value: id,
        label: `${name} — ${count} article${count > 1 ? "s" : ""}`,
      };
    });
    options.push({
      value: "__all__",
      label: `🧺 Tous les supermarchés — ${toBuy.length} articles`,
    });

    supermarketId = await openChoice({
      title: "Dans quel supermarché ?",
      message:
        "Vos articles sont répartis sur plusieurs magasins. Choisissez celui où vous faites vos courses.",
      options,
    });
    if (supermarketId === null) return; // annulé
    if (supermarketId === "__all__") supermarketId = null;
  } else {
    supermarketId = usedIds[0];
  }

  await openShoppingMode({
    supermarketId,
    onFinished: () => refreshCurrentScreen(),
  });
}

// ============================================================================
// Utilitaires de tri / regroupement
// ============================================================================
function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), "fr"),
  );
}

function sortByPriorityThenCategory(a, b) {
  if (a.priority !== b.priority) return a.priority === "importante" ? -1 : 1;
  return new Date(a.createdAt) - new Date(b.createdAt);
}

// ============================================================================
// Ligne d'article commune (Accueil / Liste)
// ============================================================================
function renderItemRow(item, { onChange, editable = false } = {}) {
  const row = el(`
    <div class="item-row" data-id="${item.id}">
      <button class="checkbox" data-action="toggle">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="item-info" data-action="${editable ? "edit" : "none"}">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">
          ${item.priority === "importante" ? `<span class="tag-priority">⚠️ Importante</span>` : ""}
          <span>${escapeHtml(item.category)}</span>
          ${item.notes ? `<span>· ${escapeHtml(item.notes)}</span>` : ""}
        </div>
      </div>
      <div class="item-qty">${formatQty(item)}</div>
    </div>
  `);

  row
    .querySelector('[data-action="toggle"]')
    .addEventListener("click", async (e) => {
      e.stopPropagation();
      await db.updateItem(item.id, { purchased: true });
      showToast(`« ${item.name} » acheté`);
      onChange?.();
    });

  if (editable) {
    row.querySelector('[data-action="edit"]').addEventListener("click", () => {
      openItemEditSheet(item, onChange);
    });
  }

  return row;
}

async function openItemEditSheet(item, onChange) {
  const confirmed = await openConfirm({
    title: item.name,
    message: "Que souhaitez-vous faire avec cet article ?",
    confirmLabel: "Modifier",
    cancelLabel: "Supprimer",
    danger: false,
  });
  // "confirmed" true => Modifier ; false peut être annulation OU suppression.
  // On distingue via un second choix pour éviter une suppression accidentelle.
  if (confirmed) {
    openItemModal({ existingItem: item, onSaved: onChange });
  } else {
    const reallyDelete = await openConfirm({
      title: "Supprimer l'article ?",
      message: `« ${item.name} » sera retiré de votre liste.`,
      confirmLabel: "Supprimer",
      cancelLabel: "Garder",
      danger: true,
    });
    if (reallyDelete) {
      await db.deleteItem(item.id);
      showToast("Article supprimé");
      onChange?.();
    }
  }
}

// ============================================================================
// Barre de saisie rapide (Accueil)
// ============================================================================
// ============================================================================
// Écran : Historique
// ============================================================================
async function renderHistory() {
  const history = await db.getHistory();
  screenEl.innerHTML = "";

  if (history.length === 0) {
    screenEl.appendChild(
      el(`
      <div class="empty-state">
        <span class="emoji">📚</span>
        <h3>Aucun historique</h3>
        <p>Terminez une session de courses pour la retrouver ici.</p>
      </div>
    `),
    );
    return;
  }

  history.forEach((entry) => {
    const row = el(`
      <div class="item-row" style="padding:12px 16px;align-items:center;gap:12px;">
        <div style="flex:1;cursor:pointer;" data-action="view-detail">
          <span class="emoji" style="margin-right:8px;">📅</span>
          <div style="display:inline-block;vertical-align:top;">
            <div class="item-name">${formatDateLong(entry.date)}</div>
            <div class="item-meta">${entry.purchasedCount} acheté${entry.purchasedCount > 1 ? "s" : ""} sur ${entry.totalCount}${entry.totalPrice ? ` · ${formatPrice(entry.totalPrice)}` : ""}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="link" data-action="reuse" style="padding:6px 10px;font-size:12px;white-space:nowrap;">↻ Réutiliser</button>
          <button class="link danger" data-action="delete" style="padding:6px 10px;font-size:12px;">✕</button>
        </div>
      </div>
    `);

    row
      .querySelector('[data-action="view-detail"]')
      .addEventListener("click", () => renderHistoryDetail(entry.id));

    row
      .querySelector('[data-action="reuse"]')
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        for (const item of entry.items || []) {
          await db.addItem({
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            priority: item.priority,
          });
        }
        showToast("Articles ajoutés à votre liste");
        navigate("courses");
      });

    row
      .querySelector('[data-action="delete"]')
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await openConfirm({
          title: "Supprimer cette entrée ?",
          message: "Cet enregistrement sera définitivement supprimé.",
          confirmLabel: "Supprimer",
          danger: true,
        });
        if (ok) {
          await db.deleteHistoryEntry(entry.id);
          renderHistory();
        }
      });

    screenEl.appendChild(row);
  });
}

async function renderHistoryDetail(id) {
  historyDetailId = id;
  const entry = await db.getHistoryEntry(id);
  if (!entry) {
    navigate("history");
    return;
  }

  headerTitle.textContent = formatDateLong(entry.date);
  headerAction.hidden = false;
  headerAction.textContent = "‹ Retour";
  headerAction.onclick = () => navigate("history");
  document.getElementById("fab-add").hidden = true;

  screenEl.innerHTML = "";

  screenEl.appendChild(
    el(`
    <div class="stat-row">
      <div class="stat-box"><div class="num">${entry.totalCount}</div><div class="lbl">Articles</div></div>
      <div class="stat-box"><div class="num">${entry.purchasedCount}</div><div class="lbl">Achetés</div></div>
      <div class="stat-box"><div class="num">${entry.notPurchasedCount ?? entry.totalCount - entry.purchasedCount}</div><div class="lbl">Non achetés</div></div>
    </div>
  `),
  );

  screenEl.appendChild(
    el(
      `<p style="color:var(--ink-soft);font-size:13.5px;margin:-10px 4px 16px;">Session terminée à ${formatTime(entry.date)}</p>`,
    ),
  );

  if (entry.totalPrice) {
    screenEl.appendChild(
      el(`
      <div class="card" style="padding:16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;">Total dépensé</span>
        <span style="font-weight:800;font-size:19px;color:var(--accent-dark);">${formatPrice(entry.totalPrice)}</span>
      </div>
    `),
    );
  }

  const list = el(`<div class="item-list"></div>`);
  entry.items.forEach((item) => {
    const total = computeItemTotal(item);
    const row = el(`
      <div class="item-row ${item.purchased ? "purchased" : ""}" data-item-name="${item.name}">
        <div class="checkbox ${item.purchased ? "checked" : ""}" style="pointer-events:none;">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">
            <span>${escapeHtml(item.category)}</span>
            ${!item.purchased ? `<span style="color:var(--warn);">· non acheté</span>` : ""}
          </div>
        </div>
        <div style="text-align:right;">
          <div class="item-qty">${formatQty(item)}</div>
          ${total ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;">${formatPrice(total)}</div>` : ""}
        </div>
        <button class="link" style="padding:6px 10px;font-size:12px;cursor:pointer;" data-action="edit">✎</button>
      </div>
    `);

    row
      .querySelector('[data-action="edit"]')
      .addEventListener("click", async () => {
        const newQty = await openPrompt({
          title: `Modifier « ${item.name} »`,
          label: "Nouvelle quantité",
          value: item.quantity,
        });
        if (newQty && newQty !== item.quantity.toString()) {
          const updatedItems = entry.items.map((i) =>
            i.name === item.name
              ? { ...i, quantity: parseFloat(newQty) || item.quantity }
              : i,
          );
          await db.updateHistoryEntry(entry.id, { items: updatedItems });
          renderHistoryDetail(id);
        }
      });

    list.appendChild(row);
  });
  screenEl.appendChild(el(`<div class="section-label">Articles</div>`));
  screenEl.appendChild(list);

  const rebuyBtn = el(
    `<button class="btn btn-primary btn-block" style="margin-top:20px;">🔁 Racheter cette liste</button>`,
  );
  rebuyBtn.addEventListener("click", async () => {
    for (const item of entry.items) {
      await db.addItem({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        priority: item.priority,
        supermarketId: item.supermarketId,
      });
    }
    showToast("Articles ajoutés à votre liste actuelle");
    navigate("courses");
  });
  screenEl.appendChild(rebuyBtn);
}

// ============================================================================
// Écran : Paramètres
// ============================================================================
async function renderSettings() {
  const [categories, recurrents, stockEnabled, supermarkets] =
    await Promise.all([
      db.getAllCategories(),
      db.getRecurrents(),
      db.getSetting("stockFeatureEnabled", false),
      db.getSupermarkets(),
    ]);

  screenEl.innerHTML = "";

  // --- Supermarchés ---
  screenEl.appendChild(el(`<div class="section-label">Mes supermarchés</div>`));
  const smGroup = el(`<div class="settings-group"></div>`);
  supermarkets.forEach((sm) => {
    const row = el(`
      <div class="settings-row" data-sm-id="${sm.id}">
        <button class="settings-edit" data-rename-sm style="flex:1;text-align:left;background:none;border:none;font-family:inherit;cursor:pointer;padding:0;">
          <div class="label">${sm.icon} ${escapeHtml(sm.name)}</div>
          <div class="sub">Appuyez pour renommer</div>
        </button>
        <button class="link danger" data-del-sm="${sm.id}">Supprimer</button>
      </div>
    `);

    row
      .querySelector("[data-rename-sm]")
      .addEventListener("click", async () => {
        const newName = await openPrompt({
          title: "Renommer le supermarché",
          value: sm.name,
          placeholder: "Nom du supermarché",
        });
        if (newName && newName !== sm.name) {
          await db.updateSupermarket(sm.id, { name: newName });
          showToast("Supermarché renommé");
          renderSettings();
        }
      });

    row.querySelector("[data-del-sm]").addEventListener("click", async () => {
      const ok = await openConfirm({
        title: "Supprimer ce supermarché ?",
        message:
          "Les articles qui lui sont rattachés seront regroupés sous « Sans supermarché ».",
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (ok) {
        await db.deleteSupermarket(sm.id);
        renderSettings();
      }
    });

    smGroup.appendChild(row);
  });

  const addSmRow = el(`
    <div class="settings-row">
      <input id="new-sm-input" type="text" placeholder="Nouveau supermarché..." style="border:none;flex:1;font-size:16px;outline:none;background:none;" />
      <button class="link" id="add-sm-btn">Ajouter</button>
    </div>
  `);
  smGroup.appendChild(addSmRow);
  screenEl.appendChild(smGroup);

  async function submitNewSupermarket() {
    const input = addSmRow.querySelector("#new-sm-input");
    if (!input.value.trim()) return;
    await db.addSupermarket(input.value.trim());
    renderSettings();
  }
  addSmRow
    .querySelector("#add-sm-btn")
    .addEventListener("click", submitNewSupermarket);
  addSmRow.querySelector("#new-sm-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitNewSupermarket();
    }
  });

  // --- Catégories ---
  screenEl.appendChild(el(`<div class="section-label">Catégories</div>`));
  const catGroup = el(`<div class="settings-group"></div>`);
  categories.forEach((cat) => {
    const row = el(`
      <div class="settings-row" data-cat-id="${cat.id}">
        <button class="settings-edit" data-rename-cat style="flex:1;text-align:left;background:none;border:none;font-family:inherit;cursor:pointer;padding:0;">
          <div class="label">${escapeHtml(cat.name)}</div>
          <div class="sub">Appuyez pour renommer</div>
        </button>
        <button class="link danger" data-del-cat="${cat.id}">Supprimer</button>
      </div>
    `);

    row
      .querySelector("[data-rename-cat]")
      .addEventListener("click", async () => {
        const newName = await openPrompt({
          title: "Renommer la catégorie",
          value: cat.name,
          placeholder: "Nom de la catégorie",
        });
        if (newName && newName !== cat.name) {
          await db.updateCategory(cat.id, newName);
          showToast("Catégorie renommée");
          renderSettings();
        }
      });

    row.querySelector("[data-del-cat]").addEventListener("click", async () => {
      const ok = await openConfirm({
        title: "Supprimer la catégorie ?",
        message: "Les articles existants garderont leur catégorie actuelle.",
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (ok) {
        await db.deleteCategory(cat.id);
        renderSettings();
      }
    });

    catGroup.appendChild(row);
  });

  const addCatRow = el(`
    <div class="settings-row">
      <input id="new-cat-input" type="text" placeholder="Nouvelle catégorie..." style="border:none;flex:1;font-size:16px;outline:none;background:none;" />
      <button class="link" id="add-cat-btn">Ajouter</button>
    </div>
  `);
  catGroup.appendChild(addCatRow);
  screenEl.appendChild(catGroup);

  async function submitNewCategory() {
    const input = addCatRow.querySelector("#new-cat-input");
    if (!input.value.trim()) return;
    await db.addCategory(input.value.trim());
    renderSettings();
  }
  addCatRow
    .querySelector("#add-cat-btn")
    .addEventListener("click", submitNewCategory);
  addCatRow.querySelector("#new-cat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitNewCategory();
    }
  });

  // --- Articles habituels ---
  screenEl.appendChild(
    el(`<div class="section-label">Articles habituels</div>`),
  );
  if (recurrents.length === 0) {
    screenEl.appendChild(
      el(
        `<p style="color:var(--ink-soft);font-size:14px;margin:0 4px 20px;">Les articles que vous ajoutez souvent apparaîtront ici automatiquement.</p>`,
      ),
    );
  } else {
    const recGroup = el(`<div class="settings-group"></div>`);
    recurrents.forEach((r) => {
      recGroup.appendChild(
        el(`
        <div class="settings-row">
          <div>
            <div class="label">${escapeHtml(r.name)}</div>
            <div class="sub">${escapeHtml(r.category)} · utilisé ${r.useCount}×</div>
          </div>
          <button class="link danger" data-del-rec="${r.id}">Oublier</button>
        </div>
      `),
      );
    });
    screenEl.appendChild(recGroup);
    recGroup.querySelectorAll("[data-del-rec]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await db.deleteRecurrent(btn.dataset.delRec);
        renderSettings();
      });
    });
  }

  // --- Fonctionnalités à venir ---
  screenEl.appendChild(
    el(`<div class="section-label">Bientôt disponible</div>`),
  );
  const upcoming = el(`
    <div class="settings-group">
      <div class="settings-row">
        <div>
          <div class="label">Suivi de stock</div>
          <div class="sub">Ajout automatique quand le stock est bas</div>
        </div>
        <button class="switch ${stockEnabled ? "on" : ""}" disabled></button>
      </div>
      <div class="settings-row">
        <div>
          <div class="label">Rappels</div>
          <div class="sub">Notifications pour vérifier vos produits</div>
        </div>
        <button class="switch" disabled></button>
      </div>
    </div>
  `);
  screenEl.appendChild(upcoming);

  // --- Sauvegarde ---
  screenEl.appendChild(el(`<div class="section-label">Sauvegarde</div>`));
  const backupGroup = el(`
    <div>
      <div class="settings-group">
        <div class="settings-row">
          <span class="label">Exporter mes données</span>
          <button class="link" id="export-btn">Exporter</button>
        </div>
        <div class="settings-row">
          <span class="label">Importer mes données</span>
          <button class="link" id="import-btn">Importer</button>
        </div>
      </div>
      <input type="file" id="import-file" accept="application/json" class="hidden" />
    </div>
  `);
  screenEl.appendChild(backupGroup);

  backupGroup
    .querySelector("#export-btn")
    .addEventListener("click", async () => {
      const data = await db.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mes-courses-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Export téléchargé");
    });

  const importInput = backupGroup.querySelector("#import-file");
  backupGroup
    .querySelector("#import-btn")
    .addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    const ok = await openConfirm({
      title: "Importer les données ?",
      message:
        "Toutes les données actuelles (listes, historique, catégories) seront remplacées par le contenu du fichier.",
      confirmLabel: "Importer",
      danger: true,
    });
    if (!ok) {
      importInput.value = "";
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await db.importAllData(data);
      showToast("Données importées");
      navigate("home");
    } catch (err) {
      showToast("Fichier invalide");
    }
    importInput.value = "";
  });

  // --- À propos ---
  screenEl.appendChild(el(`<div class="section-label">À propos</div>`));
  screenEl.appendChild(
    el(`
    <div class="settings-group">
      <div class="settings-row"><span class="label">Mes Courses</span><span class="sub">v1.0</span></div>
      <div class="settings-row"><span class="label">Stockage</span><span class="sub">Local (hors-ligne)</span></div>
    </div>
  `),
  );
}

// ============================================================================
// Service worker (hors-ligne)
// ============================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // L'application reste utilisable même si le service worker échoue à s'enregistrer.
    });
  });
}

// ============================================================================
// Démarrage
// ============================================================================
(async function init() {
  await db.ensureSeeded();
  await navigate("home");
})();
