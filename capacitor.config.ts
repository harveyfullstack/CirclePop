import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ciphervision.circlepop',
  appName: 'CirclePop',
  webDir: 'dist',
  backgroundColor: '#07061a',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  android: {
    backgroundColor: '#07061a',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#07061a',
      showSpinner: false,
    },
  },
};

export default config;
