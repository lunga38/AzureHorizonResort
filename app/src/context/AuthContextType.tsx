import { createContext } from 'react';
import type { User as CustomUser, UserRole } from '@/types';

export interface AuthContextType {
  user: CustomUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: CustomUser) => void;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);