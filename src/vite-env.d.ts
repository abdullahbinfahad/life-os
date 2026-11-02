/// <reference types="vite/client" />

interface Window {
  lifeOSDesktop?: {
    readonly isDesktop: true;
    openOAuth(url: string): Promise<boolean>;
  };
}
