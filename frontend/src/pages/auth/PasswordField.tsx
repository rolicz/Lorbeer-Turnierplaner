import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import Button from "../../ui/primitives/Button";
import { MIN_PASSWORD_LENGTH } from "./password";

/**
 * The password field with its eye toggle — the **one** in the app (L5 built it for
 * register and reset; L9 moved the login screen and Settings → Password onto it). Built by hand rather than through `Input`: a `<button>` inside
 * `Input`'s `<label>` is invalid HTML (a button is itself labelable), so the label points
 * at the field by id and the toggle sits beside it.
 *
 * `newPassword` adds the live hint "At least {MIN_PASSWORD_LENGTH} characters" (15), muted until the rule is met
 * and `text-text-normal` after — the only rule, stated once, never an error.
 */
export default function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  newPassword = false,
  disabled,
  placeholder,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  newPassword?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const met = value.length >= MIN_PASSWORD_LENGTH;
  return (
    <div>
      <label htmlFor={id} className="input-label block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={newPassword ? "new-password" : "current-password"}
          className="input-field pr-11"
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={newPassword ? `${id}-hint` : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setShow((v) => !v)}
          // Named after its own field: a form with two ("Current password", "New
          // password") must not have two buttons both called "Show password".
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
        >
          {show ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
        </Button>
      </div>
      {newPassword ? (
        <div
          id={`${id}-hint`}
          className={`input-hint ${met ? "text-text-normal" : "text-text-muted"}`}
          data-password-hint={met ? "met" : "unmet"}
        >
          At least {MIN_PASSWORD_LENGTH} characters
        </div>
      ) : null}
    </div>
  );
}
