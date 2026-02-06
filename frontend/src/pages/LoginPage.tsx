import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { login } from "../api/auth.api";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const auth = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await login(pw);
      auth.login(res.token, res.role);
      nav("/tournaments");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Login (write access)" variant="outer">
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          label="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="editor/admin password"
        />
        {err && <div className="text-sm text-red-400">{err}</div>}
        <Button disabled={busy || !pw.trim()} className="w-full">
          <i className="fa fa-sign-in md:hidden" aria-hidden="true" />
          <span className="hidden md:inline">{busy ? "Logging in..." : "Login"}</span>
        </Button>
        <div className="text-sm text-text-muted">
          No login is needed for read-only viewing.
        </div>
      </form>
    </Card>
  );
}
