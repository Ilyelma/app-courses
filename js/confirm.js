import { el } from "./helpers.js";

export function openConfirm({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = el(`
      <div class="confirm-backdrop">
        <div class="confirm-box">
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" data-action="cancel" style="flex:1">${cancelLabel}</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm" style="flex:1">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(backdrop);

    function close(result) {
      backdrop.remove();
      resolve(result);
    }

    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });
  });
}

// Boîte de saisie de texte. Remplace window.prompt(), qui est ignoré
// silencieusement lorsque l'application est installée en PWA (iOS notamment).
// Résout avec la chaîne saisie, ou null si l'utilisateur annule.
export function openPrompt({ title, label = "", value = "", confirmLabel = "Enregistrer", placeholder = "" }) {
  return new Promise((resolve) => {
    const backdrop = el(`
      <div class="confirm-backdrop">
        <div class="confirm-box">
          <h3>${title}</h3>
          ${label ? `<p style="margin-bottom:10px;">${label}</p>` : ""}
          <input type="text" class="prompt-input" value="${String(value).replace(/"/g, "&quot;")}" placeholder="${placeholder}" />
          <div class="confirm-actions">
            <button class="btn btn-secondary" data-action="cancel" style="flex:1">Annuler</button>
            <button class="btn btn-primary" data-action="confirm" style="flex:1">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(backdrop);

    const input = backdrop.querySelector(".prompt-input");
    input.focus();
    input.select?.();

    function close(result) {
      backdrop.remove();
      resolve(result);
    }

    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      const v = input.value.trim();
      close(v === "" ? null : v);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value.trim();
        close(v === "" ? null : v);
      }
    });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });
  });
}

// Sélecteur d'option unique (ex. choisir le supermarché avant de commencer).
// `options` : [{ value, label }]. Résout avec la valeur choisie, ou null.
export function openChoice({ title, message = "", options }) {
  return new Promise((resolve) => {
    const backdrop = el(`
      <div class="confirm-backdrop">
        <div class="confirm-box">
          <h3>${title}</h3>
          ${message ? `<p>${message}</p>` : ""}
          <div class="choice-list">
            ${options.map((o) => `<button type="button" class="choice-btn" data-value="${String(o.value).replace(/"/g, "&quot;")}">${o.label}</button>`).join("")}
          </div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" data-action="cancel" style="flex:1">Annuler</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(backdrop);

    function close(result) {
      backdrop.remove();
      resolve(result);
    }

    backdrop.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => close(btn.dataset.value));
    });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });
  });
}
