import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthData } from '../shared/types';
import { api, ApiError, setApiUserId } from './api';

interface AuthContextValue {
  auth: AuthData | null;
  loading: boolean;
  error: string;
  login: (username: string, password: string) => Promise<AuthData>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api<AuthData>('/auth/me')
      .then((data) => {
        setApiUserId(data.user.id);
        setAuth(data);
      })
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401)) setError(error.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function login(username: string, password: string) {
    const data = await api<AuthData>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setApiUserId(data.user.id);
    setAuth(data);
    setError('');
    return data;
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    setApiUserId(null);
    setAuth(null);
  }
  return (
    <AuthContext.Provider value={{ auth, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
