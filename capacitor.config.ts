import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.muvidate.app',
  appName: 'MuviDate',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
