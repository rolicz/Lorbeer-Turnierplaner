import Input from "../../ui/primitives/Input";
import { formatInviteCode, normalizeInviteCode } from "./inviteCode";

/**
 * The one invite-code input (built by L7, which needed it first; L5's register and
 * no-group pages use it too). `value` is the **raw** code — up to eight characters of the
 * server's alphabet, the only thing ever posted — and the field shows it as `ABCD-EFGH`.
 * Whatever is typed or pasted goes through `inviteCode.ts::normalizeInviteCode` (L5 moved
 * the rule there so a `?code=` in a register link is read by the same function).
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
  const shown = formatInviteCode(value);
  return (
    <Input
      label={label}
      type="text"
      name="invite-code"
      value={shown}
      onChange={(e) => onChange(normalizeInviteCode(e.target.value))}
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
