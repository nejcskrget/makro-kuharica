import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

export function DeleteRecipeDialog({ recipe, deleting, onCancel, onConfirm }) {
  if (!recipe) return null;

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !deleting) onCancel();
    }}>
      <section
        className="admin-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-recipe-title"
        aria-describedby="delete-recipe-description"
      >
        <button className="admin-dialog-close" aria-label="Zapri potrditveno okno" onClick={onCancel} disabled={deleting}>
          <X size={17} />
        </button>
        <span className="admin-delete-dialog__icon"><AlertTriangle size={22} /></span>
        <p className="admin-delete-dialog__eyebrow">TRAJNA ODSTRANITEV</p>
        <h4 id="delete-recipe-title">Izbrišem recept »{recipe.title}«?</h4>
        <p id="delete-recipe-description">
          Recept <strong>{recipe.code}</strong> bo trajno odstranjen. Če je že v katerem jedilniku,
          bo njegova izbira tam samodejno počiščena.
        </p>
        <div className="admin-delete-dialog__actions">
          <button className="admin-secondary-button" onClick={onCancel} disabled={deleting}>Prekliči</button>
          <button className="admin-danger-button" onClick={onConfirm} disabled={deleting}>
            <Trash2 size={15} /> {deleting ? "Brišem ..." : "Da, izbriši recept"}
          </button>
        </div>
      </section>
    </div>
  );
}
