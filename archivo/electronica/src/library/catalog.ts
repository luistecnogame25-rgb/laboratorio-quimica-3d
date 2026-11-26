/**
 * Catálogo de componentes PLANIFICADOS (aún sin modelo ni representación 3D).
 * Se muestran en la Biblioteca marcados con su fase para que quede claro qué existe y qué no.
 */
import type { CategoryId } from '../core/types';

export interface PlannedItem {
  name: string;
  category: CategoryId;
  phase: number;
  note?: string;
}

const P = (category: CategoryId, phase: number, names: string[], note?: string): PlannedItem[] => names.map((name) => ({ name, category, phase, note }));

export const PLANNED: PlannedItem[] = [
  ...P('pasivos', 2, ['Potenciómetro', 'Termistor NTC', 'Termistor PTC', 'Fotoresistencia LDR', 'Capacitor de tantalio', 'Bobina / inductor', 'Transformador']),
  ...P('semiconductores', 2, ['Diodo Zener', 'Diodo Schottky', 'MOSFET canal N', 'MOSFET canal P', 'JFET', 'TRIAC', 'SCR', 'Optoacoplador']),
  ...P('integrados', 2, ['Amplificador operacional', 'Temporizador NE555', 'Regulador 7805 / LM317', 'Comparador', 'Puertas lógicas 74HC', 'Multiplexor', 'Decodificador', 'ADC / DAC', 'Controlador de motores L298N / TB6612', 'Driver de potencia']),
  ...P('alimentacion', 2, ['Pila AA', 'Pila AAA', 'Celda 14500', 'Celda 18650', 'Fuente AC', 'Convertidor DC-DC', 'Panel solar']),
  ...P('entrada', 3, ['Teclado matricial', 'Encoder rotativo', 'Joystick', 'Sensor de temperatura', 'Sensor de humedad', 'Sensor de luz', 'Sensor infrarrojo', 'Sensor ultrasónico HC-SR04', 'Sensor de proximidad', 'Sensor PIR', 'Sensor de distancia', 'Sensor de línea', 'Final de carrera']),
  ...P('salida', 3, ['Pantalla LCD 16×2', 'Pantalla OLED', 'Display 7 segmentos', 'Buzzer', 'Altavoz', 'Relé', 'Servomotor', 'Motor DC', 'Motor paso a paso', 'Ventilador', 'Electroválvula']),
  ...P('microcontroladores', 3, ['Arduino UNO', 'Arduino Nano', 'Arduino Mega', 'Raspberry Pi Pico', 'STM32'], 'Simulación de CPU AVR prevista con avr8js (MIT).'),
  ...P('microcontroladores', 3, ['ESP32', 'ESP8266'], 'Requiere un emulador Xtensa: integración por investigar.'),
  ...P('instrumentos', 2, ['Multímetro 3D con puntas', 'Osciloscopio', 'Generador de señales', 'Analizador lógico']),
];
