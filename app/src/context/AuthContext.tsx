import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  // LIVE ref so the auth listener NEVER needs to re-subscribe when user changes.
  // Re-subscribing on [user] caused an infinite loop: every setUser() produced a new
  // object -> effect re-ran -> onAuthStateChanged fired instantly -> setUser() again.
  // That loop saturated the main thread and froze the page on any button press.
  const userRef = useRef<CustomUser | null>(null);

  // Keep the ref in sync AFTER each render (refs must not be written during render)
  useEffect(() => {
    userRef.current = user;
  });

  // Shallow equality helper: prevents setUser(newObject) when content is unchanged,
  // which is what kept re-triggering the effect loop.
  const isSameUser = (a: CustomUser | null, b: CustomUser | null): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.uid === b.uid && a.id === b.id && a.email === b.email && a.role === b.role;
  };

  useEffect(() => {
    let cancelled = false;

    const resolveAndSetUser = (foundUser: CustomUser | null) => {
      if (cancelled) return;
      const current = userRef.current;

      if (foundUser && foundUser.role) {
        // Only set if content actually differs (new object reference alone must NOT trigger a re-render loop)
        if (!isSameUser(current, foundUser)) {
          setUser(foundUser);
          localStorage.setItem('fixedFundingUser', JSON.stringify(foundUser));
        }
      } else {
        // Visitor fallback: build ONE stable object per auth uid so it never loops.
        // If we already have a valid user (manual login/bypass), keep it untouched.
        if (!current || !current.role) {
          const fallback: CustomUser = {
            uid: foundUser?.uid || '',
            id: foundUser?.id || '',
            name: foundUser?.name || 'User',
            role: null,
            status: 'visitor',
          };
          if (!isSameUser(current, fallback)) {
            setUser(fallback);
          }
        }
      }
      setIsLoading(false);
    };

    const unsubscribe = listenForAuthChanges(async (firebaseUser) => {
      if (cancelled) return;

      if (firebaseUser) {
        let foundUser: CustomUser | null = null;
        const current = userRef.current;

        // 1. Check current state first (prevents unnecessary overwrites)
        if (current && (current.uid === firebaseUser.uid || current.id === firebaseUser.uid)) {
          if (current.role) {
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
                foundUser = { uid: firebaseUser.uid, id: firebaseUser.uid, ...userDoc.data() } as CustomUser;
              }
            }

            if (!foundUser || !foundUser.role) {
              const guestDoc = await getDoc(doc(db, 'guests', firebaseUser.uid));
              if (guestDoc.exists()) {
                foundUser = { uid: firebaseUser.uid, id: firebaseUser.uid, ...guestDoc.data() } as CustomUser;
              }
            }
          }
        } catch (err: unknown) {
          const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
          if (code === 'permission-denied') {
            console.error("🔥 Firestore Permission Denied: Check your Security Rules!", err);
          } else {
            console.error("Error fetching user data from Firestore:", err);
          }
        }

        if (foundUser && foundUser.role) {
          resolveAndSetUser(foundUser);
        } else {
          // No Firestore profile: use a stable fallback carrying the real auth UID
          resolveAndSetUser({
            uid: firebaseUser.uid,
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            role: null,
            status: 'visitor',
          } as CustomUser);
        }
      } else {
        // Only clear if we aren't using a "demo/bypass" user (staff accounts often use master password)
        const current = userRef.current;
        if (current && (current.status === 'staff' || current.id === 'bandile_maqeda' || current.uid === 'bandile_maqeda')) {
           // Keep the staff user even if Firebase Auth session is missing (for demo purposes)
        } else if (!isSameUser(current, null)) {
          setUser(null);
          localStorage.removeItem('fixedFundingUser');
        }
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []); // Subscribe exactly ONCE. No [user] dependency = no resubscribe loop.

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