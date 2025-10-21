'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '@/libs/firebaseConfig';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Garante que o documento do usuário seja criado ou verificado no backend
        // antes de prosseguir e definir o estado do usuário na aplicação.
        try {
          const token = await user.getIdToken();
          await fetch('/api/auth/register-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL
            })
          });
        } catch (error) {
          console.error('Falha ao registrar ou verificar o usuário no backend:', error);
          // Mesmo que o registro falhe, ainda definimos o usuário para que o logout funcione,
          // mas a aplicação pode não funcionar como esperado.
        }
        setUser(user);
      } else {
        // Se não houver usuário, limpa o estado
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = useMemo(() => ({
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logout
  }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
} 