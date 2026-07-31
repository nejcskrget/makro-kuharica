import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil, Search, X } from "lucide-react";

const PICKER_COLOR = {
  ink: "#20241D",
  paper: "#F6F2E9",
  card: "#FFFFFF",
  forest: "#1B3324",
  sage: "#557A62",
  sageSoft: "#E8EEE7",
  amber: "#C98A2C",
  line: "#E1D9C7",
};

function normalizeSearchValue(value) {
  return value
    .toLocaleLowerCase("sl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[čć]/g, "c")
    .replace(/[š]/g, "s")
    .replace(/[žź]/g, "z")
    .replace(/[đ]/g, "d");
}

function findSelectedSnack(snackCatalog, value) {
  if (!value || value === "custom") return null;
  return snackCatalog.find((snack) => snack.key === value) || snackCatalog[Number(value)] || null;
}

function SnackPickerModal({ allowCustom, onClose, onSelect, open, snackCatalog, value }) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectedSnack = findSelectedSnack(snackCatalog, value);
  const selectedValue = value === "custom" ? "custom" : selectedSnack?.key || value;
  const normalizedQuery = normalizeSearchValue(query.trim());
  const matches = useMemo(() => {
    if (!normalizedQuery) return snackCatalog;
    return snackCatalog.filter((snack) => {
      const searchableValue = `${snack.name} ${snack.category || ""}`;
      return normalizeSearchValue(searchableValue).includes(normalizedQuery);
    });
  }, [normalizedQuery, snackCatalog]);

  useEffect(() => {
    if (!open) return undefined;

    setQuery("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      if (window.matchMedia("(min-width: 640px)").matches) {
        searchRef.current?.focus();
      } else {
        dialogRef.current?.focus();
      }
    }, 0);

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  function selectSnack(nextValue) {
    onSelect(nextValue);
    onClose();
  }

  return createPortal(
    <div
      className="snack-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="snack-picker-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div aria-hidden="true" className="snack-picker-handle" />
        <div className="flex items-start justify-between gap-4 px-5 pt-3 sm:px-6 sm:pt-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: PICKER_COLOR.amber }}>
              Katalog živil
            </p>
            <h2
              className="mt-1 text-[24px] leading-tight"
              id={titleId}
              style={{ color: PICKER_COLOR.forest, fontFamily: "Georgia, serif" }}
            >
              Izberi živilo
            </h2>
            <p className="mt-1 text-[12px]" id={descriptionId} style={{ color: PICKER_COLOR.sage }}>
              Poišči po imenu ali preglej celoten seznam.
            </p>
          </div>
          <button
            aria-label="Zapri izbiro živila"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#E8EEE7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={onClose}
            style={{ color: PICKER_COLOR.forest }}
            type="button"
          >
            <X size={21} />
          </button>
        </div>

        <div className="px-5 pb-3 pt-4 sm:px-6">
          <label className="relative block">
            <span className="sr-only">Išči živilo</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
              color={PICKER_COLOR.sage}
              size={18}
            />
            <input
              autoComplete="off"
              className="w-full rounded-xl py-3 pl-11 pr-10 text-[16px] outline-none transition-shadow focus:ring-2"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Išči npr. jogurt, čips, čokolada ..."
              ref={searchRef}
              style={{
                background: PICKER_COLOR.paper,
                border: `1px solid ${PICKER_COLOR.line}`,
                color: PICKER_COLOR.ink,
                fontFamily: "Georgia, serif",
                "--tw-ring-color": PICKER_COLOR.sage,
              }}
              type="search"
              value={query}
            />
          </label>
        </div>

        <div className="snack-picker-results" role="listbox" aria-label="Živila">
          {allowCustom ? (
            <button
              aria-selected={selectedValue === "custom"}
              className="snack-picker-option"
              onClick={() => selectSnack("custom")}
              role="option"
              style={{ background: selectedValue === "custom" ? PICKER_COLOR.sageSoft : PICKER_COLOR.card }}
              type="button"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: PICKER_COLOR.sageSoft, color: PICKER_COLOR.forest }}
              >
                <Pencil size={16} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[15px]" style={{ color: PICKER_COLOR.forest, fontFamily: "Georgia, serif" }}>
                  Dodaj svoje živilo
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: PICKER_COLOR.sage }}>
                  Ročno vnesi hranilne vrednosti
                </span>
              </span>
              {selectedValue === "custom" ? <Check aria-hidden="true" color={PICKER_COLOR.forest} size={19} /> : null}
            </button>
          ) : null}

          {matches.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Search className="mx-auto mb-3" color={PICKER_COLOR.sage} size={26} strokeWidth={1.5} />
              <p className="text-[17px]" style={{ color: PICKER_COLOR.forest, fontFamily: "Georgia, serif" }}>
                Ni zadetkov
              </p>
              <p className="mt-1 text-[12px]" style={{ color: PICKER_COLOR.sage }}>
                Poskusi z drugim imenom živila.
              </p>
            </div>
          ) : (
            matches.map((snack) => {
              const selected = snack.key === selectedValue;
              return (
                <button
                  aria-selected={selected}
                  className="snack-picker-option"
                  key={snack.key}
                  onClick={() => selectSnack(snack.key)}
                  role="option"
                  style={{ background: selected ? PICKER_COLOR.sageSoft : PICKER_COLOR.card }}
                  type="button"
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span
                      className="block truncate text-[15px]"
                      style={{ color: PICKER_COLOR.ink, fontFamily: "Georgia, serif" }}
                    >
                      {snack.name}
                    </span>
                    {snack.category ? (
                      <span className="mt-0.5 block text-[11px]" style={{ color: PICKER_COLOR.sage }}>
                        {snack.category}
                      </span>
                    ) : null}
                  </span>
                  {selected ? <Check aria-hidden="true" color={PICKER_COLOR.forest} size={19} /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function SnackPickerField({
  allowCustom = false,
  onSelect,
  snackCatalog,
  value,
  variant = "default",
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const selectedSnack = findSelectedSnack(snackCatalog, value);
  const label = value === "custom" ? "Dodaj svoje živilo (ročno)" : selectedSnack?.name || "Izberi živilo";
  const compact = variant === "compact";

  function closePicker() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 text-left outline-none transition-shadow focus-visible:ring-2 ${
          compact ? "rounded-sm px-2 py-1.5 text-[13px]" : "rounded-md px-3 py-2 text-[15px]"
        }`}
        onClick={() => setOpen(true)}
        ref={triggerRef}
        style={{
          background: PICKER_COLOR.paper,
          border: `1px solid ${PICKER_COLOR.line}`,
          color: selectedSnack || value === "custom" ? PICKER_COLOR.ink : PICKER_COLOR.sage,
          fontFamily: "Georgia, serif",
          "--tw-ring-color": PICKER_COLOR.sage,
        }}
        type="button"
      >
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="shrink-0" size={compact ? 16 : 18} />
      </button>
      <SnackPickerModal
        allowCustom={allowCustom}
        onClose={closePicker}
        onSelect={onSelect}
        open={open}
        snackCatalog={snackCatalog}
        value={value}
      />
    </>
  );
}
