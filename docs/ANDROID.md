# Android (Google Play)

El proyecto nativo está en `android/` y lo genera Capacitor 8 a partir de `capacitor.config.ts`.

| Elemento | Valor actual |
|---|---|
| Identificador (applicationId) | `com.quimica3d.laboratorio` (es permanente una vez publicada la app; confírmalo antes de publicar) |
| Nombre | Química 3D |
| Versión | versionCode 2 / versionName 0.3.0 |
| minSdk / targetSdk | 24 (Android 7.0) / 36 (Android 16, exigido por Google Play para apps nuevas desde el 31 de agosto de 2026) |
| Gradle / JDK | Gradle 9.2.1 con el JDK que incluye Android Studio (Java 25). Capacitor 8 exige Java 21 o superior; Gradle 8.14 no funciona con Java 25, por eso se actualizó el wrapper |
| Icono y pantalla de inicio | Icono adaptativo vectorial (átomo sobre fondo #0C0D10) y SplashScreen de Android 12+ |
| Botón Atrás | Cierra la ficha, el menú o la navegación; después retrocede; en Inicio sale de la app (`@capacitor/app`) |
| Permisos | Solo `INTERNET`, que añade Capacitor por defecto. La app funciona sin conexión; puede retirarse tras comprobarlo en un dispositivo |
| Orientación | Vertical y horizontal (la interfaz se adapta a ambas) |

## Requisitos (gratuitos)

- Node.js 22 o superior. En este equipo hay una copia portátil en `C:\Users\Luis\tools\node-v26.13.1-win-x64`.
- **Android Studio** (instalado en este equipo) con su JDK incluido (jbr, Java 25) y el Android SDK. El JDK 17 del sistema no sirve: Capacitor 8 exige Java 21 o superior.

## Flujo de trabajo

Primero compila la web y cópiala al proyecto nativo:

```powershell
npm run android:sync
```

Después abre Android Studio, desde donde puedes ejecutar la app en un emulador o un teléfono:

```powershell
npm run android:open
```

### APK de pruebas

Con el SDK instalado:

```powershell
cd android; .\gradlew.bat assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

### AAB para Google Play

1. Crea una clave de firma, guárdala fuera del proyecto y haz una copia de seguridad:

```powershell
keytool -genkeypair -v -keystore C:\claves\quimica3d.jks -alias quimica3d -keyalg RSA -keysize 2048 -validity 10000
```

2. Genera el AAB firmado desde Android Studio (*Build ▸ Generate Signed Bundle / APK ▸ Android App Bundle*) o, tras configurar `signingConfigs` con variables de entorno, con:

```powershell
cd android; .\gradlew.bat bundleRelease
```

## Optimización para Android ya aplicada

- Render bajo demanda y una sola escena 3D activa a la vez.
- Geometrías instanciadas (nucleones, electrones y átomos de redes cristalinas con `InstancedMesh`) y nivel de detalle según el número de átomos (menos segmentos por esfera en estructuras grandes).
- Calidad configurable: sombras y densidad de píxeles (Configuración ▸ Calidad gráfica).
- Opción de reducir movimiento.
- Interacción táctil: girar con un dedo, zoom y desplazamiento con dos; pulsación larga para el menú contextual; botón «Colocar» para confirmar en pantallas táctiles; objetivos de al menos 44 px; respeto de las zonas seguras (`safe-area-inset`).
- Sin recursos remotos: los datos de los elementos van incluidos en la app (≈45 kB).

## Ver la app en Android Studio

1. `npm run android:sync` y después `npm run android:open` (o *File ▸ Open* ▸ carpeta `android`).
2. Espera a que termine la sincronización de Gradle; elige el dispositivo y pulsa ▶ (*Run 'app'*).
3. Si el emulador muestra la app en blanco: *Device Manager* ▸ editar el dispositivo ▸ *Graphics: Software*. Su GPU virtual puede fallar en algunos equipos; no es un error de la app.
4. *Settings ▸ Build Tools ▸ Gradle ▸ Gradle JDK* = **jbr** (no uses JDK 17).

La app se ha probado en el emulador Medium Phone (Android 17, API 37): todas las secciones, el 3D, el botón Atrás y los márgenes de la barra de estado.

## Pendiente antes de publicar (sin verificar todavía)

- [ ] **Probar en dispositivos reales** (gama media y tableta): rendimiento, memoria y gestos. Solo se ha probado en el emulador.
- [ ] Dividir el paquete JS (≈960 kB, ≈260 kB comprimido) cargando bajo demanda las vistas 3D.
- [ ] Política de privacidad, formulario de seguridad de los datos, clasificación de contenido, ficha de la tienda y prueba cerrada con testers en Play Console.
