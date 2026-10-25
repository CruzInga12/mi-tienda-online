// whatsapp-bot.js - Con código de emparejamiento y visualización QR en Render
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const readline = require('readline');
const qrcode = require('qrcode-terminal');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = (texto) => new Promise((resolve) => rl.question(texto, resolve));

let sock = null;

async function conectarWhatsApp() {
    // Usamos 'auth_info_baileys_v3' para limpiar la sesión corrupta anterior
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys_v4');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    // Si no está registrado y existe consola interactiva local, solicita número
    if (!sock.authState.creds.registered && process.stdin.isTTY) {
        const phoneNumber = await pregunta('\n📱 Ingresa tu número de WhatsApp con código de país (ej: 51929991971): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`\n✨ TU CÓDIGO DE VINCULACIÓN DE 8 DÍGITOS ES: --->  ${code}  <---\n`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Imprimir el código QR en los logs de Render si es necesario escanear
        if (qr) {
            console.log('\n================ ESCANEA ESTE CÓDIGO QR ================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n=======================================================\n');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                conectarWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ ¡Bot de WhatsApp conectado y listo para enviar alertas!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Función para enviar mensajes
async function enviarAlertaWhatsApp(numero, mensaje) {
    if (!sock) {
        console.log('⚠️ El bot de WhatsApp aún no está conectado.');
        return;
    }
    try {
        const idJid = `${numero}@s.whatsapp.net`;
        await sock.sendMessage(idJid, { text: mensaje });
        console.log(`📨 Alerta enviada con éxito a ${numero}`);
    } catch (error) {
        console.error(`❌ Error al enviar WhatsApp a ${numero}:`, error);
    }
}

module.exports = { conectarWhatsApp, enviarAlertaWhatsApp };