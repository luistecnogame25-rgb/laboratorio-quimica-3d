import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import './styles.css';
import { App } from './ui/App';
import { closeSheet } from './ui/ElementSheet';

const root = document.getElementById('app');
if (!root) throw new Error('Falta el contenedor #app');
createRoot(root).render(<App />);

/**
 * Botón Atrás de Android: cierra primero lo que esté abierto (ficha, menú contextual,
 * navegación lateral), después retrocede por las secciones y solo sale de la app en Inicio.
 */
if (Capacitor.isNativePlatform()) {
  void NativeApp.addListener('backButton', () => {
    if (document.querySelector('.sheet.open')) return closeSheet();
    const menu = document.querySelector('.ctx-menu');
    if (menu) return menu.remove();
    if (document.querySelector('.nav.open')) return (document.querySelector('.scrim') as HTMLElement | null)?.click();
    const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'inicio';
    if (route === 'inicio') return void NativeApp.exitApp();
    if (history.length > 1) history.back();
    else location.hash = '#/inicio';
  });
}
