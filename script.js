// =====================================================
//  МОДАЛКА ПРОЄКТУ (відкриття + навігація між проєктами)
// =====================================================

// Індекс проєкту, який зараз відкритий у модальному вікні
window._currentProjectIndex = 0;

// Відкриває модалку проєкту за його індексом у масиві даних
function openProjectModal(dataIndex) {
    const lang = localStorage.getItem('lang') || 'uk';   // поточна мова (uk за замовчуванням)
    const data = window._portfolioData;
    if (!data || !data[dataIndex]) return;                // немає таких даних — виходимо

    window._currentProjectIndex = dataIndex;
    const item = data[dataIndex];

    // Заповнюємо вміст модалки даними проєкту (текст залежить від мови)
    document.getElementById('pmImg').src       = item.img;
    document.getElementById('pmImg').alt       = lang === 'uk' ? item.titleUk : item.titleEn;
    document.getElementById('pmTitle').textContent = lang === 'uk' ? item.titleUk : item.titleEn;
    document.getElementById('pmDesc').textContent  = lang === 'uk' ? item.descUk  : item.descEn;
    document.getElementById('pmLink').href = item.link;
    document.getElementById('pmLink').textContent  = lang === 'uk' ? 'Переглянути сайт' : 'View Site';

    const tagsEl = document.getElementById('pmTags');

    // Теги можуть прийти як JSON-рядок, масив або рядок через кому — зводимо все до масиву
    let tagsArray = [];
    try {
        tagsArray = typeof item.tags === 'string' ? JSON.parse(item.tags) : (Array.isArray(item.tags) ? item.tags : []);
    } catch (e) {
        tagsArray = item.tags ? item.tags.split(',').map(t => t.trim()) : [];
    }

    // Рендеримо теги у вигляді span-ів
    tagsEl.innerHTML = tagsArray.map(t => `<span class="project-tag">${t}</span>`).join('');

    // Ховаємо стрілки навігації, коли немає куди перемикати (перший / останній проєкт)
    const prevBtn = document.getElementById('pmPrev');
    const nextBtn = document.getElementById('pmNext');
    prevBtn.classList.toggle('hidden', dataIndex === 0);
    nextBtn.classList.toggle('hidden', dataIndex === data.length - 1);

    // Показуємо модалку (Bootstrap)
    bootstrap.Modal.getOrCreateInstance(document.getElementById('projectModal')).show();
}

// Перемикання на попередній/наступний проєкт (direction = -1 або +1)
function navigateProject(direction) {
    const data = window._portfolioData;
    const newIndex = window._currentProjectIndex + direction;
    if (newIndex >= 0 && newIndex < data.length) {
        openProjectModal(newIndex);
    }
}

// =====================================================
//  ОСНОВНА ЛОГІКА — стартує після завантаження DOM
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    
    // --- ДИНАМІЧНІ ДАНІ ПОРТФОЛІО (Завантажуються з БД) ---
    let portfolioData = [];          // масив проєктів із сервера
    const itemsPerPage = 3;          // скільки карток показувати спочатку
    let isExpanded = false;          // чи розгорнутий повний список робіт
    
    const portfolioGrid = document.getElementById('portfolioGrid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    let lang = localStorage.getItem('lang') || 'uk';

    // --- Анімація ліній на фоні (Canvas) ---
    const canvas = document.getElementById('linesCanvas');
    const ctx = canvas.getContext('2d');
    let w, h, lines = [];

    // Розрахунок розмірів полотна + генерація 6 хвилястих ліній з випадковими параметрами
    const init = () => {
        w = canvas.width = canvas.offsetWidth;
        h = canvas.height = canvas.offsetHeight;
        lines = Array.from({length: 6}, () => ({
            y: Math.random() * h,
            speed: 0.0015 + Math.random() * 0.002,
            offset: Math.random() * Math.PI * 2,
            amp: 30 + Math.random() * 40
        }));
    };

    // Малювання одного кадру (синусоїдні лінії); цикл через requestAnimationFrame
    const draw = (t) => {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        lines.forEach(l => {
            ctx.beginPath();
            ctx.moveTo(0, l.y);
            for(let x = 0; x <= w; x += 10) {
                ctx.lineTo(x, l.y + Math.sin(t * l.speed + x * 0.008 + l.offset) * l.amp);
            }
            ctx.stroke();
        });
        requestAnimationFrame(draw);
    };

    window.addEventListener('resize', init);   // перерахунок ліній при зміні розміру вікна
    init();
    draw(0);

    // Пауза анімації, коли вкладка неактивна (економія ресурсів)
    let rafId;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
        } else {
            init();
        }
    });

    // --- ФУНКЦІЯ ЗАВАНТАЖЕННЯ ДАНИХ З АДМІНКИ (API) ---
    // Тягне список проєктів з /api/projects і запускає рендер
    async function fetchPortfolio() {
        try {
            const response = await fetch('/api/projects'); 
            if (!response.ok) throw new Error('Помилка при отриманні даних з сервера');
            
            portfolioData = await response.json();
            window._portfolioData = portfolioData;   // зберігаємо глобально (для модалки проєкту)
            
            renderPortfolio(); 
        } catch (error) {
            // Сервер недоступний — показуємо повідомлення про помилку
            console.error('Помилка завантаження проєктів:', error);
            portfolioGrid.innerHTML = `
                <div class="col-10 text-center py-5 mx-auto">
                    <p class="text-danger fw-medium">${lang === 'uk' ? 'Не вдалося завантажити проєкти. Будь ласка, спробуйте пізніше.' : 'Failed to load projects. Please try again later.'}</p>
                </div>`;
        }
    }

    // --- ДИНАМІЧНА ГЕНЕРАЦІЯ ТА ЗГОРТАННЯ ПОРТФОЛІО ---

    // Генерує HTML однієї картки проєкту (animate — чи додавати анімацію появи)
    const buildCard = (item, dataIndex, animIndex, animate) => {
        const title   = lang === 'uk' ? item.titleUk : item.titleEn;
        const desc    = lang === 'uk' ? item.descUk  : item.descEn;
        
        // Текст кнопки на картці
        const btnText = lang === 'uk' ? 'Детальніше' : 'Details'; 
        
        // Затримка для каскадної появи карток (або зовсім без анімації)
        const delay   = animate ? `animation-delay:${animIndex * 0.1}s` : 'animation:none;opacity:1';
        return `
            <div class="col-md-4 portfolio-item" style="${delay}">
                <div class="card portfolio-card border-0 h-100 d-flex flex-column"
                     onclick="openProjectModal(${dataIndex})"
                     onkeydown="if(event.key==='Enter'||event.key===' ')openProjectModal(${dataIndex})"
                     tabindex="0"
                     role="button"
                     aria-label="${title}">
                    <img src="${item.img}" class="portfolio-img" alt="${title}">
                    <div class="card-body px-0 pt-3 d-flex flex-column">
                        <h5 class="fw-bold">${title}</h5>
                        <p class="text-secondary small mb-4">${desc}</p>
                        <button class="btn btn-dark btn-sm text-white mt-auto align-self-start px-4">${btnText}</button>
                    </div>
                </div>
            </div>`;
    };

    // Рендерить перші 3 картки; якщо проєктів немає — повідомлення, кнопку «Ще» ховаємо
    const renderPortfolio = () => {
        portfolioGrid.innerHTML = '';
        if (portfolioData.length === 0) {
            portfolioGrid.innerHTML = `<p class="text-muted text-center w-100">${lang === 'uk' ? 'Немає доступних проєктів.' : 'No projects available.'}</p>`;
            loadMoreBtn.style.display = 'none';
            return;
        }
        
        // Кнопку «Показати ще» показуємо тільки якщо проєктів більше за ліміт
        loadMoreBtn.style.display = portfolioData.length > itemsPerPage ? 'inline-block' : 'none';
        
        const limit = Math.min(itemsPerPage, portfolioData.length);
        for (let i = 0; i < limit; i++) {
            portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i, true));
        }
        updateBtn();
    };

    // Оновлює напис кнопки залежно від стану (Показати ще / Згорнути) і мови
    const updateBtn = () => {
        if (!loadMoreBtn) return;
        loadMoreBtn.innerText = isExpanded
            ? (lang === 'uk' ? loadMoreBtn.getAttribute('data-uk-less') : loadMoreBtn.getAttribute('data-en-less'))
            : (lang === 'uk' ? loadMoreBtn.getAttribute('data-uk')      : loadMoreBtn.getAttribute('data-en'));
    };

    // Клік по кнопці «Показати ще / Згорнути»
    loadMoreBtn.addEventListener('click', () => {
        if (!isExpanded) {
            // Розгортаємо: додаємо решту карток
            isExpanded = true;
            for (let i = itemsPerPage; i < portfolioData.length; i++) {
                portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i - itemsPerPage, true));
            }
        } else {
            // Згортаємо: плавно ховаємо й видаляємо зайві картки, потім скрол до секції
            isExpanded = false;
            const allItems = portfolioGrid.querySelectorAll('.portfolio-item');
            const extras = [...allItems].filter((_, i) => i >= itemsPerPage);
            extras.forEach(el => {
                el.style.transition = 'opacity 0.2s ease';
                el.style.opacity = '0';
            });
            setTimeout(() => {
                extras.forEach(el => el.remove());
                document.getElementById('portfolio').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 220);
        }
        updateBtn();
    });

    // --- Перемикач мов ---
    const langBtn = document.getElementById('langBtn');

    // Якщо при завантаженні вже вибрано EN — одразу перекладаємо весь текст і плейсхолдери
    if (lang === 'en') {
        langBtn.innerText = 'UK';
        document.querySelectorAll('[data-uk]').forEach(el => {
            el.innerHTML = el.getAttribute('data-en');
        });
        document.querySelectorAll('[data-uk-placeholder]').forEach(input => {
            input.placeholder = input.getAttribute('data-en-placeholder');
        });
    }

    // Клік по кнопці мови — перемикаємо uk <-> en і зберігаємо вибір
    langBtn.addEventListener('click', () => {
        lang = lang === 'uk' ? 'en' : 'uk';
        localStorage.setItem('lang', lang);
        langBtn.innerText = lang === 'uk' ? 'EN' : 'UK';
        
        // Перекладаємо всі тексти з атрибутами data-uk / data-en
        document.querySelectorAll('[data-uk]').forEach(el => {
            el.innerHTML = el.getAttribute(`data-${lang}`);
        });

        // Перекладаємо плейсхолдери полів
        document.querySelectorAll('[data-uk-placeholder]').forEach(input => {
            input.placeholder = input.getAttribute(`data-${lang}-placeholder`);
        });

        // Окремо перекладаємо плейсхолдер поля нікнейму месенджера
        const mInput = document.getElementById('messengerNick');
        if (mInput) {
            mInput.placeholder = lang === 'uk' ? "@username (необов'язково)" : "@username (optional)";
        }

        // Перемальовуємо картки портфоліо новою мовою (без анімації)
        portfolioGrid.innerHTML = '';
        const limit = isExpanded ? portfolioData.length : Math.min(itemsPerPage, portfolioData.length);
        for (let i = 0; i < limit; i++) {
            portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i, false));
        }
        updateBtn();
    });

    fetchPortfolio();   // перше завантаження проєктів

    // --- ЛОГІКА МЕСЕНДЖЕРІВ ---
    const mCheck = document.getElementById('messengerCheck');
    const mBlock = document.getElementById('messengerBlock');
    const mInput = document.getElementById('messengerNick');
    const tgBlock = document.getElementById('telegramNickBlock');

    // Чекбокс «зв'язатися через месенджер»
    if (mCheck) {
        mCheck.addEventListener('change', () => {
            if (mCheck.checked) {
                mBlock.style.display = 'block';
                // За замовчуванням обираємо Telegram і показуємо поле для ніку
                document.querySelectorAll('.msg-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.msg-btn[data-type="Telegram"]')?.classList.add('active');
                if (tgBlock) tgBlock.style.display = 'block';
            } else {
                // Знято галочку — ховаємо блок і чистимо поле
                mBlock.style.display = 'none';
                if (mInput) {
                    mInput.value = ""; 
                    mInput.classList.remove('is-invalid', 'is-valid');
                }
            }
        });
    }
    
    // Кнопки вибору месенджера (Telegram / Viber / WhatsApp тощо)
    document.querySelectorAll('.msg-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            // Робимо активною лише натиснуту кнопку
            document.querySelectorAll('.msg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Поле для ніку показуємо тільки для Telegram, для інших — ховаємо й чистимо
            if (this.getAttribute('data-type') === 'Telegram') {
                if (tgBlock) tgBlock.style.display = 'block';
            } else {
                if (tgBlock) tgBlock.style.display = 'none';
                if (mInput) {
                    mInput.value = "";
                    mInput.classList.remove('is-invalid', 'is-valid');
                }
            }
        });
    });

    // --- ІНІЦІАЛІЗАЦІЯ ПЛАГІНУ ТЕЛЕФОНУ ТА ЖИВА ВАЛІДАЦІЯ ---
    const nameInput = document.getElementById('userName');
    const phoneInput = document.getElementById('userPhone');
    
    let iti;
    if (phoneInput) {
        // Підключаємо intl-tel-input (вибір країни + код), стартова країна — Україна
        iti = window.intlTelInput(phoneInput, {
            initialCountry: "ua", 
            preferredCountries: [], 
            separateDialCode: false, 
            autoPlaceholder: "off",
            utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js" 
        });

        // Підставляємо код країни у поле одразу
        phoneInput.value = "+" + iti.getSelectedCountryData().dialCode + " ";

        // Вручну позиціонуємо випадаючий список країн (під полем, висота — до кнопки відправки)
        const positionDropdown = () => {
            const dropdown = document.querySelector('.iti__country-list');
            if (!dropdown) return;
            const itiWrapper = phoneInput.closest('.iti') || phoneInput.parentElement;
            const submitBtn  = document.getElementById('submitForm');
            const inputRect  = itiWrapper.getBoundingClientRect();
            const submitRect = submitBtn.getBoundingClientRect();

            dropdown.style.left      = inputRect.left   + 'px';
            dropdown.style.width     = inputRect.width  + 'px';
            dropdown.style.top       = inputRect.bottom + 'px';
            dropdown.style.maxHeight = Math.max(50, submitRect.bottom - inputRect.bottom) + 'px';
        };

        // Перепозиціонування списку при відкритті та при зміні розміру вікна
        phoneInput.addEventListener('open:countrydropdown', positionDropdown);
        window.addEventListener('resize', () => {
            const dropdown = document.querySelector('.iti__country-list');
            if (dropdown && !dropdown.classList.contains('iti__hide')) positionDropdown();
        });

        // Зміна країни — скидаємо валідацію і підставляємо новий код (якщо поле не у фокусі)
        phoneInput.addEventListener("countrychange", () => {
            phoneInput.classList.remove('is-invalid', 'is-valid');
            if (document.activeElement !== phoneInput) {
                const dialCode = iti.getSelectedCountryData().dialCode;
                if (dialCode) phoneInput.value = "+" + dialCode + " ";
            }
        });

        // Визначає максимальну довжину національної частини номера для поточної країни
        const getMaxNationalLength = () => {
            try {
                const iso2 = iti.getSelectedCountryData().iso2;
                const dialCode = iti.getSelectedCountryData().dialCode;
                const example = window.intlTelInputUtils.getExampleNumber(iso2, false, window.intlTelInputUtils.numberType.MOBILE);
                return example.replace(/\D/g, '').length - dialCode.length;
            } catch (e) { return 15; }   // fallback, якщо приклад недоступний
        };

        // Жива маска/форматування номера під час введення
        phoneInput.addEventListener('input', () => {
            phoneInput.classList.remove('is-invalid');
            let val = phoneInput.value;
            if (!val || val === "+") { phoneInput.value = "+"; return; }   // лишаємо «+», якщо порожньо
            if (!val.startsWith('+')) val = '+' + val.replace(/\+/g, '');  // гарантуємо «+» на початку
            let digits = val.replace(/\D/g, "");                            // лишаємо тільки цифри
            const dialCode = iti.getSelectedCountryData().dialCode;
            
            // Якщо є код країни — форматуємо національну частину групами (XX XXX XX XX)
            if (dialCode && digits.startsWith(dialCode) && digits.length > dialCode.length) {
                let nationalPart = digits.slice(dialCode.length);
                const maxLen = getMaxNationalLength();
                if (nationalPart.length > maxLen) nationalPart = nationalPart.slice(0, maxLen);   // обрізаємо зайве
                
                let formattedNational = "";
                if (nationalPart.length > 0) {
                    if (nationalPart.length <= 2) formattedNational = nationalPart;
                    else if (nationalPart.length <= 5) formattedNational = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5);
                    else if (nationalPart.length <= 7) formattedNational = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5) + " " + nationalPart.slice(5, 7);
                    else formattedNational = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5) + " " + nationalPart.slice(5, 7) + " " + nationalPart.slice(7);
                }
                phoneInput.value = "+" + dialCode + " " + formattedNational;
            } else {
                phoneInput.value = "+" + digits;
            }

            // Підсвічуємо зеленим, якщо номер валідний
            if (iti.isValidNumber()) phoneInput.classList.add('is-valid');
            else phoneInput.classList.remove('is-valid');
        });
    }

    // --- ЖИВА ВАЛІДАЦІЯ ІМЕНІ (Дозволяємо писати все, але підсвічуємо помилку) ---
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            // Заборонені будь-які символи, крім літер, пробілів, дефіса й апострофа
            const hasInvalidChars = /[^\p{L}\s\-']/u.test(nameInput.value);
            
            if (nameInput.value.trim().length >= 2 && !hasInvalidChars) {
                nameInput.classList.remove('is-invalid');
                nameInput.classList.add('is-valid');     // 2+ символи й усе коректно — зелений
            } else {
                nameInput.classList.remove('is-valid');
                if (hasInvalidChars) {
                    nameInput.classList.add('is-invalid'); // Показуємо червоний бордер відразу при введенні цифри/символу
                } else {
                    nameInput.classList.remove('is-invalid');
                }
            }
        });
    }

    // --- ВАЛІДАЦІЯ ПОЛЯ МЕСЕНДЖЕРА (необов'язкове) ---
    if (mInput) {
        mInput.addEventListener('input', () => {
            if (mInput.value.trim().length > 0) {
                mInput.classList.remove('is-invalid');
                mInput.classList.add('is-valid');
            } else {
                // Поле необов'язкове, тому при порожньому значенні просто знімаємо обведення
                mInput.classList.remove('is-valid', 'is-invalid');
            }
        });
    }

    // --- TOAST + VALIDATION BANNER ---
    // Показує спливне сповіщення (тост) заданого типу на ~3.5 с
    const showToast = (msg, type = 'success') => {
        const icons = { success: 'bi-check-circle', error: 'bi-x-circle', warning: 'bi-exclamation-circle', limit: 'bi-clock' };
        const container = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast-msg toast-${type}`;
        el.innerHTML = `<i class="bi ${icons[type] || icons.success} toast-icon"></i><span>${msg}</span>`;
        container.appendChild(el);
        // Подвійний rAF — щоб спрацювала CSS-анімація появи
        requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 320);   // прибираємо з DOM після зникнення
        }, 3500);
    };

    // Показує банер помилки валідації над формою на ~4 с
    const showBanner = (msg) => {
        const banner = document.getElementById('validationBanner');
        if (!banner) return;
        banner.textContent = msg;
        banner.style.display = 'block';
        clearTimeout(banner._timer);
        banner._timer = setTimeout(() => { banner.style.display = 'none'; }, 4000);
    };

    // --- Відправка контактної форми ---
    const contactForm = document.getElementById('submitForm');
    if (contactForm) {
        contactForm.addEventListener('click', async function(e) {
            e.preventDefault();
            
            // Збираємо значення всіх полів форми
            const submitBtn = this;
            const name = nameInput ? nameInput.value : '';
            const emailInput = document.getElementById('userEmail');
            const email = emailInput ? emailInput.value.trim() : '';
            const message = document.getElementById('userMessage').value;
            const isMessenger = mCheck ? mCheck.checked : false;
            const activeMsgBtn = document.querySelector('.msg-btn.active');
            const messengerType = activeMsgBtn ? activeMsgBtn.innerText : '';
            const messengerNick = mInput ? mInput.value : '';
            const honeypot = document.getElementById('username_hp')?.value || '';   // приховане поле-пастка для ботів

            const totalDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';   // тільки цифри номера
            
            // Скидаємо попередні стани валідації
            if (nameInput) nameInput.classList.remove('is-invalid', 'is-valid');
            if (phoneInput) phoneInput.classList.remove('is-invalid', 'is-valid');
            if (mInput) mInput.classList.remove('is-invalid', 'is-valid');

            // 1. Перевірка на пусте поле
            if (!name || name.trim().length === 0) {
                if (nameInput) nameInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Будь ласка, введіть ваше ім'я." : "Please enter your name.");
                if (nameInput) nameInput.focus();
                return;
            }
            // 2. Перевірка на довжину
            if (name.trim().length < 2) {
                if (nameInput) nameInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Введіть справжнє ім'я — мінімум 2 символи." : "Please enter your real name — at least 2 characters.");
                if (nameInput) nameInput.focus();
                return;
            }
            // 3. ПЕРЕВІРКА НА ЗАБОРОНЕНІ СИМВОЛИ ПРИ ВІДПРАВЦІ
            if (/[^\p{L}\s\-']/u.test(name)) {
                if (nameInput) nameInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Ім'я не повинно містити цифри або спеціальні символи." : "Name must not contain digits or special characters.");
                if (nameInput) nameInput.focus();
                return;
            }
            if (nameInput) nameInput.classList.add('is-valid');

            // 4. Телефон — обов'язковий і має бути валідним
            if (totalDigits.length === 0) {
                if (phoneInput) phoneInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Будь ласка, введіть номер телефону." : "Please enter your phone number.");
                if (phoneInput) phoneInput.focus();
                return;
            }
            if (iti && !iti.isValidNumber()) {
                if (phoneInput) phoneInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Введіть коректний номер телефону." : "Please enter a valid phone number.");
                if (phoneInput) phoneInput.focus();
                return;
            }
            if (phoneInput) phoneInput.classList.add('is-valid');

            // 5. Пошта — необов'язкове поле; перевіряємо формат лише якщо заповнено
            if (emailInput) emailInput.classList.remove('is-invalid', 'is-valid');
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (emailInput) emailInput.classList.add('is-invalid');
                showBanner(lang === 'uk' ? "Введіть коректну адресу пошти." : "Please enter a valid email address.");
                if (emailInput) emailInput.focus();
                return;
            }
            if (email && emailInput) emailInput.classList.add('is-valid');

            // Нік месенджера необов'язковий — лише підсвічуємо, якщо заповнено
            if (isMessenger && mInput && mInput.value.trim().length > 0) {
                mInput.classList.add('is-valid');
            }

            // Блокуємо кнопку на час відправки
            const originalBtnText = submitBtn.innerText;
            submitBtn.innerText = lang === 'uk' ? "Відправляється..." : "Sending...";
            submitBtn.disabled = true;

            // Формуємо тіло запиту; поле messenger залежить від вибору способу зв'язку
            const data = {
                name,
                phone: "+" + totalDigits,
                email,
                message,
                messenger: isMessenger
                    ? messengerType
                    : (email
                        ? (lang === 'uk' ? 'Пошта, Дзвінок' : 'Email, Call')
                        : (lang === 'uk' ? 'Дзвінок' : 'Call')),
                nick: isMessenger ? messengerNick : '-',
                honeypot: honeypot
            };

            try {
                // Відправляємо заявку на сервер
                const response = await fetch('/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json().catch(() => ({}));

                if (response.ok) {
                    // Успіх — тост, закриваємо й чистимо форму
                    showToast(lang === 'uk' ? "Заявку відправлено! Зв'яжуся з вами найближчим часом." : "Request sent! I'll get back to you shortly.", 'success');
                    bootstrap.Modal.getInstance(document.getElementById('contactModal')).hide();
                    document.getElementById('contactForm').reset();
                    if (mBlock) mBlock.style.display = 'none'; 
                    if (phoneInput && iti) phoneInput.value = "+" + iti.getSelectedCountryData().dialCode + " ";
                } else if (response.status === 429) {
                    // Забагато запитів — спрацював rate-limit на сервері
                    showToast(lang === 'uk' ? 'Забагато спроб. Спробуйте через 10 хвилин.' : 'Too many requests. Try again in 10 minutes.', 'limit');
                } else {
                    // Інша помилка від сервера
                    showToast(result.error || (lang === 'uk' ? 'Помилка при відправці. Спробуйте ще раз.' : 'Error while sending. Please try again.'), 'error');
                }
            } catch (error) {
                // Не вдалося з'єднатися з сервером
                console.error('[FORM SUBMIT ERROR]', error);
                showToast(lang === 'uk' ? "Не вдалося з'єднатися з сервером." : 'Could not connect to the server.', 'error');
            } finally {
                // Повертаємо кнопку в робочий стан у будь-якому випадку
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
        });
    }

    // --- DRAWER (Мобільне меню) ---
    const navOverlay = document.getElementById('navOverlay');
    const navbarNav  = document.getElementById('navbarNav');

    if (navbarNav && navOverlay) {
        // Меню відкривається — показуємо затемнення й блокуємо скрол сторінки
        navbarNav.addEventListener('show.bs.collapse', () => {
            navOverlay.style.display = 'block';
            requestAnimationFrame(() => navOverlay.classList.add('show'));
            document.body.style.overflow = 'hidden';
        });
        // Меню закривається — ховаємо затемнення (з затримкою на анімацію) і повертаємо скрол
        navbarNav.addEventListener('hide.bs.collapse', () => {
            navOverlay.classList.remove('show');
            setTimeout(() => { navOverlay.style.display = 'none'; }, 350);
            document.body.style.overflow = '';
        });
        // Клік по затемненню або хрестику закриває меню
        navOverlay.addEventListener('click', () => { bootstrap.Collapse.getInstance(navbarNav)?.hide(); });
        document.getElementById('drawerClose')?.addEventListener('click', () => { bootstrap.Collapse.getInstance(navbarNav)?.hide(); });
        // Клік по будь-якому пункту меню теж закриває його
        document.querySelectorAll('#navbarNav .nav-link').forEach(link => {
            link.addEventListener('click', () => { bootstrap.Collapse.getInstance(navbarNav)?.hide(); });
        });
    }

    // --- ЛІЧИЛЬНИК СИМВОЛІВ ---
    const msgInput   = document.getElementById('userMessage');
    const charCounter = document.getElementById('charCounter');
    const MAX_CHARS  = 500;

    // Лічильник «N / 500» під полем повідомлення + колір при наближенні/досягненні ліміту
    if (msgInput && charCounter) {
        msgInput.addEventListener('input', () => {
            const len = msgInput.value.length;
            charCounter.textContent = `${len} / ${MAX_CHARS}`;
            charCounter.className = 'char-counter';
            if (len >= MAX_CHARS)       charCounter.classList.add('limit');     // досягнуто ліміт
            else if (len >= MAX_CHARS * 0.8) charCounter.classList.add('warn'); // близько до ліміту (80%)
        });
    }

    // --- ОЧИЩЕННЯ ФОРМИ ПРИ ЗАКРИТТІ МОДАЛКИ ---
    // При закритті модалки контактів скидаємо поля, стани валідації та лічильник
    document.getElementById('contactModal')?.addEventListener('hidden.bs.modal', () => {
        document.getElementById('contactForm').reset();
        if (mBlock) mBlock.style.display = 'none';
        if (document.getElementById('validationBanner')) document.getElementById('validationBanner').style.display = 'none';
        if (charCounter) charCounter.textContent = '0 / 500';
        if (phoneInput && iti) phoneInput.value = '+' + iti.getSelectedCountryData().dialCode + ' ';
        if (nameInput) nameInput.classList.remove('is-invalid', 'is-valid');
        if (phoneInput) phoneInput.classList.remove('is-invalid', 'is-valid');
        if (document.getElementById('userEmail')) document.getElementById('userEmail').classList.remove('is-invalid', 'is-valid');
        if (mInput) mInput.classList.remove('is-invalid', 'is-valid');
    });

    // --- ВЕРТИКАЛЬНИЙ АКОРДЕОН ---
    document.querySelectorAll('#servAccordion .v-acc-head').forEach(head => {
        head.addEventListener('click', function () {
            const item = this.closest('.v-acc-item');
            const body = item.querySelector('.v-acc-body');
            const isOpen = item.classList.contains('is-open');

            // Спочатку закриваємо всі пункти (режим «один відкритий»)
            document.querySelectorAll('#servAccordion .v-acc-item').forEach(i => {
                i.classList.remove('is-open');
                i.querySelector('.v-acc-body').style.maxHeight = null;
            });

            // Якщо клікнутий пункт був закритий — відкриваємо його (max-height = реальна висота)
            if (!isOpen) {
                item.classList.add('is-open', 'was-viewed');
                body.style.maxHeight = body.scrollHeight + 'px';
            }
        });
    });

    // --- SCROLL-АНІМАЦІЇ (IntersectionObserver) ---
    // Додає клас .visible, коли елемент .reveal з'являється в зоні видимості
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);   // анімуємо лише один раз
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // --- АНІМАЦІЯ ТАЙМЛАЙНУ (підсвітка крапок + заповнення рамок часу) ---
    const timelineObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                timelineObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.35 });
    document.querySelectorAll('.timeline-item').forEach(item => timelineObserver.observe(item));

    // --- АКТИВНИЙ ПУНКТ МЕНЮ ПРИ СКРОЛІ ---
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    const sectionTitles = { 'portfolio': 'Portfolio', 'about': 'About', 'services': 'Services', 'process': 'Process', 'contact': 'Contact' };

    // Підсвічує пункт меню активної секції + оновлює <title> вкладки
    const navObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                navLinks.forEach(link => link.classList.remove('active-section'));
                const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
                if (active) active.classList.add('active-section');
                const secTitle = sectionTitles[entry.target.id];
                document.title = secTitle ? `Dmytro Kvasha | ${secTitle}` : 'Dmytro Kvasha | Portfolio';
            }
        });
    }, { threshold: 0.35 });

    sections.forEach(s => navObserver.observe(s));

    // --- 3D ВІЗИТКА (Тілт-ефект) ---
    const card = document.getElementById('businessCard');
    if (card) {
        if ('ontouchstart' in window) {
            // На тач-пристроях нахил неможливий — вмикаємо просто «плавання»
            card.style.animation = 'float 5s ease-in-out infinite';
        } else {
            // На десктопі — нахил картки за курсором миші
            card.addEventListener('mousemove', (e) => {
                card.classList.add('is-tilting');
                // Рахуємо зміщення курсора від центру картки (-1..1 по кожній осі)
                const rect = card.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = (e.clientX - cx) / (rect.width / 2);   
                const dy = (e.clientY - cy) / (rect.height / 2);  
                const tiltX = -dy * 14;   // нахил по X залежить від вертикалі
                const tiltY =  dx * 14;   // нахил по Y залежить від горизонталі
                const lift = 28 + Math.abs(dx * 8) + Math.abs(dy * 8);   // «підйом» тіні

                // Застосовуємо 3D-поворот і динамічну тінь
                card.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(20px)`;
                card.style.boxShadow = `${-dx*20}px ${-dy*20 + lift}px 60px rgba(0,0,0,0.35), 0 8px 20px rgba(0,0,0,0.2)`;

                // Переміщуємо відблиск услід за курсором (координати у відсотках)
                const px = ((e.clientX - rect.left) / rect.width) * 100;
                const py = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--shine-x', px + '%');
                card.style.setProperty('--shine-y', py + '%');
                card.style.backgroundImage = `radial-gradient(circle at ${px}% ${py}%, #1a1a1a 0%, #000 60%)`;
            });

            // Курсор пішов з картки — повертаємо все у вихідний стан
            card.addEventListener('mouseleave', () => {
                card.classList.remove('is-tilting');
                card.style.transform = '';
                card.style.boxShadow = '';
                card.style.backgroundImage = '';
            });
        }
    }

    // --- НАВІГАЦІЯ СТРІЛКАМИ В МОДАЛЦІ КЛІЄНТА ---
    // Порядок полів для переходу стрілками ↑/↓
    const formFields = ['userName', 'userPhone', 'userEmail', 'userMessage', 'messengerNick'];
    document.getElementById('contactModal')?.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const idx = formFields.indexOf(active.id);

        // Enter (не на кнопці/textarea) — одразу відправляє форму
        if (e.key === 'Enter' && active.tagName !== 'BUTTON' && active.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('submitForm').click();
        }
        // ↓ — фокус на наступне видиме поле
        if (e.key === 'ArrowDown' && idx !== -1) {
            e.preventDefault();
            for (let i = idx + 1; i < formFields.length; i++) {
                const next = document.getElementById(formFields[i]);
                if (next && next.offsetParent !== null) { next.focus(); break; }
            }
        }
        // ↑ — фокус на попереднє видиме поле
        if (e.key === 'ArrowUp' && idx !== -1) {
            e.preventDefault();
            for (let i = idx - 1; i >= 0; i--) {
                const prev = document.getElementById(formFields[i]);
                if (prev && prev.offsetParent !== null) { prev.focus(); break; }
            }
        }
    });
});