# Android: APK, AAB y Google Play

El proyecto nativo está en `android/` (generado por Capacitor 8.6). La app web compilada (`dist/`) se copia dentro del APK y se ejecuta en un WebView **sin conexión**.

Configuración actual (`android/variables.gradle`, `android/app/build.gradle`):

| Elemento | Valor |
|---|---|
| applicationId | `com.laboratorio3d.app` (cámbialo antes de publicar: es permanente en Play) |
| minSdkVersion | 24 (Android 7.0) |
| targetSdkVersion / compileSdk | 36 (Android 16) |
| versionCode / versionName | 1 / 0.1.0 |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.14.3 (requiere JDK 17) |

## 1. Requisitos en tu computadora (gratuitos)

1. **Node.js LTS** (ya hay una copia portátil en `C:\Users\Luis\tools\node-v26.13.1-win-x64`; o instálalo desde nodejs.org).
2. **JDK 17** (ya instalado en este equipo: Java 17.0.12).
3. **Android Studio** (gratuito) con *Android SDK Platform 36* y *Android SDK Build‑Tools*. En este equipo **no** está instalado: es el único requisito que falta para compilar.

## 2. Sincronizar la app web con Android

Desde la carpeta `laboratorio-3d`:

```powershell
npm run android:sync
```

(Compila la web y ejecuta `npx cap sync android`.)

## 3. APK de depuración (para probar en tu teléfono)

Con Android Studio: `npm run android:open` → *Build ▸ Build App Bundle(s) / APK(s) ▸ Build APK(s)*.

O por línea de comandos, con el SDK instalado (Android Studio crea `android/local.properties` con `sdk.dir`):

```powershell
cd android; .\gradlew.bat assembleDebug
```

Resultado: `android/app/build/outputs/apk/debug/app-debug.apk`. Instálalo activando *Opciones de desarrollador ▸ Depuración USB* y ejecutando `adb install` o copiando el archivo al teléfono.

## 4. AAB de publicación (Google Play)

1. Crea una clave de firma (guárdala fuera del proyecto y haz copia de seguridad; si la pierdes no podrás actualizar la app salvo con *Play App Signing*):

```powershell
keytool -genkeypair -v -keystore C:\claves\laboratorio3d.jks -alias lab3d -keyalg RSA -keysize 2048 -validity 10000
```

2. En Android Studio: *Build ▸ Generate Signed Bundle / APK ▸ Android App Bundle*, selecciona la clave y la variante *release*.
   O por línea de comandos (configurando `signingConfigs` en `android/app/build.gradle` con variables de entorno, nunca con contraseñas en el repositorio):

```powershell
cd android; .\gradlew.bat bundleRelease
```

Resultado: `android/app/build/outputs/bundle/release/app-release.aab`.

## 5. Permisos

| Permiso | Motivo | Estado |
|---|---|---|
| `INTERNET` | Lo añade Capacitor por defecto | La app **no** usa red. Puede retirarse tras verificar en un dispositivo que el servidor local de Capacitor funciona sin él (pendiente de probar). |

No se usan cámara, ubicación, almacenamiento externo, contactos ni publicidad.

## 6. Qué falta para publicar oficialmente (no verificado aún)

La aplicación **no está publicada** ni se ha comprobado frente a todos los requisitos de Play. Lista de pendientes:

- [ ] Instalar Android Studio/SDK, compilar y probar el APK en dispositivos reales (gama media y tableta).
- [ ] Cuenta de desarrollador de Google Play (requiere un pago único de registro: decisión tuya).
- [ ] Definir `applicationId` definitivo, nombre, icono adaptativo y pantalla de inicio (actualmente los de la plantilla de Capacitor).
- [ ] Firma de la app y alta en *Play App Signing*.
- [ ] Política de privacidad publicada en una URL (obligatoria aunque la app no recopile datos) y formulario de *Seguridad de los datos*.
- [ ] Clasificación de contenido (cuestionario IARC) y público objetivo (si incluye menores, cumplir la política de Familias).
- [ ] Ficha de Play: descripción, capturas de teléfono y tableta, gráfico destacado.
- [ ] Pruebas cerradas: las cuentas personales nuevas deben realizar una prueba cerrada con un mínimo de testers durante un periodo antes de producción (consultar los requisitos vigentes en Play Console).
- [ ] Revisar accesibilidad (tamaños táctiles ≥ 48 dp, contraste) y comportamiento con el botón Atrás de Android (actualmente cierra la app; conviene mapearlo a la navegación interna con `@capacitor/app`).
- [ ] Mantener `targetSdkVersion` dentro del año del último Android (requisito continuo).

Referencias: [requisito de target SDK](https://developer.android.com/google/play/requirements/target-sdk), [ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/11926878), [flujo de trabajo de Capacitor](https://capacitorjs.com/docs/basics/workflow).
