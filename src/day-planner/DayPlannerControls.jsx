import React from "react";
import { Plus, X } from "lucide-react";
import { SnackPickerField } from "../SnackPickerField";

const COLOR = {
  ink: "#20241D",
  paper: "#F6F2E9",
  card: "#FFFFFF",
  forest: "#1B3324",
  sage: "#557A62",
  sageSoft: "#E8EEE7",
  amberSoft: "#F3E3D3",
  line: "#E1D9C7",
  danger: "#B5533C",
};

const ADJUSTMENT_OPTIONS = [
  { value: "zajtrk", label: "Zajtrk" },
  { value: "kosilo", label: "Kosilo" },
  { value: "vecerja", label: "Večerja" },
];

function findSnack(snackCatalog, value) {
  if (!value || value === "custom") return null;
  return snackCatalog.find((snack) => snack.key === value) || snackCatalog[Number(value)] || null;
}

function formatMacro(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function MealAdjustmentControl({ dayTarget, onChange, value }) {
  return (
    <section
      className="mb-3 rounded-md px-4 py-4"
      style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
    >
      <h2
        className="text-[14px]"
        style={{ color: COLOR.forest, fontFamily: "Georgia, serif" }}
      >
        Kateri obrok naj se samodejno prilagodi?
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: COLOR.sage }}>
        Pri izbranem obroku prilagodimo priloge, da dan skupaj doseže {dayTarget} kcal.
      </p>
      <div
        aria-label="Obrok za samodejno prilagoditev"
        className="mt-3 grid grid-cols-3 gap-1 rounded-lg p-1"
        role="group"
        style={{ background: COLOR.paper, border: `1px solid ${COLOR.line}` }}
      >
        {ADJUSTMENT_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              aria-pressed={selected}
              className="min-w-0 rounded-md px-2 py-2.5 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              key={option.value}
              onClick={() => onChange(option.value)}
              style={{
                background: selected ? COLOR.forest : "transparent",
                color: selected ? "#FFFFFF" : COLOR.sage,
                fontFamily: "Georgia, serif",
                outlineColor: COLOR.sage,
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CustomSnackFields({ index, snack, onUpdate }) {
  return (
    <div className="mt-3 space-y-2">
      <input
        className="w-full rounded-md px-3 py-2 text-[14px] outline-none focus:ring-2"
        onChange={(event) => onUpdate(index, "customName", event.target.value)}
        placeholder="Ime živila (npr. domača pica)"
        style={{
          background: COLOR.paper,
          border: `1px solid ${COLOR.line}`,
          fontFamily: "Georgia, serif",
          "--tw-ring-color": COLOR.sage,
        }}
        value={snack.customName || ""}
      />
      <p className="text-[10px] leading-relaxed" style={{ color: COLOR.sage }}>
        Prepiši hranilne vrednosti na 100 g z embalaže, nato spodaj vnesi svojo količino.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { field: "customKcal", label: "Kcal/100 g" },
          { field: "customP", label: "B (g)" },
          { field: "customF", label: "M (g)" },
          { field: "customC", label: "OH (g)" },
        ].map((input) => (
          <label className="block text-[9px]" key={input.field} style={{ color: COLOR.sage }}>
            {input.label}
            <input
              className="mt-1 w-full rounded-md px-2 py-1.5 text-[12px] outline-none focus:ring-2"
              min="0"
              onChange={(event) => onUpdate(index, input.field, event.target.value)}
              style={{
                background: COLOR.paper,
                border: `1px solid ${COLOR.line}`,
                fontFamily: "'Courier New', monospace",
                "--tw-ring-color": COLOR.sage,
              }}
              type="number"
              value={snack[input.field] || ""}
            />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[10px]" style={{ color: COLOR.sage }}>
        Tvoja količina:
        <input
          className="w-20 rounded-md px-2 py-1.5 text-right text-[12px] outline-none focus:ring-2"
          min="0"
          onChange={(event) => onUpdate(index, "qty", event.target.value)}
          placeholder="100"
          style={{
            background: COLOR.paper,
            border: `1px solid ${COLOR.line}`,
            fontFamily: "'Courier New', monospace",
            "--tw-ring-color": COLOR.sage,
          }}
          type="number"
          value={snack.qty || ""}
        />
        g
      </label>
    </div>
  );
}

export function SnackSection({ onAdd, onRemove, onUpdate, snackCatalog, snacks }) {
  return (
    <section
      className="mb-3 overflow-hidden rounded-md"
      style={{ background: COLOR.card, border: `1px solid ${COLOR.line}` }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div>
          <h2
            className="text-[16px] uppercase"
            style={{ color: COLOR.forest, fontFamily: "Georgia, serif" }}
          >
            Malica / sladica
          </h2>
          <p className="mt-0.5 text-[10px]" style={{ color: COLOR.sage }}>
            Po želji lahko dodaš več živil.
          </p>
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={onAdd}
          style={{ background: COLOR.forest, color: "#FFFFFF", outlineColor: COLOR.sage }}
          type="button"
        >
          <Plus size={15} />
          Dodaj
        </button>
      </div>

      {snacks.length === 0 ? (
        <p
          className="border-t px-4 py-4 text-[12px] leading-relaxed"
          style={{ borderColor: COLOR.line, color: COLOR.sage }}
        >
          Brez malice — pritisni »Dodaj«, če želiš vključiti npr. jabolko ali proteinski puding.
        </p>
      ) : (
        <div className="space-y-3 border-t px-4 py-4" style={{ borderColor: COLOR.line }}>
          {snacks.map((snack, index) => {
            const item = findSnack(snackCatalog, snack.snackIdx);
            const custom = snack.snackIdx === "custom";
            return (
              <div
                className="rounded-lg p-3"
                key={index}
                style={{ background: custom ? COLOR.sageSoft : COLOR.paper, border: `1px solid ${COLOR.line}` }}
              >
                <div className="flex items-center gap-2">
                  <SnackPickerField
                    allowCustom
                    onSelect={(value) => onUpdate(index, "snackIdx", value)}
                    snackCatalog={snackCatalog}
                    value={snack.snackIdx}
                  />
                  {custom ? null : (
                    <>
                      <input
                        aria-label={`Količina malice ${index + 1} v gramih`}
                        className="w-16 rounded-md px-2 py-2 text-right text-[13px] outline-none focus:ring-2"
                        disabled={!item}
                        min="0"
                        onChange={(event) => onUpdate(index, "qty", event.target.value)}
                        placeholder={item ? String(item.defaultQty) : "g"}
                        style={{
                          background: COLOR.card,
                          border: `1px solid ${COLOR.line}`,
                          fontFamily: "'Courier New', monospace",
                          opacity: item ? 1 : 0.55,
                          "--tw-ring-color": COLOR.sage,
                        }}
                        type="number"
                        value={snack.qty || ""}
                      />
                      <span className="text-[11px]" style={{ color: COLOR.sage }}>
                        g
                      </span>
                    </>
                  )}
                  <button
                    aria-label={`Odstrani malico ${index + 1}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2"
                    onClick={() => onRemove(index)}
                    style={{ color: COLOR.danger, outlineColor: COLOR.danger }}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
                {custom ? <CustomSnackFields index={index} onUpdate={onUpdate} snack={snack} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MacroValue({ label, unit, value }) {
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-[9px] uppercase tracking-wide" style={{ color: "#9DB2A3" }}>
        {label}
      </p>
      <p className="mt-1 text-[18px] text-white" style={{ fontFamily: "'Courier New', monospace" }}>
        {formatMacro(value)}
        <span className="ml-1 text-[11px]" style={{ color: "#CFE0D2" }}>
          {unit}
        </span>
      </p>
    </div>
  );
}

export function DayMacroSummary({ adjustSlot, dayTotal, overBudget, slotLabels }) {
  return (
    <section className="mb-5 overflow-hidden rounded-md">
      <div className="grid grid-cols-2 gap-x-2 gap-y-4 px-4 py-4 sm:grid-cols-4" style={{ background: COLOR.forest }}>
        <MacroValue label="Skupaj dan" unit="kcal" value={dayTotal.kcal} />
        <MacroValue label="Beljakovine" unit="g" value={dayTotal.p} />
        <MacroValue label="Maščobe" unit="g" value={dayTotal.f} />
        <MacroValue label="OH" unit="g" value={dayTotal.c} />
      </div>
      {overBudget ? (
        <p className="px-4 py-3 text-[11px] leading-relaxed" style={{ background: COLOR.amberSoft, color: "#8A4B23" }}>
          Ostala dva obroka in malica skoraj porabijo celoten dnevni proračun. Za{" "}
          {slotLabels[adjustSlot].toLowerCase()} bo zato ostalo zelo malo kalorij. Izberi drug obrok za prilagoditev
          ali manjšo malico.
        </p>
      ) : null}
    </section>
  );
}
