const modules = import.meta.glob("./*.css", { eager: true });

const fileNames = Object.keys(modules)
  .map((p) => p.split("/").pop() || "")
  .filter((name) => name.endsWith(".css"))
  .map((name) => name.replace(".css", ""))
  .filter((name) => Boolean(name) && name !== "defaults");

const preferredOrder = ["blue", "dark", "red", "light", "green"];
const known = new Set(fileNames);

export const THEMES = [
  ...preferredOrder.filter((t) => known.has(t)),
  ...fileNames.filter((t) => !preferredOrder.includes(t)),
];
