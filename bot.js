const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

function normalizarTexto(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const dialogosPath = './dialogos.json';
let dialogos = {};
if (fs.existsSync(dialogosPath)) {
    dialogos = JSON.parse(fs.readFileSync(dialogosPath, 'utf8'))['gap'];
} else {
    console.error('No se encontró el archivo de diálogos.');
    process.exit(1);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', qr => {
    console.log('Por favor escanea el QR siguiente:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Cliente está listo!');
});

const sessionStorage = {};

client.on('message', async message => {
    const chatId = message.from;
    const texto = normalizarTexto(message.body);

    // Inicialización de la sesión del usuario
    if (!sessionStorage[chatId]) {
        sessionStorage[chatId] = { subOpciones: null, subSubOpciones: null, nivel: 'principal' };
    }

    if (texto === 'hola') {
        const opcionesList = Object.keys(dialogos.opciones)
            .map((opcion, idx) => `${idx + 1}. ${opcion}`)
            .join('\n');
        client.sendMessage(chatId, `¡Hola! ¿Qué información necesitas sobre GAP? Puedes preguntar por:\n${opcionesList}\n\nDigita el número de la pregunta para obtener una respuesta.\n\n*Escribe "volver" para regresar al nivel anterior en cualquier momento.*`);
        sessionStorage[chatId].nivel = 'principal';
        sessionStorage[chatId].subOpciones = null;
        sessionStorage[chatId].subSubOpciones = null;
    } else if (texto === 'volver') {
        // Volver al nivel anterior
        if (sessionStorage[chatId].nivel === 'subopciones') {
            sessionStorage[chatId].nivel = 'principal';
            const opcionesList = Object.keys(dialogos.opciones)
                .map((opcion, idx) => `${idx + 1}. ${opcion}`)
                .join('\n');
            client.sendMessage(chatId, `Has regresado al menú principal:\n${opcionesList}`);
        } else if (sessionStorage[chatId].nivel === 'sub-subopciones') {
            sessionStorage[chatId].nivel = 'subopciones';
            const subopciones = Object.keys(sessionStorage[chatId].subOpciones)
                .map((sub, idx) => `${String.fromCharCode(97 + idx)}. ${sub}`)
                .join('\n');
            client.sendMessage(chatId, `Has regresado al menú anterior:\n${subopciones}`);
        } else {
            client.sendMessage(chatId, 'Ya estás en el nivel principal.');
        }
    } else {
        const opcionIndex = parseInt(texto) - 1;

        if (sessionStorage[chatId].nivel === 'principal' && opcionIndex >= 0 && opcionIndex < Object.keys(dialogos.opciones).length) {
            const opcionElegida = Object.keys(dialogos.opciones)[opcionIndex];
            sessionStorage[chatId].subOpciones = dialogos.opciones[opcionElegida].subopciones;
            sessionStorage[chatId].nivel = 'subopciones';
            const subopciones = Object.keys(sessionStorage[chatId].subOpciones)
                .map((sub, idx) => `${String.fromCharCode(97 + idx)}. ${sub}`)
                .join('\n');
            client.sendMessage(chatId, `Opciones disponibles:\n${subopciones}\n\nDigita la letra de la subopción para obtener más detalles.\n\n*Escribe "volver" para regresar al nivel anterior.*`);
        } else if (sessionStorage[chatId].nivel === 'subopciones') {
            const subOpcionIndex = texto.charCodeAt(0) - 97;
            const subOpcionesKeys = Object.keys(sessionStorage[chatId].subOpciones);
            if (subOpcionIndex >= 0 && subOpcionIndex < subOpcionesKeys.length) {
                const subOpcionElegida = sessionStorage[chatId].subOpciones[subOpcionesKeys[subOpcionIndex]];
                if ('sub-subopciones' in subOpcionElegida) {
                    sessionStorage[chatId].nivel = 'sub-subopciones';
                    sessionStorage[chatId].subSubOpciones = subOpcionElegida['sub-subopciones'];
                    const subSubOpciones = Object.keys(subOpcionElegida['sub-subopciones'])
                        .map((sub, idx) => `${idx + 1}. ${sub}`)
                        .join('\n');
                    client.sendMessage(chatId, `Más detalles disponibles:\n${subSubOpciones}\n\nDigita el número para obtener más información.\n\n*Escribe "volver" para regresar al nivel anterior.*`);
                } else {
                    client.sendMessage(chatId, subOpcionElegida.respuesta);
                    sessionStorage[chatId].nivel = 'subopciones'; // Nos mantenemos en subopciones
                }
            } else {
                client.sendMessage(chatId, "Lo siento, no entiendo esa opción. Por favor, intenta nuevamente.");
            }
        } else if (sessionStorage[chatId].nivel === 'sub-subopciones' && !isNaN(texto)) {
            const subSubIndex = parseInt(texto) - 1;
            const subSubOpcionesKeys = Object.keys(sessionStorage[chatId].subSubOpciones);
            if (subSubIndex >= 0 && subSubIndex < subSubOpcionesKeys.length) {
                client.sendMessage(chatId, sessionStorage[chatId].subSubOpciones[subSubOpcionesKeys[subSubIndex]].respuesta);
                sessionStorage[chatId].nivel = 'sub-subopciones'; // Nos mantenemos en sub-subopciones
            } else {
                client.sendMessage(chatId, "Lo siento, no entiendo esa opción. Por favor, intenta nuevamente.");
            }
        } else {
            client.sendMessage(chatId, "Lo siento, no entiendo esa opción. Por favor, intenta nuevamente.");
        }
    }
});

client.initialize();
