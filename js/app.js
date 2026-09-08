import * as db from "./db.js";
import { el, formatDateLong, formatTime, formatQty, formatPrice, computeItemTotal, showToast, escapeHtml } from "./helpers.js";
import { openItemModal } from "./itemModal.js";
import { openShoppingMode } from "./shoppingMode.js";
import { openConfirm } from "./confirm.js";

const screenEl = document.getElementById("screen");
const headerTitle = document.getElementById("header-title");
const headerAction = document.getElementById("header-action");
const navButtons = document.querySelectorAll(".nav-btn");

let currentRoute = "home";
let historyDetailId = null; // quand on est sur l'écran de détail d'une session d'historique

// ============================================================================
// Routage
// ============================================================================
async function navigate(route) {
  currentRoute = route;
  historyDetailId = null;
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.route === route));
  document.getElementById("fab-add").hidden = route !== "home" && route !== "courses";
  headerAction.hidden = true;

  if (route === "home") { headerTitle.textContent = "Accueil"; await renderHome(); }
  else if (route === "add") { headerTitle.textContent = "Ajouter un produit"; await renderAdd(); headerAction.hidden = false; headerAction.textContent = "‹"; headerAction.onclick = () => navigate("home"); }
  else if (route === "courses") { headerTitle.textContent = "Courses"; await renderCourses(); }
  else if (route === "products") { headerTitle.textContent = "Produits"; await renderProducts(); }
  else if (route === "history") { headerTitle.textContent = "Historique"; await renderHistory(); }
  else if (route === "settings") { headerTitle.textContent = "Paramètres"; await renderSettings(); }
}

navButtons.forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.route)));

document.getElementById("fab-add").addEventListener("click", () => {
  if (currentRoute === "add") return;
  navigate("add");
});

function refreshCurrentScreen() {
  if (historyDetailId) renderHistoryDetail(historyDetailId);
  else navigate(currentRoute);
}

// ============================================================================
// Écran : Accueil (page stylée avec supermarchés + aliments prédéfinis)
// ============================================================================
async function renderHome() {
  const [items, recurrents, supermarkets, activeSupermarketId, predefinedFoods] = await Promise.all([
    db.getAllItems(),
    db.getRecurrents(),
    db.getSupermarkets(),
    db.getActiveSupermarket(),
    Promise.resolve(db.getPredefinedFoods()),
  ]);
  
  const toBuy = items.filter((i) => !i.purchased).sort(sortByPriorityThenCategory);
  const activeSupermarket = supermarkets.find(sm => sm.id === activeSupermarketId) || supermarkets[0];

  screenEl.innerHTML = "";

  // --- En-tête stylé avec sélection de supermarché ---
  const header = el(`
    <div style="background: linear-gradient(135deg, #1A7A4F 0%, #0f5a3a 100%); color: white; padding: 24px 16px; margin: -16px -16px 16px -16px; border-radius: 0 0 20px 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div>
          <div style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">Mes Courses</div>
          <div style="font-size: 13px; opacity: 0.9;">Gérez vos achats simplement</div>
        </div>
        <div style="font-size: 48px;">${activeSupermarket ? activeSupermarket.icon : "🛒"}</div>
      </div>
      
      <div style="margin-top: 12px;">
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 6px;">Supermarché :</div>
        <select id="supermarket-select" style="width: 100%; padding: 10px; border: none; border-radius: 8px; font-size: 14px; background: rgba(255,255,255,0.2); color: white; cursor: pointer;">
          ${supermarkets.map(sm => `<option value="${sm.id}" ${sm.id === activeSupermarketId ? "selected" : ""}>${sm.icon} ${sm.name}</option>`).join("")}
        </select>
      </div>
    </div>
  `);
  screenEl.appendChild(header);

  // --- Résumé + CTA courses ---
  const summary = el(`
    <div class="summary-card">
      <div class="count">${toBuy.length}</div>
      <div class="label">${toBuy.length <= 1 ? "article à acheter" : "articles à acheter"}</div>
      <button class="btn cta btn-block" data-action="start-shopping" ${toBuy.length === 0 ? "disabled" : ""}>🛒 Commencer les courses</button>
    </div>
  `);
  screenEl.appendChild(summary);

  // --- Aliments prédéfinis ---
  screenEl.appendChild(el(`<div class="section-label">Aliments courants</div>`));
  const predefinedRow = el(`<div class="chip-row"></div>`);
  predefinedFoods.slice(0, 8).forEach((food) => {
    const already = toBuy.some((i) => i.name.toLowerCase() === food.name.toLowerCase());
    const chip = el(`<button type="button" class="chip ${already ? "selected" : ""}">${already ? "✓ " : '<span class="plus">+</span>'}${escapeHtml(food.name)}</button>`);
    chip.addEventListener("click", async () => {
      if (already) return;
      await db.addItem({ name: food.name, category: food.category, unit: food.unit });
      showToast(`« ${food.name} » ajouté`);
      renderHome();
    });
    predefinedRow.appendChild(chip);
  });
  screenEl.appendChild(predefinedRow);

  // --- Ajout rapide ---
  screenEl.appendChild(renderQuickAddBar(recurrents));

  // --- Articles habituels (chips) ---
  if (recurrents.length) {
    screenEl.appendChild(el(`<div class="section-label">Articles habituels</div>`));
    const row = el(`<div class="chip-row"></div>`);
    recurrents.slice(0, 12).forEach((r) => {
      const already = toBuy.some((i) => i.name.toLowerCase() === r.name.toLowerCase());
      const chip = el(`<button type="button" class="chip ${already ? "selected" : ""}">${already ? "✓ " : '<span class="plus">+</span>'}${escapeHtml(r.name)}</button>`);
      chip.addEventListener("click", async () => {
        if (already) return;
        await db.addItem({ name: r.name, category: r.category, unit: r.unit });
        showToast(`« ${r.name} » ajouté`);
        renderHome();
      });
      row.appendChild(chip);
    });
    screenEl.appendChild(row);
  }

  // --- Liste à acheter (visible immédiatement) ---
  screenEl.appendChild(el(`<div class="section-label">À acheter</div>`));
  if (toBuy.length === 0) {
    screenEl.appendChild(el(`
      <div class="empty-state">
        <span class="emoji">✅</span>
        <h3>Tout est acheté !</h3>
        <p>Appuyez sur + pour ajouter un article dès qu'il vous manque quelque chose.</p>
      </div>
    `));
  } else {
    const list = el(`<div class="item-list"></div>`);
    toBuy.forEach((item) => list.appendChild(renderItemRow(item, { onChange: renderHome })));
    screenEl.appendChild(list);
  }

  screenEl.querySelector('[data-action="start-shopping"]')?.addEventListener("click", startShopping);
  
  // --- Gestionnaire de sélection de supermarché ---
  header.querySelector("#supermarket-select")?.addEventListener("change", async (e) => {
    await db.setActiveSupermarket(e.target.value);
    showToast(`Supermarché changé`);
    renderHome();
  });
}

// ============================================================================
// Écran : À acheter (liste complète, groupée par catégorie, gestion fine)
// ============================================================================
// ============================================================================
// Écran : Courses (liste groupée par supermarché)
// ============================================================================
async function renderCourses() {
  const [items, supermarkets] = await Promise.all([db.getAllItems(), db.getSupermarkets()]);
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
  
  header.querySelector('[data-action="start-shopping"]').addEventListener("click", startShopping);
  
  header.querySelector('#export-list').addEventListener("click", async () => {
    const csv = generateListCSV(toBuy, supermarkets);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `liste-courses-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Liste exportée");
  });

  if (toBuy.length === 0) {
    screenEl.appendChild(el(`
      <div class="empty-state">
        <span class="emoji">🛒</span>
        <h3>Rien à acheter</h3>
        <p>Appuyez sur le bouton + en bas à droite pour ajouter un article.</p>
      </div>
    `));
    return;
  }

  // Grouper par supermarché
  const bySupermarket = groupBy(toBuy, (i) => i.supermarketId || "sans-supermarche");
  for (const [smId, smItems] of bySupermarket) {
    const sm = supermarkets.find(s => s.id === smId);
    const smName = sm ? `${sm.icon} ${sm.name}` : "Sans supermarché";
    screenEl.appendChild(el(`<div class="section-label">${escapeHtml(smName)}</div>`));
    
    // Sous-grouper par catégorie
    const byCategory = groupBy(smItems, (i) => i.category);
    for (const [category, catItems] of byCategory) {
      const subLabel = el(`<div style="font-size:13px;color:var(--ink-soft);padding:8px 16px;margin:0 0 8px 0;">${escapeHtml(category)}</div>`);
      screenEl.appendChild(subLabel);
      
      const list = el(`<div class="item-list"></div>`);
      catItems.sort(sortByPriorityThenCategory).forEach((item) => {
        list.appendChild(renderItemRow(item, { onChange: renderCourses, editable: true }));
      });
      screenEl.appendChild(list);
    }
  }
}

function generateListCSV(items, supermarkets) {
  const bySupermarket = groupBy(items, (i) => i.supermarketId || "sans-supermarche");
  let csv = "Supermarché,Catégorie,Produit,Quantité,Unité,Notes\n";
  
  for (const [smId, smItems] of bySupermarket) {
    const sm = supermarkets.find(s => s.id === smId);
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
// Écran : Ajouter produit
// ============================================================================
async function renderAdd() {
  const [categories, supermarkets, activeSupermarketId] = await Promise.all([
    db.getAllCategories(),
    db.getSupermarkets(),
    db.getActiveSupermarket(),
  ]);

  screenEl.innerHTML = "";

  const form = el(`
    <div style="padding: 16px;">
      <div style="margin-bottom: 16px;">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Nom du produit *</label>
        <input id="add-name" type="text" placeholder="Ex: Lait, Café, Pain..." style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Quantité</label>
          <input id="add-qty" type="number" value="1" min="0.1" step="0.1" style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;" />
        </div>
        <div>
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Unité</label>
          <select id="add-unit" style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;">
            ${db.DEFAULT_UNITS.map(u => `<option value="${u}">${u}</option>`).join("")}
          </select>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Catégorie</label>
        <select id="add-category" style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;">
          ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Supermarché</label>
        <select id="add-supermarket" style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;">
          ${supermarkets.map(sm => `<option value="${sm.id}" ${sm.id === activeSupermarketId ? "selected" : ""}>${sm.icon} ${sm.name}</option>`).join("")}
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-soft);">Notes (optionnel)</label>
        <input id="add-notes" type="text" placeholder="Ex: Sans sucre, marque X..." style="width:100%;padding:12px;border:1px solid var(--border-light);border-radius:8px;font-size:15px;box-sizing:border-box;" />
      </div>

      <div style="display:flex;gap:8px;padding-top:8px;">
        <button id="add-submit" class="btn btn-primary btn-block">✓ Ajouter</button>
        <button id="add-reset" class="btn btn-block" style="background:var(--bg-soft);color:var(--ink);border:1px solid var(--border-light);">↻ Réinitialiser</button>
      </div>
    </div>
  `);

  screenEl.appendChild(form);

  const nameInput = form.querySelector("#add-name");
  const qtyInput = form.querySelector("#add-qty");
  const unitSelect = form.querySelector("#add-unit");
  const categorySelect = form.querySelector("#add-category");
  const supermarketSelect = form.querySelector("#add-supermarket");
  const notesInput = form.querySelector("#add-notes");

  form.querySelector("#add-submit").addEventListener("click", async () => {
    if (!nameInput.value.trim()) {
      showToast("Le nom du produit est obligatoire");
      return;
    }
    const selectedCategoryId = categorySelect.value;
    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    
    await db.addItem({
      name: nameInput.value.trim(),
      category: selectedCategory?.name || "Autre",
      quantity: parseFloat(qtyInput.value) || 1,
      unit: unitSelect.value,
      supermarketId: supermarketSelect.value,
      notes: notesInput.value.trim(),
    });
    showToast(`« ${nameInput.value} » ajouté`);
    navigate("courses");
  });

  form.querySelector("#add-reset").addEventListener("click", () => {
    nameInput.value = "";
    qtyInput.value = "1";
    unitSelect.value = "pièce";
    notesInput.value = "";
  });
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
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

  row.querySelector('[data-action="toggle"]').addEventListener("click", async (e) => {
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
function renderQuickAddBar(recurrents) {
  const wrap = el(`
    <div>
      <div class="quick-add-bar">
        <input id="quick-add-input" type="text" placeholder="Ajouter un article... (ex. Lait)" autocomplete="off" />
        <button id="quick-add-btn" disabled>Ajouter</button>
      </div>
      <div id="quick-add-suggestions"></div>
    </div>
  `);

  const input = wrap.querySelector("#quick-add-input");
  const btn = wrap.querySelector("#quick-add-btn");
  const suggestBox = wrap.querySelector("#quick-add-suggestions");

  input.addEventListener("input", () => {
    btn.disabled = !input.value.trim();
    const q = input.value.trim().toLowerCase();
    if (!q) { suggestBox.innerHTML = ""; return; }
    const matches = recurrents.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 4);
    suggestBox.innerHTML = matches.length ? `
      <div class="suggestions-list">
        ${matches.map((m) => `<button type="button" data-fill="${escapeHtml(m.name)}"><b>${escapeHtml(m.name)}</b> · ${escapeHtml(m.category)}</button>`).join("")}
      </div>` : "";
  });

  suggestBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fill]");
    if (!b) return;
    quickAdd(b.dataset.fill);
  });

  async function quickAdd(name) {
    const value = (name ?? input.value).trim();
    if (!value) return;
    await db.addItem({ name: value });
    input.value = "";
    suggestBox.innerHTML = "";
    showToast(`« ${value} » ajouté`);
    renderHome();
  }

  btn.addEventListener("click", () => quickAdd());
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") quickAdd(); });

  return wrap;
}

// ============================================================================
// Mode courses
// ============================================================================
async function startShopping() {
  await openShoppingMode({
    onFinished: () => refreshCurrentScreen(),
  });
}

// ============================================================================
// Écran : Produits (aliments prédéfinis)
// ============================================================================
async function renderProducts() {
  const foods = db.getPredefinedFoods();
  const [items, categories] = await Promise.all([db.getAllItems(), db.getAllCategories()]);
  
  screenEl.innerHTML = "";

  const header = el(`
    <div style="padding:12px 16px;color:var(--ink-soft);font-size:13.5px;margin-bottom:8px;">
      ${foods.length} produits disponibles
    </div>
  `);
  screenEl.appendChild(header);

  // Grouper par catégorie
  const byCategory = groupBy(foods, (f) => f.category);
  
  for (const [category, catFoods] of byCategory) {
    screenEl.appendChild(el(`<div class="section-label">${escapeHtml(category)}</div>`));
    const list = el(`<div class="item-list"></div>`);
    
    catFoods.forEach((food) => {
      const isAdded = items.some((i) => i.name.toLowerCase() === food.name.toLowerCase() && !i.purchased);
      const row = el(`
        <div class="item-row ${isAdded ? "purchased" : ""}" data-id="${food.name}">
          <button class="checkbox ${isAdded ? "checked" : ""}" data-action="toggle" style="cursor:pointer;">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="item-info">
            <div class="item-name">${escapeHtml(food.name)}</div>
            <div class="item-meta"><span>${escapeHtml(food.category)}</span></div>
          </div>
          <div class="item-qty">${food.unit}</div>
        </div>
      `);
      
      row.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
        if (isAdded) return;
        await db.addItem({
          name: food.name,
          category: food.category,
          unit: food.unit,
        });
        showToast(`« ${food.name} » ajouté`);
        renderProducts();
      });
      
      list.appendChild(row);
    });
    screenEl.appendChild(list);
  }
}

// ============================================================================
// Écran : Historique
// ============================================================================
async function renderHistory() {
  const history = await db.getHistory();
  screenEl.innerHTML = "";

  if (history.length === 0) {
    screenEl.appendChild(el(`
      <div class="empty-state">
        <span class="emoji">📚</span>
        <h3>Aucun historique</h3>
        <p>Terminez une session de courses pour la retrouver ici.</p>
      </div>
    `));
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
    
    row.querySelector('[data-action="view-detail"]').addEventListener("click", () => renderHistoryDetail(entry.id));
    
    row.querySelector('[data-action="reuse"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      for (const item of (entry.items || [])) {
        await db.addItem({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          priority: item.priority,
        });
      }
      showToast("Articles ajoutés à votre liste");
      navigate("list");
    });
    
    row.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
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
  if (!entry) { navigate("history"); return; }

  headerTitle.textContent = formatDateLong(entry.date);
  headerAction.hidden = false;
  headerAction.textContent = "‹ Retour";
  headerAction.onclick = () => navigate("history");
  document.getElementById("fab-add").hidden = true;

  screenEl.innerHTML = "";

  screenEl.appendChild(el(`
    <div class="stat-row">
      <div class="stat-box"><div class="num">${entry.totalCount}</div><div class="lbl">Articles</div></div>
      <div class="stat-box"><div class="num">${entry.purchasedCount}</div><div class="lbl">Achetés</div></div>
      <div class="stat-box"><div class="num">${entry.notPurchasedCount ?? (entry.totalCount - entry.purchasedCount)}</div><div class="lbl">Non achetés</div></div>
    </div>
  `));

  screenEl.appendChild(el(`<p style="color:var(--ink-soft);font-size:13.5px;margin:-10px 4px 16px;">Session terminée à ${formatTime(entry.date)}</p>`));

  if (entry.totalPrice) {
    screenEl.appendChild(el(`
      <div class="card" style="padding:16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;">Total dépensé</span>
        <span style="font-weight:800;font-size:19px;color:var(--accent-dark);">${formatPrice(entry.totalPrice)}</span>
      </div>
    `));
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
    
    row.querySelector('[data-action="edit"]').addEventListener("click", async () => {
      const newQty = prompt("Nouvelle quantité :", item.quantity);
      if (newQty && newQty !== item.quantity.toString()) {
        const updatedItems = entry.items.map(i => 
          i.name === item.name ? { ...i, quantity: parseFloat(newQty) || item.quantity } : i
        );
        await db.updateHistoryEntry(entry.id, { items: updatedItems });
        renderHistoryDetail(id);
      }
    });
    
    list.appendChild(row);
  });
  screenEl.appendChild(el(`<div class="section-label">Articles</div>`));
  screenEl.appendChild(list);

  const rebuyBtn = el(`<button class="btn btn-primary btn-block" style="margin-top:20px;">🔁 Racheter cette liste</button>`);
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
  const [categories, recurrents, stockEnabled, supermarkets] = await Promise.all([
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
        <div style="flex:1;">
          <div class="label" data-editable="${!sm.isDefault}" style="${!sm.isDefault ? "cursor:pointer;" : ""}">${sm.icon} ${escapeHtml(sm.name)}</div>
          ${sm.isDefault ? `<div class="sub">Défaut</div>` : `<div class="sub" style="font-size:11px;color:var(--ink-soft);">Cliquez pour renommer</div>`}
        </div>
        ${sm.isDefault ? "" : `<button class="link danger" data-del-sm="${sm.id}">Supprimer</button>`}
      </div>
    `);
    smGroup.appendChild(row);
    
    if (!sm.isDefault) {
      row.querySelector('[data-editable]').addEventListener("click", async () => {
        const newName = prompt("Renommer le supermarché :", sm.name);
        if (newName && newName.trim() !== sm.name) {
          await db.updateSupermarket(sm.id, { name: newName.trim() });
          renderSettings();
        }
      });
    }
  });
  
  const addSmRow = el(`
    <div class="settings-row">
      <input id="new-sm-input" type="text" placeholder="Nouveau supermarché..." style="border:none;flex:1;font-size:15px;outline:none;" />
      <button class="link" id="add-sm-btn">Ajouter</button>
    </div>
  `);
  smGroup.appendChild(addSmRow);
  screenEl.appendChild(smGroup);

  smGroup.querySelectorAll("[data-del-sm]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await openConfirm({ title: "Supprimer ce supermarché ?", confirmLabel: "Supprimer", danger: true });
      if (ok) { await db.deleteSupermarket(btn.dataset.delSm); renderSettings(); }
    });
  });
  addSmRow.querySelector("#add-sm-btn").addEventListener("click", async () => {
    const input = addSmRow.querySelector("#new-sm-input");
    if (!input.value.trim()) return;
    await db.addSupermarket(input.value.trim());
    renderSettings();
  });

  // --- Catégories ---
  screenEl.appendChild(el(`<div class="section-label">Catégories</div>`));
  const catGroup = el(`<div class="settings-group"></div>`);
  categories.forEach((cat) => {
    const row = el(`
      <div class="settings-row" data-cat-id="${cat.id}">
        <div style="flex:1;">
          <div class="label" data-editable="${!cat.isDefault}" style="${!cat.isDefault ? "cursor:pointer;" : ""}">${escapeHtml(cat.name)}</div>
          ${!cat.isDefault ? `<div class="sub" style="font-size:11px;color:var(--ink-soft);">Cliquez pour renommer</div>` : ""}
        </div>
        ${cat.isDefault ? "" : `<button class="link danger" data-del-cat="${cat.id}">Supprimer</button>`}
      </div>
    `);
    catGroup.appendChild(row);
    
    if (!cat.isDefault) {
      row.querySelector('[data-editable]').addEventListener("click", async () => {
        const newName = prompt("Renommer la catégorie :", cat.name);
        if (newName && newName.trim() !== cat.name) {
          await db.updateCategory(cat.id, newName.trim());
          renderSettings();
        }
      });
    }
  });
  const addCatRow = el(`
    <div class="settings-row">
      <input id="new-cat-input" type="text" placeholder="Nouvelle catégorie..." style="border:none;flex:1;font-size:15px;outline:none;" />
      <button class="link" id="add-cat-btn">Ajouter</button>
    </div>
  `);
  catGroup.appendChild(addCatRow);
  screenEl.appendChild(catGroup);

  catGroup.querySelectorAll("[data-del-cat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await openConfirm({ title: "Supprimer la catégorie ?", message: "Les articles existants garderont leur catégorie actuelle.", confirmLabel: "Supprimer", danger: true });
      if (ok) { await db.deleteCategory(btn.dataset.delCat); renderSettings(); }
    });
  });
  addCatRow.querySelector("#add-cat-btn").addEventListener("click", async () => {
    const input = addCatRow.querySelector("#new-cat-input");
    if (!input.value.trim()) return;
    await db.addCategory(input.value.trim());
    renderSettings();
  });

  // --- Articles habituels ---
  screenEl.appendChild(el(`<div class="section-label">Articles habituels</div>`));
  if (recurrents.length === 0) {
    screenEl.appendChild(el(`<p style="color:var(--ink-soft);font-size:14px;margin:0 4px 20px;">Les articles que vous ajoutez souvent apparaîtront ici automatiquement.</p>`));
  } else {
    const recGroup = el(`<div class="settings-group"></div>`);
    recurrents.forEach((r) => {
      recGroup.appendChild(el(`
        <div class="settings-row">
          <div>
            <div class="label">${escapeHtml(r.name)}</div>
            <div class="sub">${escapeHtml(r.category)} · utilisé ${r.useCount}×</div>
          </div>
          <button class="link danger" data-del-rec="${r.id}">Oublier</button>
        </div>
      `));
    });
    screenEl.appendChild(recGroup);
    recGroup.querySelectorAll("[data-del-rec]").forEach((btn) => {
      btn.addEventListener("click", async () => { await db.deleteRecurrent(btn.dataset.delRec); renderSettings(); });
    });
  }

  // --- Fonctionnalités à venir ---
  screenEl.appendChild(el(`<div class="section-label">Bientôt disponible</div>`));
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

  backupGroup.querySelector("#export-btn").addEventListener("click", async () => {
    const data = await db.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
  backupGroup.querySelector("#import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    const ok = await openConfirm({
      title: "Importer les données ?",
      message: "Toutes les données actuelles (listes, historique, catégories) seront remplacées par le contenu du fichier.",
      confirmLabel: "Importer",
      danger: true,
    });
    if (!ok) { importInput.value = ""; return; }
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
  screenEl.appendChild(el(`
    <div class="settings-group">
      <div class="settings-row"><span class="label">Mes Courses</span><span class="sub">v1.0</span></div>
      <div class="settings-row"><span class="label">Stockage</span><span class="sub">Local (hors-ligne)</span></div>
    </div>
  `));
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
