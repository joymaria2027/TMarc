import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.deliveryaceinsight',
  appName: 'delivery-ace-insight',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#faf7f4',
    allowsLinkPreview: false,
  },
  server: {
    url: 'https://42a1fdf0-ee8c-46ad-8aa1-934e86c28aa1.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};

export default config;
