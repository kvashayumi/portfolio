require('dotenv').config(); // Завантажує змінні з файлу .env — має бути ПЕРШИМ рядком

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express    = require('express');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const cors       = require('cors');
const path       = require('path');
const winston    = require('winston');
const rateLimit  = require('express-rate-limit');
require('winston-daily-rotate-file');

const app  = express();
const PORT = process.env.PORT || 3000; // FIX: не хардкодимо порт

app.set('trust proxy', 1);

// FIX: обмежуємо CORS для продакшену через .env (CORS_ORIGIN=https://yourdomain.com)
// Для локальної розробки — відкрито для всіх
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname))); // Роздає index.html та інші файли

// --- НАЛАШТУВАННЯ АВТОМАТИЧНОГО КОНТРОЛЮ ПАМ'ЯТІ ---
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

// --- ЗАХИСТ ВІД СПАМУ (Rate Limiting) ---
const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.headers['x-forwarded-for'] || 'local-user';
    },
    handler: (req, res) => {
        logger.warn(`[RATE LIMIT] Перевищено ліміт запитів з IP: ${req.ip}`);
        res.status(429).json({ error: 'Забагато спроб. Спробуйте через 10 хвилин.' });
    }
});

// FIX: Транспортер створюється один раз, а не при кожному запиті
// (nodemailer рекомендує повторно використовувати об'єкт transporter)
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
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
        logger.warn(`[VALIDATION] Некоректне імʼя: "${name}"`);
        return res.status(400).json({ error: "Некоректне імʼя. Мінімум 2 символи." });
    }
    if (nameClean.length > 100) {
        logger.warn(`[VALIDATION] Надто довге імʼя: "${name}"`);
        return res.status(400).json({ error: "Імʼя задовге. Максимум 100 символів." });
    }

    if (!phone || phone.replace(/\D/g, '').length < 7) {
        logger.warn(`[VALIDATION] Некоректний телефон: "${phone}"`);
        return res.status(400).json({ error: "Некоректний номер телефону." });
    }

    logger.info(`[NEW REQUEST] Отримано заявку від: ${nameClean}, Тел: ${phone}, Месенджер: ${messenger} (${nick})`);

    // --- ЗБЕРЕЖЕННЯ ЗАЯВКИ У JSON ---
    try {
        const dbPath = path.join(__dirname, 'submissions.json');
        const existing = fs.existsSync(dbPath)
            ? JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
            : [];

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

    const mailOptions = {
        from:    process.env.MAIL_USER,
        to:      process.env.MAIL_USER,
        subject: `Нова заявка від ${nameClean}`,
        text:    `Ім'я: ${nameClean}\nТелефон: ${phone}\nСпосіб зв'язку: ${messenger}\nНік: ${nick}\nПовідомлення: ${message}`
    };

    try {
        await mailer.sendMail(mailOptions);
        logger.info(`[SUCCESS] Лист успішно надіслано для користувача ${nameClean}`);
        res.status(200).json({ success: true, message: 'Заявку успішно отримано' });
    } catch (error) {
        logger.error(`[EMAIL ERROR] Не вдалося надіслати лист: ${error.message}`);
        res.status(500).json({
            saved: true,
            error: "Заявку збережено, але email-сповіщення не надіслано. Зв'яжіться вручну або спробуйте пізніше."
        });
    }
});

// --- СТОРІНКА 404 ---
app.use((req, res) => {
    logger.warn(`[404] Не знайдено: ${req.method} ${req.url}`);
    res.status(404).send(`
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 — Dmytro Kvasha</title>
    <meta name="robots" content="noindex, nofollow">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
            font-family: 'Inter', sans-serif;
            background: #fff;
            color: #000;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            -webkit-font-smoothing: antialiased;
        }
        nav { height: 80px; display: flex; align-items: center; padding: 0 40px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
        .nav-brand { font-size: 1.2rem; font-weight: 800; color: #000; text-decoration: none; letter-spacing: -0.5px; }
        main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 60px 24px; position: relative; overflow: hidden; }
        .bg-number { position: absolute; font-size: clamp(160px, 30vw, 340px); font-weight: 800; color: #f3f3f3; user-select: none; letter-spacing: -0.04em; line-height: 1; top: 50%; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; z-index: 0; }
        .content { position: relative; z-index: 1; text-align: center; max-width: 480px; }
        .label { display: inline-block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #999; margin-bottom: 24px; }
        .divider { width: 40px; height: 2px; background: #000; margin: 0 auto 28px; }
        h1 { font-size: clamp(26px, 5vw, 40px); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; margin-bottom: 14px; }
        p { font-size: 15px; color: #666; line-height: 1.65; margin-bottom: 40px; }
        a { display: inline-block; background: #000; color: #fff; padding: 14px 36px; font-size: 14px; font-weight: 600; text-decoration: none; transition: background 0.2s, transform 0.2s; }
        a:hover { background: #333; transform: translateY(-2px); }
        footer { padding: 20px 40px; border-top: 1px solid #f0f0f0; text-align: center; font-size: 13px; color: #aaa; flex-shrink: 0; }
        @media (max-width: 480px) { nav { padding: 0 20px; } footer { padding: 20px; } }
    </style>
</head>
<body>
 <nav><a href="/" class="nav-brand">DK</a></nav>
    <main>
        <div class="bg-number">404</div>
        <div class="content">
            <span class="label">Помилка 404</span>
            <div class="divider"></div>
            <h1>Сторінку не знайдено</h1>
            <p>Схоже, ця адреса не існує або була переміщена.</p>
            <a href="/">На головну</a>
        </div>
    </main>
    <footer>© 2026 Dmytro Kvasha</footer>
</body>
</html>
    `);
});

app.listen(PORT, () => {
    logger.info(`[START] Сервер успішно запущено на порту ${PORT}`);
});
