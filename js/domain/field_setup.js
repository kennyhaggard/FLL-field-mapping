export const DOCK_ORDER = Object.freeze(["city", "farm", "mine"]);
export const DEFAULT_FIELD_SETUP = Object.freeze({ city: "m15", farm: "m13", mine: "m14" });
export const FIELD_MODELS = Object.freeze({
  m13: { name: "Keystone", label: "Keystone Species", number: "M13" },
  m14: { name: "Seeds", label: "Seeds of Renewal", number: "M14" },
  m15: { name: "House", label: "Biocentric Architecture", number: "M15" }
});

// Repair partial/old imported data while retaining each valid unique assignment.
export function normalizeFieldSetup(raw) {
  const result = {};
  const available = new Set(Object.keys(FIELD_MODELS));
  for (const dock of DOCK_ORDER) {
    const model = raw?.[dock];
    if (available.has(model)) {
      result[dock] = model;
      available.delete(model);
    }
  }
  for (const dock of DOCK_ORDER) {
    if (result[dock]) continue;
    const model = available.has(DEFAULT_FIELD_SETUP[dock])
      ? DEFAULT_FIELD_SETUP[dock] : available.values().next().value;
    result[dock] = model;
    available.delete(model);
  }
  return Object.fromEntries(DOCK_ORDER.map(dock => [dock, result[dock]]));
}

export function fieldSetupKey(raw) {
  const setup = normalizeFieldSetup(raw);
  return DOCK_ORDER.map(dock => setup[dock]).join("_");
}

export function swapDockModel(raw, dock, model) {
  const setup = normalizeFieldSetup(raw);
  if (!DOCK_ORDER.includes(dock) || !Object.hasOwn(FIELD_MODELS, model)) return setup;
  const other = DOCK_ORDER.find(key => setup[key] === model);
  [setup[dock], setup[other]] = [setup[other], setup[dock]];
  return setup;
}
