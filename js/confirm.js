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
