import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardLoginResponseSchema, sessionUserSchema, type SessionUser } from '@wechiau/shared';
import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from './api/client';

interface AuthValue {
  user: SessionUser;
  signOut(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate');
  return value;
}

/** Shows the sign-in page until an admin is signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => sessionUserSchema.parse(await api('/auth/me')),
    retry: false,
  });
  const signOut = useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      client.clear();
      void client.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (me.isPending) return <p className="centered">Loading…</p>;
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <SignIn />;
    return <p className="centered">{me.error.message}</p>;
  }
  return <AuthContext.Provider value={{ user: me.data, signOut: () => signOut.mutate() }}>{children}</AuthContext.Provider>;
}

function SignIn() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: async () => dashboardLoginResponseSchema.parse(await api('/auth/dashboard/login', { method: 'POST', body: { email, password } })),
    onSuccess: ({ user }) => client.setQueryData(['me'], user),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <main className="signin">
      <form className="card signin-card" onSubmit={submit}>
        <span className="brand-name">Wechiau Poultry</span>
        <h1 className="page-title">Sign in</h1>
        <p className="page-sub">The dashboard is for the admin. Vets and field agents use their phone apps.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {login.isError ? (
          <p className="error" role="alert">
            {login.error.message}
          </p>
        ) : null}
        <button className="button primary" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
