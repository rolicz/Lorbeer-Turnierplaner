import { LogIn } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import { login } from "../api/auth.api";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  // Where RequireRole bounced us from; ignore anything that isn't an in-app path.
  const fromState = (location.state as { from?: unknown } | null)?.from;
  const from =
    typeof fromState === "string" &&
    fromState.startsWith("/") &&
    !fromState.startsWith("//") &&
    !fromState.startsWith("/login")
      ? fromState
      : "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(username.trim(), pw);
      auth.login(res.token, res.role, res.player_id, res.player_name);
      nav(from, { replace: true });
    } catch (e: unknown) {
      if (e instanceof Error && e.message) setErr(e.message);
      else setErr("Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Player Login" variant="card">
      <ErrorToastOnError error={err} title="Login failed" />
      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        className="space-y-3"
      >
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="player name"
        />
        <Input
          label="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="profile password"
        />
        {/* The page's only action, so it says what it does at every width — the
            compact-mobile idiom (icon below md) would leave it unnamed (A6). */}
        <Button
          disabled={busy || !pw.trim() || !username.trim()}
          className="inline-flex w-full items-center justify-center gap-2"
        >
          <LogIn size={14} aria-hidden="true" />
          <span>{busy ? "Logging in..." : "Login"}</span>
        </Button>
        <div className="text-sm text-text-muted">
          No login is needed for read-only viewing.
        </div>
      </form>
    </Card>
  );
}
