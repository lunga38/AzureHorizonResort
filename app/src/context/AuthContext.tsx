import React, { useState, useEffect, useCallback } from 'react';
import type { User as CustomUser, UserRole } from '@/types';
import { listenForAuthChanges, db, logoutUser } from '@/services/firebase-services';
import { doc, getDoc } from 'firebase/firestore';
import { AuthContext, type AuthContextType } from './AuthContextType'; // Import from our new file

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback((newUser: CustomUser) => {
    setUser(newUser);
    localStorage.setItem('fixedFundingUser', JSON.stringify(newUser));
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem('fixedFundingUser');
    try {
      await logoutUser();
    } catch (e) {
      console.error('Firebase signOut error:', e);
    }
  }, []);
  useEffect(() => {
    const unsubscribe = listenForAuthChanges(async (firebaseUser) => {
      if (firebaseUser) {
        let foundUser: CustomUser | null = null;
        
        // 1. Check current state first (prevents unnecessary overwrites)
        if (user && (user.uid === firebaseUser.uid || user.id === firebaseUser.uid)) {
          if (user.role) {
            setIsLoading(false);
            return; // Already have a valid user with a role
          }
        }

        // 2. Check localStorage
        const savedUserStr = localStorage.getItem('fixedFundingUser');
        if (savedUserStr) {
          try {
            const savedUser = JSON.parse(savedUserStr);
            if (savedUser.uid === firebaseUser.uid || savedUser.id === firebaseUser.uid || savedUser.email === firebaseUser.email) {
              foundUser = savedUser;
            }
          } catch (e) {
            console.error("Error parsing saved user", e);
          }
        }

        // 3. Try Firestore if not in memory/localStorage
        try {
          if (!foundUser || !foundUser.role) {
            if (firebaseUser.email) {
              const cleanEmail = firebaseUser.email.toLowerCase();
              const userDoc = await getDoc(doc(db, 'users', cleanEmail));
              if (userDoc.exists()) {
                foundUser = { id: firebaseUser.uid, ...userDoc.data() } as CustomUser;
              }
            }
            
            if (!foundUser || !foundUser.role) {
              const guestDoc = await getDoc(doc(db, 'guests', firebaseUser.uid));
              if (guestDoc.exists()) {
                foundUser = { id: firebaseUser.uid, ...guestDoc.data() } as CustomUser;
              }
            }
          }
        } catch (err: any) {
          if (err.code === 'permission-denied') {
            console.error("🔥 Firestore Permission Denied: Check your Security Rules!", err);
          } else {
            console.error("Error fetching user data from Firestore:", err);
          }
        } finally {
          if (foundUser && foundUser.role) {
            setUser(foundUser);
            localStorage.setItem('fixedFundingUser', JSON.stringify(foundUser));
          } else {
            // If we have a Firebase user but no Firestore profile, don't clear the user
            // if we already have one (e.g. from a manual login/bypass)
            if (!user || !user.role) {
              console.warn("No Firestore profile found for authenticated user:", firebaseUser.email);
              setUser({
                uid: firebaseUser.uid,
                id: firebaseUser.uid,
                name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                role: null, // Still null, but we'll handle this in App.tsx
                status: 'visitor'
              } as CustomUser);
            }
          }
          setIsLoading(false);
        }
      } else {
        // Only clear if we aren't using a "demo/bypass" user (staff accounts often use master password)
        if (user && (user.status === 'staff' || user.id === 'bandile_maqeda' || user.uid === 'bandile_maqeda')) {
           // Keep the staff user even if Firebase Auth session is missing (for demo purposes)
        } else {
          setUser(null);
          localStorage.removeItem('fixedFundingUser');
        }
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, [user]); // Add user to dependency to allow checking current state

  const hasRole = useCallback((roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}