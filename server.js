require('dotenv').config(); // Завантажує змінні з файлу .env — має бути ПЕРШИМ рядком

const express    = require('express');
const fs         = require('fs');
const cors       = require('cors');
const path       = require('path');
const winston    = require('winston');
const rateLimit  = require('express-rate-limit');
require('winston-daily-rotate-file');

const app  = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname))); // Роздає static файли

// --- НАЛАШТУВАННЯ ЛОГІВ ---
const transport = new winston.transports.DailyRotateFile({
    dirname: path.join(__dirname, 'logs'),
    filename: 'server-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '10m',
    maxFiles: '14d'
});

const logger = winston.createLogger({
    transports: [
        transport,
        new winston.transports.Console()
    ]
});

// --- ЗАХИСТ ВІД СПАМУ ---
const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 хвилин
    max: 3,                   // Максимум 3 заявки з одного IP
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`[RATE LIMIT] Перевищено ліміт запитів з IP: ${req.ip}`);
        res.status(429).json({ error: 'Забагато спроб. Спробуйте через 10 хвилин.' });
    }
});

// --- ОБРОБКА ЗАЯВКИ З САЙТУ ---
app.post('/send', submitLimiter, async (req, res) => {
    const { name, phone, message, messenger, nick, honeypot } = req.body;

    // Захист від ботів (Honeypot)
    if (honeypot) {
        logger.warn(`[SPAM DETECTED] Бот намагався заповнити приховане поле.`);
        return res.status(400).json({ error: 'Bot detected' });
    }

    // --- ВАЛІДАЦІЯ НА СЕРВЕРІ ---
    const nameClean = name ? name.trim() : '';
    if (!nameClean || nameClean.length < 2) {
        return res.status(400).json({ error: "Некоректне імʼя. Мінімум 2 символи." });
    }

    if (!phone || phone.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ error: "Некоректний номер телефону." });
    }

    logger.info(`[NEW REQUEST] Отримано заявку від: ${nameClean}, Тел: ${phone}`);

    // --- ЗБЕРЕЖЕННЯ ЗАЯВКИ У JSON ---
    try {
        const dbPath = path.join(__dirname, 'submissions.json');
        const existing = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : [];
        existing.push({
            date:      new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
            name:      nameClean,
            phone,
            messenger: messenger || '—',
            nick:      nick || '—',
            message:   message || '—'
        });
        fs.writeFileSync(dbPath, JSON.stringify(existing, null, 2), 'utf-8');
        logger.info(`[DB] Заявку збережено. Всього заявок: ${existing.length}`);
    } catch (dbErr) {
        logger.error(`[DB ERROR] Не вдалося зберегти заявку: ${dbErr.message}`);
    }

    // --- ВІДПРАВКА ЧЕРЕЗ RESEND EMAIL API (ПОРТ 443 HTTPS) ---
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Portfolio <onboarding@resend.dev>',
                to: process.env.MAIL_USER, // Лист прийде на твій Gmail, вказаний в Railway variables
                subject: `Нова заявка від ${nameClean}`,
                text: `Ім'я: ${nameClean}\nТелефон: ${phone}\nСпосіб зв'язку: ${messenger}\nНік: ${nick}\nПовідомлення: ${message}`
            })
        });

        const resData = await response.json();

        if (response.ok) {
            logger.info(`[SUCCESS] Лист успішно надіслано через Resend API для ${nameClean}`);
            res.status(200).json({ success: true, message: 'Заявку успішно отримано' });
        } else {
            throw new Error(resData.message || 'Помилка поштового API');
        }
    } catch (error) {
        logger.error(`[EMAIL ERROR] Не вдалося надіслати лист через API: ${error.message}`);
        res.status(500).json({
            saved: true,
            error: "Заявку збережено, але сповіщення не надіслано. Ми вже лагодимо це!"
        });
    }
});

// --- СТОРІНКА 404 ---
app.use((req, res) => {
    res.status(404).send(`
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <title>404 — Сторінку не знайдено</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fafafa; margin: 0; }
        .card { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h1 { margin: 0 0 10px; font-size: 40px; color: #333; }
        p { color: #666; margin-bottom: 20px; }
        a { text-decoration: none; color: white; background: #000; padding: 10px 20px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>404</h1>
        <p>Сторінку не знайдено</p>
        <a href="/">На головну</a>
    </div>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    logger.info(`[START] Сервер успішно запущено на порту ${PORT}`);
});