# Conexion al VPS y Tunel Seguro WS Control

Guia operativa para conectar OpenGravity al canal de control de SecurityBot sin exponer el puerto 3310 a Internet.

## Objetivo

- Mantener el WS de control en el VPS escuchando solo en `127.0.0.1:3310`.
- Conectarse desde la maquina local con tunel SSH.
- Usar en el bot local: `WS_CONTROL_URL=ws://127.0.0.1:3310`.

## Arquitectura

- VPS remoto: `62.171.142.58`
- Puerto SSH remoto: `44`
- Usuario de tunel: `tun3310`
- Puerto local del tunel: `3310`
- Forward: `3310(local) -> 127.0.0.1:3310(VPS)`

## 1. Crear usuario de tunel en el VPS

Conectate al VPS con un usuario administrador:

```bash
ssh -p 44 alvaro@62.171.142.58
```

Crea el usuario y su carpeta SSH:

```bash
sudo adduser --disabled-password --gecos "" tun3310
sudo mkdir -p /home/tun3310/.ssh
sudo chown -R tun3310:tun3310 /home/tun3310/.ssh
sudo chmod 700 /home/tun3310/.ssh
```

## 2. Generar clave en local

En la maquina local (donde corre OpenGravity):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ws_control_tunnel -C "ws-control-tunnel" -N ""
```

## 3. Instalar clave publica en el VPS

Opcion A (automatica, si login por password esta permitido):

```bash
ssh-copy-id -p 44 -i ~/.ssh/ws_control_tunnel.pub tun3310@62.171.142.58
```

Opcion B (manual, recomendada si ssh-copy-id falla):

```bash
# En el VPS
sudo mkdir -p /home/tun3310/.ssh
sudo chmod 700 /home/tun3310/.ssh
echo 'PEGA_AQUI_TU_CLAVE_PUBLICA' | sudo tee /home/tun3310/.ssh/authorized_keys >/dev/null
sudo chown -R tun3310:tun3310 /home/tun3310/.ssh
sudo chmod 600 /home/tun3310/.ssh/authorized_keys
```

Verifica desde local:

```bash
ssh -p 44 -i ~/.ssh/ws_control_tunnel -o BatchMode=yes tun3310@62.171.142.58 'echo OK'
```

## 4. Permitir el usuario en sshd (si aplica)

Si en logs aparece:

`not allowed because not listed in AllowUsers`

agrega `tun3310` en `/etc/ssh/sshd_config.d/99-custom.conf`:

```text
AllowUsers alvaro tun3310
```

Valida y reinicia SSH en el VPS:

```bash
sudo sshd -t
sudo systemctl restart ssh || sudo systemctl restart sshd
```

## 5. Levantar tunel manual

Desde local:

```bash
ssh -p 44 -N -L 3310:127.0.0.1:3310 -i ~/.ssh/ws_control_tunnel tun3310@62.171.142.58
```

Nota: este comando queda en primer plano. Es normal.

Verificacion local en otra terminal:

```bash
nc -zv 127.0.0.1 3310
```

## 6. Dejar el tunel persistente con systemd (local)

Crear servicio:

```bash
sudo tee /etc/systemd/system/ws-control-tunnel.service >/dev/null <<'EOF'
[Unit]
Description=SSH tunnel to SecurityBot WS control (3310)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=alvaro
ExecStart=/usr/bin/ssh \
  -p 44 \
  -i /home/alvaro/.ssh/ws_control_tunnel \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=accept-new \
  -N \
  -L 3310:127.0.0.1:3310 \
  tun3310@62.171.142.58
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Activar servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ws-control-tunnel.service
sudo systemctl status ws-control-tunnel.service --no-pager -l
```

Logs:

```bash
journalctl -u ws-control-tunnel.service -f
```

## 7. Configuracion del bot local

En `.env` local:

```dotenv
WS_CONTROL_ENABLED=true
WS_CONTROL_URL=ws://127.0.0.1:3310
WS_CONTROL_TOKEN=TU_WS_CONTROL_TOKEN
```

Reinicia el bot para recargar variables.

## 8. Validacion final por Telegram

Probar en este orden:

1. `/sec status`
2. `/sec list`
3. `/sec ping`

## Troubleshooting rapido

- Error `TypeError: Invalid URL`:
  - Revisar `.env` y evitar valores mal formados como `WS_CONTROL_URL=WS_CONTROL_URL=...`.

- `Permission denied (publickey,password)`:
  - Revisar `authorized_keys` y permisos (`700` en `.ssh`, `600` en `authorized_keys`).
  - Verificar `AllowUsers` incluya `tun3310`.

- Servicio systemd en loop con exit 255:
  - Revisar logs con `journalctl -u ws-control-tunnel.service -n 80 --no-pager -l`.
  - Si sale `Address already in use`, hay otro tunel manual ocupando 3310. Cierra el proceso manual.

- `Host key verification failed`:
  - Limpiar huella para ese host:puerto en local:

```bash
ssh-keygen -R "[62.171.142.58]:44"
```
