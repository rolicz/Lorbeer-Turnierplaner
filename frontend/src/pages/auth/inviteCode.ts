/**
 * The invite code's shape, in one place (L5; the input that shows it is
 * `InviteCodeField.tsx`, built by L7). A `.ts` beside the component so the component
 * module exports only a component (`react-refresh/only-export-components`).
 */

/** The server's alphabet (`services/invites.py::CODE_ALPHABET`): no `I`, `O`, `0` or `1`. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/**
 * Anything typed, pasted or carried in a link → the raw code the server is sent:
 * uppercased, everything outside the alphabet dropped, at most eight characters. So
 * `abcd efgh`, `ABCD-EFGH` and a code pasted with a trailing newline all become `ABCDEFGH`.
 */
export function normalizeInviteCode(input: string): string {
  return [...input.toUpperCase()]
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, CODE_LENGTH);
}

/** The raw code as the field shows it: `ABCD-EFGH`. */
export function formatInviteCode(raw: string): string {
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
