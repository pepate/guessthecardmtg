import { useSyncExternalStore } from 'react';
import { subscribe, getUserSnapshot, getRecoverySnapshot } from './session';

export type AuthStatus = 'signed-out' | 'anonymous' | 'permanent';

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getUserSnapshot, () => null);
  const recovery = useSyncExternalStore(subscribe, getRecoverySnapshot, () => false);
  const isAnonymous = !!user?.is_anonymous;
  const status: AuthStatus = !user ? 'signed-out' : isAnonymous ? 'anonymous' : 'permanent';
  return { user, isAnonymous, status, recovery };
}
