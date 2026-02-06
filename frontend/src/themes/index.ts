const modules = import.meta.glob("./*.css", { eager: true });

const fileNames = Object.keys(modules)
  .map((p) => p.split("/").pop() || "")
  .filter((name) => name.endsWith(".css"))
  .map((name) => name.replace(".css", ""))
  .filter(Boolean);

const preferredOrder = ["blue", "dark", "light", "green"];
const known = new Set(fileNames);

export const THEMES = [
  ...preferredOrder.filter((t) => known.has(t)),
  ...fileNames.filter((t) => !preferredOrder.includes(t)),
];
