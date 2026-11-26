import './styles.css';
import { registerLibrary } from './library';
import { App } from './ui/App';

registerLibrary();
const root = document.getElementById('app');
if (!root) throw new Error('Falta el contenedor #app');
const app = new App(root);
// Acceso de depuración solo en desarrollo.
if (import.meta.env.DEV) (window as unknown as { __lab3d: App }).__lab3d = app;
