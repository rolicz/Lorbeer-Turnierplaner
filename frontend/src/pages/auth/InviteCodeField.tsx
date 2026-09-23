import Input from "../../ui/primitives/Input";

/** The server's alphabet (`services/invites.py::CODE_ALPHABET`): no `I`, `O`, `0` or `1`. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/**
 * The one invite-code input (built by L7, which needed it first; L5's register and
 * no-group pages use it too). `value` is the **raw** code — up to eight characters of the
 * server's alphabet, the only thing ever posted — and the field shows it as `ABCD-EFGH`.
 * Whatever is typed or pasted is uppercased and stripped of everything outside the
 * alphabet, so `abcd efgh`, `ABCD-EFGH` and a code pasted with a trailing newline all
 * become `ABCDEFGH`.
 */
export default function InviteCodeField({
  value,
  onChange,
  label = "Invite code",
  disabled,
}: {
  value: string;
  onChange: (raw: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const shown = value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
  return (
    <Input
      label={label}
      type="text"
      name="invite-code"
      value={shown}
      onChange={(e) =>
        onChange(
          [...e.target.value.toUpperCase()]
            .filter((ch) => CODE_ALPHABET.includes(ch))
            .join("")
            .slice(0, CODE_LENGTH),
        )
      }
      autoCapitalize="characters"
      autoComplete="one-time-code"
      autoCorrect="off"
      spellCheck={false}
      inputMode="text"
      placeholder="ABCD-EFGH"
      disabled={disabled}
    />
  );
}
