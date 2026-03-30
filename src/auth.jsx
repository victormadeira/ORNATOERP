import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('erp_token');
        if (token) {
            api.get('/auth/me')
                .then(u => setUser(u))
                .catch(() => { localStorage.removeItem('erp_token'); })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email, senha) => {
        const data = await api.post('/auth/login', { email, senha });
        localStorage.setItem('erp_token', data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = () => {
        localStorage.removeItem('erp_token');
        localStorage.removeItem('erp_page');
        setUser(null);
    };

    useEffect(() => {
        const checkExpiry = () => {
            const token = localStorage.getItem('erp_token');
            if (!token) return;
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp && (payload.exp * 1000) - Date.now() < 300000) {
                    logout();
                }
            } catch {}
        };
        const interval = setInterval(checkExpiry, 60000);
        return () => clearInterval(interval);
    }, []);

    const isAdmin = user?.role === 'admin';
    const isGerente = user?.role === 'gerente' || isAdmin;
    const canEdit = isGerente;

    const updateUser = (data) => setUser(prev => ({ ...prev, ...data }));

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isGerente, canEdit, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}
