/**
 * Thin helpers around the native <dialog> element - no modal library needed.
 *
 * Plain classic script, not an ES module - see utils.js for why. Attaches to window.CH.
 */
window.CH = window.CH || {};

CH.openModal = function openModal(dialogElement) {
  if (!dialogElement.open) {
    dialogElement.showModal();
  }
};

CH.closeModal = function closeModal(dialogElement) {
  if (dialogElement.open) {
    dialogElement.close();
  }
};

/** Wires every dismiss control in a dialog (the header × and the footer Cancel) plus backdrop click. */
CH.setupDialogDismissal = function setupDialogDismissal(dialogElement) {
  dialogElement.querySelectorAll("[data-modal-close]").forEach((closeButton) => {
    closeButton.addEventListener("click", () => CH.closeModal(dialogElement));
  });

  dialogElement.addEventListener("click", (event) => {
    if (event.target === dialogElement) {
      CH.closeModal(dialogElement);
    }
  });
};

function getOrCreateConfirmDialog() {
  let dialog = document.getElementById("confirmDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "confirmDialog";
  dialog.className = "modal";
  dialog.innerHTML = `
    <div class="modal__header">
      <h2 class="modal__title" data-confirm-title></h2>
    </div>
    <div class="modal__body">
      <p class="modal__description" data-confirm-message></p>
    </div>
    <div class="modal__footer">
      <button type="button" class="btn btn--secondary" data-confirm-cancel>Cancel</button>
      <button type="button" class="btn btn--danger" data-confirm-action>Delete</button>
    </div>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

/**
 * Shows the shared confirmation dialog and resolves to true/false based on the user's choice.
 * Reused for every "delete this?" prompt instead of duplicating a confirm modal per page.
 */
CH.confirmAction = function confirmAction({ title, message, confirmLabel = "Delete" }) {
  const dialog = getOrCreateConfirmDialog();
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-message]").textContent = message;
  dialog.querySelector("[data-confirm-action]").textContent = confirmLabel;

  const confirmButton = dialog.querySelector("[data-confirm-action]");
  const cancelButton = dialog.querySelector("[data-confirm-cancel]");

  return new Promise((resolve) => {
    function handleConfirm() {
      cleanup();
      resolve(true);
    }
    function handleCancel() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      confirmButton.removeEventListener("click", handleConfirm);
      cancelButton.removeEventListener("click", handleCancel);
      CH.closeModal(dialog);
    }

    confirmButton.addEventListener("click", handleConfirm);
    cancelButton.addEventListener("click", handleCancel);
    CH.openModal(dialog);
  });
};
