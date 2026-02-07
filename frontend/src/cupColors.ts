export const CUP_COLOR_VAR_BY_KEY: Record<string, string> = {
  // Cup key -> CSS variable name (without rgb(...)).
  // Examples of variables you can use (see themes): 
  // --color-accent, --color-status-bar-green, --color-status-bar-blue,
  // --color-gradient-gold-from, --color-gradient-silver-from, --color-gradient-bronze-from
  default: "--color-gradient-gold-from",
  // New cup -> green (adjust key to your cups.json "key")
  bauernkranz: "--color-cup-green-dark",
};

export function cupColorVarForKey(cupKey: string): string {
  return CUP_COLOR_VAR_BY_KEY[cupKey] ?? "--color-accent";
}

export function rgbFromCssVar(varName: string): string {
  // Theme variables are stored as "r g b" triplets.
  return `rgb(var(${varName}))`;
}
