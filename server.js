// @ts-nocheck
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const winston    = require('winston');
const rateLimit  = require('express-rate-limit');
const Database   = require('better-sqlite3');
const multer     = require('multer');
const fs         = require('fs');
const crypto     = require('crypto');
require('winston-daily-rotate-file');

const app  = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- НАЛАШТУВАННЯ ЗАВАНТАЖЕННЯ ЗОБРАЖЕНЬ ---
// Папка uploads/ роздається автоматично через express.static вище,
// тож файл, збережений тут, одразу доступний за адресою /uploads/<ім'я>
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // максимум 5 МБ на файл
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

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

// --- ІНІЦІАЛІЗАЦІЯ БАЗИ ДАНИХ SQLite ---
const db = new Database('submissions.db');

// Таблиця заявок
db.prepare(`
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        name TEXT,
        phone TEXT,
        email TEXT,
        messenger TEXT,
        nick TEXT,
        message TEXT
    )
`).run();

// Міграція: додаємо колонку email до вже існуючої бази, якщо її немає
const subCols = db.prepare("PRAGMA table_info(submissions)").all();
if (!subCols.some(c => c.name === 'email')) {
    db.prepare("ALTER TABLE submissions ADD COLUMN email TEXT").run();
}

// Таблиця проектів портфоліо
db.prepare(`
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        img TEXT,
        titleUk TEXT,
        titleEn TEXT,
        descUk TEXT,
        descEn TEXT,
        tags TEXT,
        link TEXT
    )
`).run();

// Наповнення бази базовими проектами, якщо вона порожня
const projectCount = db.prepare("SELECT COUNT(*) as count FROM projects").get();
if (projectCount.count === 0) {
    const insertProject = db.prepare(`
        INSERT INTO projects (img, titleUk, titleEn, descUk, descEn, tags, link)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertProject.run(
        "https://images.unsplash.com/photo-1547119957-637f8679db1e?auto=format&fit=crop&w=800&q=80",
        "Сайт корпоративних послуг",
        "Corporate Services Website",
        "Мінімалістичний веб-сайт для консалтингової компанії. Плавні анімації, інтерактивні форми та повна оптимізація швидкості завантаження.",
        "A minimalist website for a consulting firm. Features smooth animations, interactive forms, and total load-speed optimization.",
        "Figma, HTML5, CSS3, JavaScript",
        "#"
    );

    insertProject.run(
        "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
        "Платформа E-Commerce",
        "E-Commerce Platform",
        "Сучасний інтернет-магазин одягу з кастомною фільтрацією товарів, інтерактивним кошиком та швидким оформленням замовлення.",
        "A modern online apparel store featuring custom product filtering, an interactive cart, and quick checkout.",
        "Node.js, Express, MongoDB, Bootstrap5",
        "#"
    );
    logger.info("[DB] База даних успішно ініціалізована базовими проектами.");
}

// --- ЗАХИСТ ВІД СПАМУ ---
const submitLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { error: "Занадто багато запитів. Спробуйте пізніше." }
});

// --- API МАРШРУТИ ДЛЯ САЙТУ ---

// Отримання проектів для головної сторінки
app.get('/api/projects', (req, res) => {
    try {
        const projects = db.prepare("SELECT * FROM projects ORDER BY id DESC").all();
        const formatted = projects.map(p => ({
            id: p.id,
            img: p.img,
            titleUk: p.titleUk,
            titleEn: p.titleEn,
            descUk: p.descUk,
            descEn: p.descEn,
            tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
            link: p.link
        }));
        res.json(formatted);
    } catch (err) {
        logger.error(`[API ERROR] Помилка отримання проектів: ${err.message}`);
        res.status(500).json({ error: "Не вдалося завантажити проекти" });
    }
});

// Обробка форми з сайту
app.post('/submit', submitLimiter, async (req, res) => {
    const { name, phone, email, messenger, nick, message } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: "Ім'я та телефон є обов'язковими полями" });
    }

    const nameClean      = name.replace(/<\/?[^>]+(>|$)/g, "").trim();
    const phoneClean     = phone.trim();
    const emailClean     = email ? email.replace(/<\/?[^>]+(>|$)/g, "").trim() : "";
    const messengerClean = messenger ? messenger.trim() : "Не вказано";
    const nickClean      = nick ? nick.replace(/<\/?[^>]+(>|$)/g, "").trim() : "—";
    const messageClean   = message ? message.replace(/<\/?[^>]+(>|$)/g, "").trim() : "—";
    const formattedDate  = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

    try {
        const stmt = db.prepare(`
            INSERT INTO submissions (date, name, phone, email, messenger, nick, message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(formattedDate, nameClean, phoneClean, emailClean, messengerClean, nickClean, messageClean);
        logger.info(`[DB SUCCESS] Заявку від ${nameClean} успішно збережено в SQLite.`);
    } catch (dbError) {
        logger.error(`[DB ERROR] Помилка збереження в базу даних: ${dbError.message}`);
        return res.status(500).json({ error: "Помилка сервера при збереженні даних." });
    }

    // Відправка Email через Resend
    try {
        if (!process.env.RESEND_API_KEY || !process.env.MAIL_USER) {
            throw new Error("Відсутні змінні оточення для надсилання пошти");
        }

        const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                <h2 style="color: #0070f3; margin-bottom: 20px;">Нова заявка з сайту!</h2>
                <p><b>Дата:</b> ${formattedDate}</p>
                <p><b>Ім'я:</b> ${nameClean}</p>
                <p><b>Телефон:</b> ${phoneClean}</p>
                <p><b>Пошта:</b> ${emailClean ? `<a href="mailto:${emailClean}">${emailClean}</a>` : 'Не вказано'}</p>
                <p><b>Спосіб зв'язку:</b> ${messengerClean} ${nickClean !== '—' ? `(${nickClean})` : ''}</p>
                <p><b>Повідомлення:</b> ${messageClean}</p>
            </div>
        `;

        // Используем встроенный глобальный fetch Node.js
        const resResend = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev',
                to: process.env.MAIL_USER,
                subject: `🔔 Нова заявка від ${nameClean}`,
                html: emailHtml
            })
        });

        const resData = await resResend.json();

        if (resResend.ok) {
            logger.info(`[SUCCESS] Лист успішно надіслано через Resend API для ${nameClean}`);
            res.status(200).json({ success: true, message: 'Заявку успішно отримано' });
        } else {
            throw new Error(resData.message || 'Помилка поштового API');
        }
    } catch (error) {
        logger.error(`[EMAIL ERROR] Не вдалося надіслати лист через API: ${error.message}`);
        res.status(200).json({
            saved: true,
            warning: "Заявку збережено в базу даних, але сталася помилка надсилання email-сповіщення."
        });
    }
});


// --- СЕКЦІЯ АДМІН-ПАНЕЛІ (REST API + UI) ---

// Порівняння рядків, стійке до timing-атак.
// Хешуємо обидва значення до фіксованої довжини (32 байти),
// щоб crypto.timingSafeEqual ніколи не падав і не "зливав" довжину пароля.
function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// HTTP Basic Auth для всієї адмінки.
// Браузер один раз запитає логін/пароль на /admin і далі сам підставлятиме
// їх до всіх запитів /admin/api/... — тож фронтенд міняти не потрібно.
function adminAuth(req, res, next) {
    const expectedUser = process.env.ADMIN_USER;
    const expectedPass = process.env.ADMIN_PASSWORD;

    // Fail-closed: якщо креденшіали не задані в .env — не пускаємо нікого.
    if (!expectedUser || !expectedPass) {
        logger.error('[AUTH] ADMIN_USER або ADMIN_PASSWORD не задані в оточенні — доступ до адмінки заблоковано.');
        return res
            .status(500)
            .send('Адмін-панель не налаштована: задайте ADMIN_USER і ADMIN_PASSWORD у файлі .env');
    }

    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme === 'Basic' && encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const sep  = decoded.indexOf(':');
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);

        if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPass)) {
            return next();
        }
    }

    res.set('WWW-Authenticate', 'Basic realm="Admin Panel", charset="UTF-8"');
    return res.status(401).send('Потрібна авторизація для доступу до адмін-панелі.');
}

// Захищаємо ОДНИМ рядком усі маршрути, що починаються з /admin
// (і сторінку UI, і весь REST API під /admin/api/...).
// Важливо: реєструється ДО самих маршрутів адмінки нижче.
app.use('/admin', adminAuth);

// Отримання списку заявок для адмінки
app.get('/admin/api/submissions', (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM submissions ORDER BY id DESC").all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Помилка сервера" });
    }
});

// Видалення заявки
app.delete('/admin/api/submissions/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM submissions WHERE id = ?").run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Помилка видалення" });
    }
});

// Додавання нового проекту
app.post('/admin/api/projects', (req, res) => {
    try {
        const { img, titleUk, titleEn, descUk, descEn, tags, link } = req.body;
        if (!titleUk || !titleEn) return res.status(400).json({ error: "Назва проекту обов'язкова" });

        db.prepare(`
            INSERT INTO projects (img, titleUk, titleEn, descUk, descEn, tags, link)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            img || "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
            titleUk, titleEn, descUk, descEn, tags, link || "#"
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Помилка додавання проекту" });
    }
});

// Оновлення існуючого проекту
app.put('/admin/api/projects/:id', (req, res) => {
    try {
        const { img, titleUk, titleEn, descUk, descEn, tags, link } = req.body;
        if (!titleUk || !titleEn) return res.status(400).json({ error: "Назва проекту обов'язкова" });

        const existing = db.prepare("SELECT img FROM projects WHERE id = ?").get(req.params.id);
        if (!existing) return res.status(404).json({ error: "Проект не знайдено" });

        // Якщо нове зображення не передано — зберігаємо старе
        const newImg = (img && img.trim()) ? img : existing.img;

        db.prepare(`
            UPDATE projects SET img=?, titleUk=?, titleEn=?, descUk=?, descEn=?, tags=?, link=?
            WHERE id=?
        `).run(newImg, titleUk, titleEn, descUk, descEn, tags, link || "#", req.params.id);

        logger.info(`[DB] Проект #${req.params.id} оновлено.`);
        res.json({ success: true });
    } catch (err) {
        logger.error(`[API ERROR] Помилка оновлення проекту: ${err.message}`);
        res.status(500).json({ error: "Помилка оновлення проекту" });
    }
});

// Завантаження зображення для проекту
app.post('/admin/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Файл не отримано або має невірний формат" });
    res.json({ url: '/uploads/' + req.file.filename });
});

// Видалення проекту
app.delete('/admin/api/projects/:id', (req, res) => {
    try {
        // Спершу дізнаємось, яке зображення прив'язане до проекту
        const row = db.prepare("SELECT img FROM projects WHERE id = ?").get(req.params.id);
        db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);

        // Якщо це локально завантажений файл — прибираємо його з диску, щоб не накопичувалось сміття
        if (row && row.img && row.img.startsWith('/uploads/')) {
            const filePath = path.join(uploadDir, path.basename(row.img));
            fs.unlink(filePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    logger.error(`[DELETE FILE ERROR] Не вдалося видалити файл ${filePath}: ${err.message}`);
                }
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Помилка видалення проекту" });
    }
});

// Візуальний інтерфейс адмінки
app.get('/admin', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Панель керування — Dmytro Kvasha</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        :root { --accent: #000; --muted: #666; --border: #ebebeb; }
        body {
            font-family: 'Inter', sans-serif;
            color: #000;
            background: #fff;
            margin: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        /* Верхня панель — у стилі навбару сайту */
        .admin-nav {
            height: 80px;
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 0 28px;
            border-bottom: 1px solid var(--border);
            position: sticky;
            top: 0;
            background: #fff;
            z-index: 50;
        }
        .admin-nav .brand { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.02em; }
        .admin-nav .tag { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; background: #000; color: #fff; padding: 4px 10px; border-radius: 2px; text-transform: uppercase; }
        .admin-nav .view-site {
            margin-left: auto;
            font-size: 14px; font-weight: 600;
            color: #000; text-decoration: none;
            border: 2px solid #000; padding: 9px 20px;
            transition: 0.3s;
        }
        .admin-nav .view-site:hover { background: #000; color: #fff; transform: translateY(-2px); }

        .container { max-width: 1100px; margin: 44px auto; padding: 0 28px; }
        h2.page-title { margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
        .page-sub { margin: 0; color: var(--muted); font-size: 14px; }

        /* Вкладки */
        .tabs { display: flex; gap: 4px; margin: 30px 0 28px; border-bottom: 1px solid var(--border); }
        .tab-btn { background: none; border: none; font-family: inherit; font-size: 15px; font-weight: 600; color: #999; padding: 12px 18px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.2s, border-color 0.2s; }
        .tab-btn:hover { color: #000; }
        .tab-btn.active { color: #000; border-bottom-color: #000; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        h3 { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 16px; }
        #tab-portfolio h3 + h3, #tab-portfolio table + h3 { margin-top: 36px; }

        /* Таблиці */
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        th { background: #fafafa; padding: 13px 12px; font-weight: 600; color: #111; border-bottom: 1px solid var(--border); text-transform: uppercase; font-size: 11px; letter-spacing: 0.8px; }
        td { padding: 14px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        tr:hover { background: #fafafa; }

        .badge { display: inline-block; border-radius: 2px; border: none; color: #444; padding: 4px 11px; font-size: 12.5px; font-weight: 500; background: #f0f0f0; letter-spacing: 0.1px; }
        .badge.tg, .badge.viber, .badge.call { background: #111; color: #fff; }

        .phone-link { color: #000; text-decoration: none; font-weight: 600; border-bottom: 1px solid #ddd; transition: border-color 0.2s; }
        .phone-link:hover { border-color: #000; }

        .delete-btn { background: #fff; color: #888; border: 1.5px solid #e2e2e2; padding: 7px 14px; border-radius: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 13px; transition: 0.2s; }
        .delete-btn:hover { border-color: #d11; color: #d11; }
        .edit-btn { background: #fff; color: #444; border: 1.5px solid #e2e2e2; padding: 7px 14px; border-radius: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 13px; transition: 0.2s; margin-right: 6px; }
        .edit-btn:hover { border-color: #000; color: #000; background: #fafafa; }
        .cancel-btn { grid-column: span 2; background: #555; color: #fff; border: none; padding: 15px; font-family: inherit; font-weight: 600; font-size: 15px; border-radius: 0; cursor: pointer; transition: 0.3s; display: none; }
        .cancel-btn:hover { background: #333; transform: translateY(-2px); }

        /* Секція форми проектів */
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #fff; padding: 24px; border-radius: 0; margin-bottom: 8px; border: 1px solid var(--border); }
        .form-group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .form-group.full { grid-column: span 2; }
        label { font-size: 13px; font-weight: 600; color: #333; }
        input, textarea { width: 100%; max-width: 100%; font-family: inherit; padding: 12px; border: 1px solid transparent; border-radius: 0; font-size: 14px; background: #f9f9f9; transition: border-color 0.15s ease, background 0.15s ease; }
        textarea { resize: vertical; min-height: 64px; }
        input:focus, textarea:focus { border-color: #000; outline: none; background: #fff; }
        .submit-btn { grid-column: span 2; background: #000; color: #fff; border: none; padding: 15px; font-family: inherit; font-weight: 600; font-size: 15px; border-radius: 0; cursor: pointer; transition: 0.3s; }
        .submit-btn:hover { background: #333; transform: translateY(-2px); }

        .proj-img-preview { width: 64px; height: 44px; object-fit: cover; border-radius: 0; border: 1px solid var(--border); }

        /* Завантаження зображення: дропзона + прев'ю з можливістю прибрати */
        .img-dropzone { border: 1.5px dashed #cfcfcf; padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; color: #888; font-size: 13px; text-align: center; transition: border-color 0.2s, background 0.2s, color 0.2s; }
        .img-dropzone:hover { border-color: #000; background: #fafafa; color: #000; }
        .img-dropzone .icon { font-size: 24px; line-height: 1; }
        .img-dropzone small { color: #aaa; font-size: 11px; }
        .img-preview-wrap { display: none; flex-direction: column; align-items: flex-start; gap: 10px; }
        .img-preview-wrap img { width: 100%; max-width: 220px; height: 132px; object-fit: cover; border: 1px solid var(--border); }
        .img-remove-btn { background: #fff; border: 1.5px solid #e2e2e2; color: #777; padding: 7px 14px; font-family: inherit; font-size: 12.5px; font-weight: 600; border-radius: 0; cursor: pointer; transition: 0.2s; }
        .img-remove-btn:hover { border-color: #d11; color: #d11; }

        /* Горизонтальний скрол для таблиць на вузьких екранах */
        .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .table-wrap table { min-width: 640px; }

        /* Адаптив */
        @media (max-width: 768px) {
            .admin-nav { height: auto; padding: 16px; flex-wrap: wrap; gap: 12px; }
            .admin-nav .view-site { margin-left: 0; }
            .container { margin: 28px auto; padding: 0 16px; }
            h2.page-title { font-size: 22px; }
            .tabs { flex-wrap: wrap; gap: 2px; }
            .tab-btn { font-size: 14px; padding: 10px 12px; }
            .form-grid { grid-template-columns: 1fr; gap: 14px; padding: 18px; }
            .form-group.full, .submit-btn { grid-column: span 1; }
        }
        @media (max-width: 480px) {
            .container { margin: 20px auto; }
            h2.page-title { font-size: 20px; }
        }
    </style>
</head>
<body>

<nav class="admin-nav">
    <span class="brand">Dmytro Kvasha</span>
    <span class="tag">Адмінка</span>
    <a class="view-site" href="/" target="_blank">Перейти на сайт</a>
</nav>

<div class="container">
    <h2 class="page-title">Панель керування</h2>
    <p class="page-sub">Заявки з форми та керування портфоліо сайту</p>

    <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('leads')">Заявки з форми (<span id="leads-count">0</span>)</button>
        <button class="tab-btn" onclick="switchTab('portfolio')">Управління портфоліо</button>
    </div>

    <div id="tab-leads" class="tab-content active">
        <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Дата</th>
                    <th>Ім'я</th>
                    <th>Телефон</th>
                    <th>Пошта</th>
                    <th>Спосіб зв'язку</th>
                    <th>Повідомлення</th>
                    <th>Дія</th>
                </tr>
            </thead>
            <tbody id="submissions-table">
                <tr><td colspan="7" style="text-align:center; color:#999;">Завантаження...</td></tr>
            </tbody>
        </table>
        </div>
    </div>

    <div id="tab-portfolio" class="tab-content">
        <h3 id="form-title">Додати нову роботу в портфоліо</h3>
        <form id="project-form" onsubmit="addProject(event)" class="form-grid">
            <input type="hidden" id="p-current-img" value="">
            <div class="form-group">
                <label>Назва роботи (Укр)</label>
                <input type="text" id="p-titleUk" required placeholder="Наприклад: Сайт корпоративних послуг">
            </div>
            <div class="form-group">
                <label>Назва роботи (Eng)</label>
                <input type="text" id="p-titleEn" required placeholder="Наприклад: Corporate Website">
            </div>
            <div class="form-group">
                <label>Опис (Укр)</label>
                <textarea id="p-descUk" rows="2" placeholder="Короткий опис проекту українською..."></textarea>
            </div>
            <div class="form-group">
                <label>Опис (Eng)</label>
                <textarea id="p-descEn" rows="2" placeholder="Короткий опис проекту англійською..."></textarea>
            </div>
            <div class="form-group">
                <label>Зображення роботи (файл)</label>
                <input type="file" id="p-img" accept="image/*" onchange="previewImage(event)" hidden>
                <div id="img-dropzone" class="img-dropzone" onclick="document.getElementById('p-img').click()">
                    <span class="icon">＋</span>
                    <span>Натисніть, щоб обрати фото</span>
                    <small>JPG, PNG · до 5 МБ</small>
                </div>
                <div id="img-preview-wrap" class="img-preview-wrap">
                    <img id="img-preview" src="" alt="Прев'ю зображення">
                    <button type="button" class="img-remove-btn" onclick="clearImage()">✕ Прибрати фото</button>
                </div>
            </div>
            <div class="form-group">
                <label>Теги (через кому)</label>
                <input type="text" id="p-tags" placeholder="Figma, HTML5, CSS3, JavaScript">
            </div>
            <div class="form-group full">
                <label>Посилання на готовий проект / сайт (Link)</label>
                <input type="text" id="p-link" value="#">
            </div>
            <button type="button" id="cancel-btn" class="cancel-btn" onclick="cancelEdit()">✕ Скасувати редагування</button>
            <button type="submit" id="submit-btn" class="submit-btn">Опублікувати на сайті</button>
        </form>

        <h3>Поточні роботи на сайті</h3>
        <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Прев'ю</th>
                    <th>Назва (UK / EN)</th>
                    <th>Теги</th>
                    <th>Дія</th>
                </tr>
            </thead>
            <tbody id="projects-table">
                <tr><td colspan="4" style="text-align:center; color:#999;">Завантаження проектів...</td></tr>
            </tbody>
        </table>
        </div>
    </div>
</div>

<script>
    function switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        if(tabName === 'leads') {
            document.querySelectorAll('.tab-btn')[0].classList.add('active');
            document.getElementById('tab-leads').classList.add('active');
        } else {
            document.querySelectorAll('.tab-btn')[1].classList.add('active');
            document.getElementById('tab-portfolio').classList.add('active');
        }
    }

    // Завантаження заявок
    async function loadLeads() {
        const res = await fetch('/admin/api/submissions');
        const data = await res.json();
        document.getElementById('leads-count').innerText = data.length;
        const tbody = document.getElementById('submissions-table');
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999;">Заявок поки немає</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(row => {
            let badgeClass = 'call';
            if(row.messenger.toLowerCase().includes('telegram')) badgeClass = 'tg';
            if(row.messenger.toLowerCase().includes('viber')) badgeClass = 'viber';

            return \`
                <tr>
                    <td style="color:#666; font-size:12px;">\${row.date}</td>
                    <td style="font-weight:bold;">\${row.name}</td>
                    <td><a class="phone-link" href="tel:\${row.phone}">\${row.phone}</a></td>
                    <td>\${row.email ? \`<a class="phone-link" href="mailto:\${row.email}">\${row.email}</a>\` : '<span style="color:#999;">—</span>'}</td>
                    <td><span class="badge \${badgeClass}">\${row.messenger}</span> \${row.nick !== '—' ? \`<br><small style="color:#666;">\${row.nick}</small>\` : ''}</td>
                    <td style="max-width:300px; color:#444;">\${row.message}</td>
                    <td><button class="delete-btn" onclick="deleteLead(\${row.id})">Видалити</button></td>
                </tr>
            \`;
        }).join('');
    }

    async function deleteLead(id) {
        if(!confirm('Видалити цю заявку?')) return;
        await fetch('/admin/api/submissions/' + id, { method: 'DELETE' });
        loadLeads();
    }

    // Завантаження проектів
    async function loadProjects() {
        const res = await fetch('/api/projects');
        const data = await res.json();
        const tbody = document.getElementById('projects-table');

        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Портфоліо порожнє</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(p => \`
            <tr>
                <td><img src="\${p.img}" class="proj-img-preview" alt=""></td>
                <td><b>\${p.titleUk}</b><br><span style="color:#666; font-size:12px;">\${p.titleEn}</span></td>
                <td>\${p.tags.map(t => \`<span class="badge">\${t}</span>\`).join(' ')}</td>
                <td>
                    <button class="edit-btn" onclick="editProject(\${p.id})">Редагувати</button>
                    <button class="delete-btn" onclick="deleteProject(\${p.id})">Видалити</button>
                </td>
            </tr>
        \`).join('');
    }

    // ── Стан режиму редагування ──
    let editMode = false;
    let editProjectId = null;

    // Заповнити форму даними обраного проекту
    async function editProject(id) {
        const res = await fetch('/api/projects');
        const data = await res.json();
        const p = data.find(x => x.id === id);
        if (!p) return;

        editMode = true;
        editProjectId = id;

        document.getElementById('p-titleUk').value = p.titleUk;
        document.getElementById('p-titleEn').value = p.titleEn;
        document.getElementById('p-descUk').value  = p.descUk;
        document.getElementById('p-descEn').value  = p.descEn;
        document.getElementById('p-tags').value     = p.tags.join(', ');
        document.getElementById('p-link').value     = p.link;
        document.getElementById('p-current-img').value = p.img;

        // Показуємо прев'ю поточного зображення
        if (p.img) {
            document.getElementById('img-preview').src = p.img;
            document.getElementById('img-preview-wrap').style.display = 'flex';
            document.getElementById('img-dropzone').style.display    = 'none';
        }

        document.getElementById('form-title').textContent    = 'Редагувати роботу';
        document.getElementById('submit-btn').textContent    = 'Зберегти зміни';
        document.getElementById('cancel-btn').style.display  = 'block';

        document.getElementById('project-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Скасувати редагування і повернути форму до стану "додати"
    function cancelEdit() {
        editMode = false;
        editProjectId = null;

        document.getElementById('project-form').reset();
        clearImage();
        document.getElementById('p-link').value        = '#';
        document.getElementById('p-current-img').value = '';

        document.getElementById('form-title').textContent   = 'Додати нову роботу в портфоліо';
        document.getElementById('submit-btn').textContent   = 'Опублікувати на сайті';
        document.getElementById('cancel-btn').style.display = 'none';
    }

    async function addProject(e) {
        e.preventDefault();

        // 1. Завантажуємо нове зображення, якщо обране
        let imgUrl = document.getElementById('p-current-img').value; // для режиму редагування — зберігаємо старе
        const fileInput = document.getElementById('p-img');
        if (fileInput.files[0]) {
            const fd = new FormData();
            fd.append('image', fileInput.files[0]);
            const up = await fetch('/admin/api/upload', { method: 'POST', body: fd });
            if (!up.ok) {
                alert('Не вдалося завантажити зображення (перевірте формат і розмір до 5 МБ)');
                return;
            }
            const upData = await up.json();
            imgUrl = upData.url;
        }

        // 2. Зберігаємо або оновлюємо проект
        const body = {
            titleUk: document.getElementById('p-titleUk').value,
            titleEn: document.getElementById('p-titleEn').value,
            descUk:  document.getElementById('p-descUk').value,
            descEn:  document.getElementById('p-descEn').value,
            img:     imgUrl,
            tags:    document.getElementById('p-tags').value,
            link:    document.getElementById('p-link').value
        };

        const method = editMode ? 'PUT' : 'POST';
        const url    = editMode ? '/admin/api/projects/' + editProjectId : '/admin/api/projects';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const msg = editMode ? 'Проект успішно оновлено!' : 'Проект успішно додано!';
            cancelEdit();
            loadProjects();
            alert(msg);
        }
    }

    // Прев'ю обраного фото + можливість прибрати його ДО завантаження
    function previewImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('img-preview').src = ev.target.result;
            document.getElementById('img-preview-wrap').style.display = 'flex';
            document.getElementById('img-dropzone').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    function clearImage() {
        const input = document.getElementById('p-img');
        input.value = '';
        document.getElementById('img-preview').src = '';
        document.getElementById('img-preview-wrap').style.display = 'none';
        document.getElementById('img-dropzone').style.display = 'flex';
    }

    async function deleteProject(id) {
        if(!confirm('Видалити цей проект з портфоліо?')) return;
        await fetch('/admin/api/projects/' + id, { method: 'DELETE' });
        loadProjects();
    }

    // Перший запуск
    loadLeads();
    loadProjects();
</script>
</body>
</html>
    `);
});

// --- СТОРІНКА 404 ---
app.use((req, res) => {
    res.status(404).send(`
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8"/>
    <title>404 — Сторінку не знайдено</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fafafa; margin: 0; }
        .card { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h1 { margin: 0 0 10px; font-size: 40px; color: #333; }
        p { color: #666; margin: 0 0 20px; }
        a { display: inline-block; padding: 10px 20px; background: #000; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>404</h1>
        <p>Упс! Сторінку, яку ви шукаєте, не знайдено.</p>
        <a href="/">На головну</a>
    </div>
</body>
</html>
    `);
});

// --- КРИТИЧНО НЕОБХІДНИЙ ЗАПУСК СЕРВЕРА ---
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  СЕРВЕР УСПІШНО ЗАПУЩЕНО!`);
    console.log(`  Адреса сайту: http://localhost:${PORT}`);
    console.log(`   Адмінка:      http://localhost:${PORT}/admin`);
    console.log(`=========================================`);
});