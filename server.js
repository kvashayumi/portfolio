// @ts-nocheck
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const winston    = require('winston');
const rateLimit  = require('express-rate-limit');
const Database   = require('better-sqlite3');
require('winston-daily-rotate-file');

const app  = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

// Видалення проекту
app.delete('/admin/api/projects/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
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
    <title>Панель керування портфоліо</title>
    <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background-color: #f4f6f8; color: #111; margin: 0; padding: 40px 20px; }
        .container { max-width: 1100px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; font-size: 24px; font-weight: 700; color: #111; display: flex; align-items: center; justify-content: space-between; }
        
        /* Вкладки (Tabs) */
        .tabs { display: flex; gap: 10px; margin-bottom: 25px; border-bottom: 2px solid #eaeaea; padding-bottom: 10px; }
        .tab-btn { background: none; border: none; font-size: 16px; font-weight: 600; color: #666; padding: 8px 16px; cursor: pointer; transition: 0.2s; border-radius: 6px; }
        .tab-btn.active { color: #0070f3; background: #e6f0ff; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* Стилі таблиць */
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; margin-top: 10px; }
        th { background-color: #fafafa; padding: 12px; font-weight: 600; color: #444; border-bottom: 2px solid #eaeaea; }
        td { padding: 12px; border-bottom: 1px solid #eaeaea; vertical-align: middle; }
        tr:hover { background-color: #f9fbfd; }
        
        .badge { display: inline-block; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: bold; background: #eaeaea; text-transform: uppercase; }
        .badge.tg { background: #e1f3ff; color: #0088cc; }
        .badge.viber { background: #f3e9fa; color: #7340d3; }
        .badge.call { background: #e6f9ed; color: #107c41; }
        
        .phone-link { color: #0070f3; text-decoration: none; font-weight: 500; }
        .phone-link:hover { text-decoration: underline; }
        .delete-btn { background: #ffebeb; color: #ff3333; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: 0.2s; }
        .delete-btn:hover { background: #ff3333; color: white; }

        /* Секція форми проектів */
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #fafafa; padding: 20px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #eaeaea; }
        .form-group { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .form-group.full { grid-column: span 2; }
        label { font-size: 13px; font-weight: 600; color: #444; }
        input, textarea { width: 100%; max-width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
        textarea { resize: vertical; min-height: 64px; }
        input:focus, textarea:focus { border-color: #0070f3; outline: none; }
        .submit-btn { grid-column: span 2; background: #0070f3; color: white; border: none; padding: 12px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: 0.2s; }
        .submit-btn:hover { background: #0059c6; }

        .proj-img-preview { width: 60px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #eee; }

        /* Горизонтальний скрол для таблиць на вузьких екранах */
        .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .table-wrap table { min-width: 640px; }

        /* Адаптив */
        @media (max-width: 768px) {
            body { padding: 20px 12px; }
            .container { padding: 20px 16px; border-radius: 10px; }
            h1 { font-size: 20px; flex-direction: column; align-items: flex-start; gap: 10px; }
            .tabs { flex-wrap: wrap; gap: 6px; }
            .tab-btn { font-size: 14px; padding: 8px 12px; }
            .form-grid { grid-template-columns: 1fr; gap: 12px; padding: 16px; }
            .form-group.full, .submit-btn { grid-column: span 1; }
        }
        @media (max-width: 480px) {
            body { padding: 12px 8px; }
            .container { padding: 16px 12px; }
            h1 { font-size: 18px; }
        }
    </style>
</head>
<body>

<div class="container">
    <h1>Панель керування <span style="font-size: 14px; background: #0070f3; color: white; padding: 4px 10px; border-radius: 20px;">CMS SQLite</span></h1>
    
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
        <h3>Додати нову роботу в портфоліо</h3>
        <form id="project-form" onsubmit="addProject(event)" class="form-grid">
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
                <label>Посилання на зображення (URL)</label>
                <input type="url" id="p-img" placeholder="https://images.unsplash.com/...">
            </div>
            <div class="form-group">
                <label>Теги (через кому)</label>
                <input type="text" id="p-tags" placeholder="Figma, HTML5, CSS3, JavaScript">
            </div>
            <div class="form-group full">
                <label>Посилання на готовий проект / сайт (Link)</label>
                <input type="text" id="p-link" value="#">
            </div>
            <button type="submit" class="submit-btn">Опублікувати на сайті</button>
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
                <td><button class="delete-btn" onclick="deleteProject(\${p.id})">Видалити</button></td>
            </tr>
        \`).join('');
    }

    async function addProject(e) {
        e.preventDefault();
        const body = {
            titleUk: document.getElementById('p-titleUk').value,
            titleEn: document.getElementById('p-titleEn').value,
            descUk: document.getElementById('p-descUk').value,
            descEn: document.getElementById('p-descEn').value,
            img: document.getElementById('p-img').value,
            tags: document.getElementById('p-tags').value,
            link: document.getElementById('p-link').value
        };

        const res = await fetch('/admin/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if(res.ok) {
            document.getElementById('project-form').reset();
            document.getElementById('p-link').value = "#";
            loadProjects();
            alert('Проект успішно додано!');
        }
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