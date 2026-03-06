# Guía de Configuración en VPS (Ubuntu Server)

Sigue estos pasos para poner a OpenGravity online 24/7 en tu servidor.

## 1. Conexión y Requisitos

Conéctate a tu VPS vía SSH:
\`\`\`bash
ssh usuario@ip-de-tu-vps
\`\`\`

Instala Node.js (v20+) usando NVM (recomendado):
\`\`\`bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
\`\`\`

## 2. Preparar el Proyecto

Clona tu repositorio o sube la carpeta. Una vez dentro de la carpeta \`opengrav\`:

\`\`\`bash
# Instalar dependencias
npm install

# Crear el archivo .env con tus claves reales
nano .env
# (Pega aquí tu contenido del .env local, guarda con Ctrl+O y sal con Ctrl+X)

# Compilar el código de TypeScript a JavaScript
npm run build
\`\`\`

## 3. Lanzar con PM2 (24/7)

PM2 se encargará de que el bot se reinicie solo si hay un error o si el servidor se reinicia.

\`\`\`bash
# Instalar PM2 globalmente (opcional, ya está en dependencias)
# npm install pm2 -g

# Lanzar el bot
npm run pm2

# Guardar la lista de procesos para que arranquen tras un reboot del VPS
npx pm2 save
npx pm2 startup
# (Ejecuta el comando que te devuelva la terminal para habilitar el arranque automático)
\`\`\`

## 4. Comandos útiles de PM2

- **Ver logs en tiempo real**: \`npx pm2 logs opengravity\`
- **Ver estado**: \`npx pm2 status\`
- **Reiniciar**: \`npx pm2 restart opengravity\`
- **Parar**: \`npx pm2 stop opengravity\`

---
*Nota: Recuerda que para que la transcripción de voz funcione, el VPS debe tener acceso a internet para llegar a la API de Groq.*
