import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quimica3d.laboratorio',
  appName: 'Química 3D',
  webDir: 'dist',
  plugins: {
    // Android 15+ dibuja la app de borde a borde: Capacitor expone los márgenes seguros al CSS
    // (--safe-area-inset-*) y la barra de estado usa iconos claros sobre el fondo oscuro.
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover', style: 'DARK' },
  },
  android: {
    // Sin contenido mixto ni tráfico de red: la app funciona offline.
    allowMixedContent: false,
  },
};

export default config;
