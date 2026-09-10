import { createContext, useContext, type ReactNode } from 'react';
import type { PlatformAdapter } from './types';

const PlatformContext = createContext<PlatformAdapter | null>(null);

export function PlatformProvider({ platform, children }: { platform: PlatformAdapter; children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformAdapter {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('usePlatform must be used inside <PlatformProvider>');
  return platform;
}
