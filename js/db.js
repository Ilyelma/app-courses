// ============================================================================
// db.js — Couche de persistance (IndexedDB)
//
// Schéma :
//   items        : articles de la liste "à acheter" active (+ achetés en attente
//                  de clôture de la session de courses)
//   categories   : catégories (par défaut + créées par l'utilisateur)
//   recurrents   : "articles habituels" mémorisés (nom, catégorie, unité...)
//   history      : sessions de courses terminées (snapshot complet)
//   settings     : paramètres divers (clé/valeur), dont l'architecture
//                  "stock de la maison" (désactivée par défaut)
//
// Toutes les fonctions renvoient des Promises. Aucune dépendance externe :
// l'API IndexedDB native suffit et évite tout risque de rupture hors-ligne.
// ============================================================================

const DB_NAME = "mescourses-db";
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("items")) {
        const items = db.createObjectStore("items", { keyPath: "id" });
        items.createIndex("purchased", "purchased");
        items.createIndex("category", "category");
      }

      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("recurrents")) {
        const rec = db.createObjectStore("recurrents", { keyPath: "id" });
        rec.createIndex("name", "name", { unique: false });
      }

      if (!db.objectStoreNames.contains("history")) {
        const hist = db.createObjectStore("history", { keyPath: "id" });
        hist.createIndex("date", "date");
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("supermarkets")) {
        db.createObjectStore("supermarkets", { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ----------------------------------------------------------------------------
// Catégories par défaut
// ----------------------------------------------------------------------------
const DEFAULT_CATEGORIES = [
  "Alimentation",
  "Boissons",
  "Maison",
  "Entretien",
  "Hygiène",
  "Salle de bain",
  "Cuisine",
  "Bébé",
  "Électronique",
  "Autre",
];

const DEFAULT_UNITS = ["pièce", "kg", "g", "litre", "ml", "paquet", "boîte"];

const DEFAULT_SUPERMARKETS = [
  { name: "Carrefour", icon: "🏬", latitude: null, longitude: null },
  { name: "Marjane", icon: "🛍️", latitude: null, longitude: null },
  { name: "Acima", icon: "🏪", latitude: null, longitude: null },
  { name: "Monoprix", icon: "🏢", latitude: null, longitude: null },
  { name: "Local", icon: "🏘️", latitude: null, longitude: null },
];

const PREDEFINED_FOODS = [
  { name: "Lait", category: "Alimentation", unit: "litre" },
  { name: "Café", category: "Alimentation", unit: "paquet" },
  { name: "Œufs", category: "Alimentation", unit: "pièce" },
  { name: "Pain", category: "Alimentation", unit: "pièce" },
  { name: "Fromage", category: "Alimentation", unit: "kg" },
  { name: "Beurre", category: "Alimentation", unit: "kg" },
  { name: "Yaourt", category: "Alimentation", unit: "pièce" },
  { name: "Crème fraîche", category: "Alimentation", unit: "litre" },
  { name: "Jambon", category: "Alimentation", unit: "kg" },
  { name: "Poulet", category: "Alimentation", unit: "kg" },
  { name: "Poisson", category: "Alimentation", unit: "kg" },
  { name: "Riz", category: "Alimentation", unit: "kg" },
  { name: "Pâtes", category: "Alimentation", unit: "kg" },
  { name: "Tomates", category: "Alimentation", unit: "kg" },
  { name: "Oignons", category: "Alimentation", unit: "kg" },
  { name: "Ail", category: "Alimentation", unit: "pièce" },
  { name: "Sucre", category: "Alimentation", unit: "kg" },
  { name: "Sel", category: "Alimentation", unit: "kg" },
  { name: "Huile", category: "Alimentation", unit: "litre" },
  { name: "Eau", category: "Boissons", unit: "litre" },
  { name: "Jus d'orange", category: "Boissons", unit: "litre" },
  { name: "Vin", category: "Boissons", unit: "litre" },
  { name: "Savon", category: "Hygiène", unit: "pièce" },
  { name: "Shampoing", category: "Hygiène", unit: "litre" },
  { name: "Papier toilette", category: "Maison", unit: "paquet" },
  { name: "Détergent", category: "Entretien", unit: "litre" },
];

// ----------------------------------------------------------------------------
// Initialisation (première ouverture) : peuple les catégories par défaut
// ----------------------------------------------------------------------------
export async function ensureSeeded() {
  const store = await tx("categories");
  const existing = await wrap(store.getAll());
  if (existing.length === 0) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("categories", "readwrite");
      const writeStore = transaction.objectStore("categories");
      for (const name of DEFAULT_CATEGORIES) {
        writeStore.put({ id: uid(), name, isDefault: true });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  const settingsStore = await tx("settings");
  const stockSetting = await wrap(settingsStore.get("stockFeatureEnabled"));
  if (!stockSetting) {
    const ws = await tx("settings", "readwrite");
    ws.put({ key: "stockFeatureEnabled", value: false });
  }

  // Initialiser les supermarchés par défaut
  const supermarketStore = await tx("supermarkets");
  const existingSupermarkets = await wrap(supermarketStore.getAll());
  if (existingSupermarkets.length === 0) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("supermarkets", "readwrite");
      const writeStore = transaction.objectStore("supermarkets");
      for (const sm of DEFAULT_SUPERMARKETS) {
        writeStore.put({ id: uid(), ...sm, isDefault: true });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// ----------------------------------------------------------------------------
// Items (liste "à acheter" active)
// ----------------------------------------------------------------------------
export async function getAllItems() {
  const store = await tx("items");
  return wrap(store.getAll());
}

export async function addItem(partial) {
  const store = await tx("items", "readwrite");
  const item = {
    id: uid(),
    name: partial.name.trim(),
    category: partial.category || "Autre",
    quantity: partial.quantity ?? 1,
    unit: partial.unit || "pièce",
    priority: partial.priority || "normale", // "normale" | "importante"
    notes: partial.notes || "",
    purchased: false,
    priceUnit: partial.priceUnit ?? null,
    priceTotal: partial.priceTotal ?? null,
    createdAt: new Date().toISOString(),
    // --- Architecture "stock maison" (désactivée en v1, prête pour plus tard) ---
    stockEnabled: false,
    stockCurrent: partial.stockCurrent ?? null,
    stockMin: partial.stockMin ?? null,
  };
  store.put(item);
  await touchRecurrent(item.name, item.category, item.unit);
  return item;
}

export async function updateItem(id, changes) {
  const store = await tx("items", "readwrite");
  const current = await wrap(store.get(id));
  if (!current) return null;
  const updated = { ...current, ...changes };
  store.put(updated);
  return updated;
}

export async function deleteItem(id) {
  const store = await tx("items", "readwrite");
  store.delete(id);
}

export async function clearActiveList() {
  const store = await tx("items", "readwrite");
  store.clear();
}

// ----------------------------------------------------------------------------
// Catégories
// ----------------------------------------------------------------------------
export async function getAllCategories() {
  const store = await tx("categories");
  const all = await wrap(store.getAll());
  return all.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function addCategory(name) {
  const store = await tx("categories", "readwrite");
  const cat = { id: uid(), name: name.trim(), isDefault: false };
  store.put(cat);
  return cat;
}

export async function updateCategory(id, name) {
  const store = await tx("categories", "readwrite");
  const current = await wrap(store.get(id));
  if (!current) return null;
  const updated = { ...current, name: name.trim() };
  store.put(updated);
  return updated;
}

export async function deleteCategory(id) {
  const store = await tx("categories", "readwrite");
  store.delete(id);
}

// ----------------------------------------------------------------------------
// Articles habituels (recurrents)
// ----------------------------------------------------------------------------
export async function getRecurrents() {
  const store = await tx("recurrents");
  const all = await wrap(store.getAll());
  return all.sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name, "fr"));
}

async function touchRecurrent(name, category, unit) {
  const store = await tx("recurrents", "readwrite");
  const all = await wrap(store.getAll());
  const existing = all.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.useCount = (existing.useCount || 1) + 1;
    existing.lastUsed = new Date().toISOString();
    existing.category = category || existing.category;
    existing.unit = unit || existing.unit;
    store.put(existing);
  } else {
    store.put({
      id: uid(),
      name,
      category: category || "Autre",
      unit: unit || "pièce",
      useCount: 1,
      lastUsed: new Date().toISOString(),
    });
  }
}

export async function deleteRecurrent(id) {
  const store = await tx("recurrents", "readwrite");
  store.delete(id);
}

// ----------------------------------------------------------------------------
// Historique
// ----------------------------------------------------------------------------
export async function getHistory() {
  const store = await tx("history");
  const all = await wrap(store.getAll());
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function getHistoryEntry(id) {
  const store = await tx("history");
  return wrap(store.get(id));
}

export async function addHistoryEntry(entry) {
  const store = await tx("history", "readwrite");
  const record = {
    id: uid(),
    date: new Date().toISOString(),
    ...entry,
  };
  store.put(record);
  return record;
}

export async function deleteHistoryEntry(id) {
  const store = await tx("history", "readwrite");
  store.delete(id);
}

// ----------------------------------------------------------------------------
// Paramètres
// ----------------------------------------------------------------------------
export async function getSetting(key, fallback = null) {
  const store = await tx("settings");
  const rec = await wrap(store.get(key));
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  const store = await tx("settings", "readwrite");
  store.put({ key, value });
}

// ----------------------------------------------------------------------------
// Export / Import complet (sauvegarde JSON)
// ----------------------------------------------------------------------------
export async function exportAllData() {
  const [items, categories, recurrents, history] = await Promise.all([
    getAllItems(),
    getAllCategories(),
    getRecurrents(),
    getHistory(),
  ]);
  const settingsStore = await tx("settings");
  const settings = await wrap(settingsStore.getAll());

  return {
    exportedAt: new Date().toISOString(),
    version: DB_VERSION,
    items,
    categories,
    recurrents,
    history,
    settings,
  };
}

export async function importAllData(data) {
  const stores = ["items", "categories", "recurrents", "history", "settings"];
  const db = await openDB();
  const transaction = db.transaction(stores, "readwrite");

  for (const storeName of stores) {
    const store = transaction.objectStore(storeName);
    store.clear();
    const records = data[storeName] || [];
    for (const record of records) store.put(record);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

// ----------------------------------------------------------------------------
// Supermarchés
// ----------------------------------------------------------------------------
export async function getSupermarkets() {
  const store = await tx("supermarkets");
  const all = await wrap(store.getAll());
  return all.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function addSupermarket(name, icon = "🏬") {
  const store = await tx("supermarkets", "readwrite");
  const sm = { id: uid(), name: name.trim(), icon, latitude: null, longitude: null, isDefault: false };
  store.put(sm);
  return sm;
}

export async function updateSupermarket(id, changes) {
  const store = await tx("supermarkets", "readwrite");
  const current = await wrap(store.get(id));
  if (!current) return null;
  const updated = { ...current, ...changes };
  store.put(updated);
  return updated;
}

export async function deleteSupermarket(id) {
  const store = await tx("supermarkets", "readwrite");
  store.delete(id);
}

export async function setActiveSupermarket(id) {
  await setSetting("activeSupermarketId", id);
}

export async function getActiveSupermarket() {
  return getSetting("activeSupermarketId", null);
}

// ----------------------------------------------------------------------------
// Aliments prédéfinis
// ----------------------------------------------------------------------------
export function getPredefinedFoods() {
  return PREDEFINED_FOODS;
}

export { DEFAULT_CATEGORIES, DEFAULT_UNITS, DEFAULT_SUPERMARKETS, PREDEFINED_FOODS, uid };
