import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/context';
import { api } from '../lib/api';
import { Button, Field } from '../components/ui';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <svg viewBox="0 0 400 400" className="auth-blob"><path d="M212 20c86-4 160 50 172 136 12 84-40 172-122 206-84 34-190 6-232-70C-12 216 6 114 70 64 110 32 160 22 212 20z" fill="#7040F0" /></svg>
        <div className="auth-art-copy">
          <svg width="56" height="56" viewBox="0 0 48 48"><path d="M24 3c11 0 21 7 21 20 0 13-9 22-22 22C10 45 3 36 3 24 3 11 13 3 24 3z" fill="#FFFDF8" /><path d="M24 11c1.1 6.6 3.8 9.6 12 12.5-8.2 2.9-10.9 5.9-12 12.5-1.1-6.6-3.8-9.6-12-12.5 8.2-2.9 10.9-5.9 12-12.5z" fill="#E8D45A" stroke="#302060" strokeWidth="2" /></svg>
          <h2>Every lead,<br />followed up.</h2>
          <p>Capture, qualify and convert enquiries from your website, ads and WhatsApp — in one place.</p>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-card">
          <div className="auth-brand">digital<b>guru</b> <small>CRM</small></div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { user, login, ready } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (ready && user) return <Navigate to={loc.state?.from || '/'} replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(email, password); nav(loc.state?.from || '/', { replace: true }); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your leads.">
      <form onSubmit={submit} className="stack">
        <Field label="Email"><div className="input-ico"><Mail size={17} /><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div></Field>
        <Field label="Password"><div className="input-ico"><Lock size={17} /><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div></Field>
        {err && <p className="form-err">{err}</p>}
        <Button type="submit" loading={busy} className="btn--block btn--lg">Sign in <ArrowRight size={17} /></Button>
        <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('/auth/forgot-password', { method: 'POST', body: { email } }); setDone(r); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Reset password" subtitle="We’ll email you a secure link to set a new password.">
      {done ? (
        <div className="stack">
          <p className="ok-note"><CheckCircle2 size={18} /> If an account exists for {email}, a reset link has been sent. It expires in 1 hour.</p>
          {!done.emailConfigured && <p className="warn-note">Email (SMTP) is not configured on the server yet, so no email was sent. Ask your developer to set SMTP_* variables, or reset the password with <code>npm run create-admin</code>.</p>}
          <Link className="auth-link" to="/login">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <Field label="Email"><div className="input-ico"><Mail size={17} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div></Field>
          {err && <p className="form-err">{err}</p>}
          <Button type="submit" loading={busy} className="btn--block btn--lg">Send reset link</Button>
          <Link className="auth-link" to="/login">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setErr('Passwords do not match'); return; }
    setBusy(true); setErr('');
    try { await api('/auth/reset-password', { method: 'POST', body: { email: sp.get('email'), token: sp.get('token'), password: pw } }); setDone(true); setTimeout(() => nav('/login'), 1800); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters, with a letter and a number.">
      {done ? <p className="ok-note"><CheckCircle2 size={18} /> Password updated. Redirecting to sign in…</p> : (
        <form onSubmit={submit} className="stack">
          <Field label="New password"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoFocus /></Field>
          <Field label="Confirm password"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
          {err && <p className="form-err">{err}</p>}
          <Button type="submit" loading={busy} className="btn--block btn--lg">Update password</Button>
        </form>
      )}
    </AuthShell>
  );
}
