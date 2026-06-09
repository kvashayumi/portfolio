document.addEventListener("DOMContentLoaded", () => {
    
    // =====================================================
    // ДАННЫЕ ПОРТФОЛИО
    // =====================================================
    const portfolioData = [
        {
            img: "https://images.unsplash.com/photo-1547119957-637f8679db1e?auto=format&fit=crop&w=800&q=80",
            titleUk: "Сайт корпоративних послуг",
            titleEn: "Corporate Services Website",
            descUk: "Мінімалістичний веб-сайт для консалтингової компанії. Плавні анімації, інтерактивні форми та повна оптимізація швидкості завантаження.",
            descEn: "A minimalist website for a consulting firm. Features smooth animations, interactive forms, and total load-speed optimization.",
            tags: ["Figma", "HTML5", "CSS3", "JavaScript"],
            link: "#"
        },
        {
            img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
            titleUk: "Платформа E-Commerce",
            titleEn: "E-Commerce Platform",
            descUk: "Сучасний інтернет-магазин одягу з кастомною фільтрацією товарів, інтерактивним кошиком та швидким оформленням замовлення.",
            descEn: "A modern online apparel store featuring custom product filtering, an interactive shopping cart, and rapid checkout mechanics.",
            tags: ["HTML5", "SCSS", "JavaScript", "Bootstrap 5"],
            link: "#"
        },
        {
            img: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80",
            titleUk: "Кастомний Веб-Додаток Weather App",
            titleEn: "Custom Weather Web App",
            descUk: "Інтерактивний додаток погоди з інтеграцією сторонніх API, динамічною зміною фонів під погодні умови та гнучким пошуком.",
            descEn: "An interactive weather application integrating third-party APIs, responsive asset shifts based on atmospheric data, and smart queries.",
            tags: ["JavaScript ES6+", "REST API", "CSS3 Animation"],
            link: "#"
        },
        {
            img: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
            titleUk: "Сайт-візитка студії дизайну",
            titleEn: "Design Studio Business Card Site",
            descUk: "Представницький сайт з унікальними ховер-ефектами, інтегрованим блогом та формою зворотного зв'язку.",
            descEn: "A presentational website featuring unique hover effects, an integrated blog section, and a contact feedback form.",
            tags: ["Figma", "HTML", "CSS", "UI/UX"],
            link: "#"
        },
        {
            img: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=800&q=80",
            titleUk: "Платформа для SaaS стартапу",
            titleEn: "SaaS Startup Product Page",
            descUk: "Лендінг із високою конверсією, інтерактивними таблицями тарифів та кастомною системою тегів.",
            descEn: "A high-conversion landing page with interactive pricing tables and a custom tag system.",
            tags: ["HTML", "CSS", "JavaScript", "Node.js"],
            link: "#"
        },
        {
            img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
            titleUk: "Аналітичний сервіс",
            titleEn: "Analytics Service",
            descUk: "Платформа для візуалізації бізнес-метрик з інтерактивними графіками та експортом даних.",
            descEn: "Platform for visualizing business metrics with interactive charts and data export.",
            tags: ["HTML", "CSS", "D3.js", "REST API"],
            link: "#"
        }
    ];

    window._portfolioData = portfolioData; 
    const itemsPerPage = 3;
    let isExpanded = false;
    const portfolioGrid = document.getElementById('portfolioGrid');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    // =====================================================
    // ЛОКАЛИЗАЦИЯ И ПЕРЕКЛЮЧЕНИЕ ЯЗЫКОВ
    // =====================================================
    const langBtn = document.getElementById('langBtn');
    let lang = localStorage.getItem('lang') || 'uk'; // читаємо збережену мову або UK за замовчуванням

    const updateLanguage = (lng) => {
        lang = lng; // синхронізуємо глобальну змінну
        document.querySelectorAll('[data-uk], [data-en]').forEach(el => {
            const text = lng === 'uk' ? el.getAttribute('data-uk') : el.getAttribute('data-en');
            if (text) {
                if (text.includes('<')) el.innerHTML = text;
                else el.textContent = text;
            }
        });

        // Оновлення placeholder у полях форми
        document.querySelectorAll('[data-uk-placeholder], [data-en-placeholder]').forEach(el => {
            const ph = lng === 'uk' ? el.getAttribute('data-uk-placeholder') : el.getAttribute('data-en-placeholder');
            if (ph) el.setAttribute('placeholder', ph);
        });

        document.documentElement.lang = lng;
        langBtn.textContent = lng === 'uk' ? 'EN' : 'UA';
        localStorage.setItem('lang', lng);
        
        // Перерендер карточек портфолио под язык
        if (portfolioGrid) {
            const currentCount = isExpanded ? portfolioData.length : itemsPerPage;
            portfolioGrid.innerHTML = '';
            for (let i = 0; i < currentCount; i++) {
                portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i, true));
            }
        }
        updateBtnText();
    };

    const updateBtnText = () => {
        if (!loadMoreBtn) return;
        loadMoreBtn.innerText = isExpanded 
            ? (lang === 'uk' ? loadMoreBtn.getAttribute('data-uk-less') : loadMoreBtn.getAttribute('data-en-less')) 
            : (lang === 'uk' ? loadMoreBtn.getAttribute('data-uk') : loadMoreBtn.getAttribute('data-en'));
    };

    langBtn.addEventListener('click', () => {
        lang = (lang === 'uk') ? 'en' : 'uk';
        updateLanguage(lang);
    });

    // =====================================================
    // ГЕНЕРАЦИЯ КАРТОЧЕК ПОРТФОЛИО
    // =====================================================
    const buildCard = (item, index, delayIndex, animate) => {
        const title = lang === 'uk' ? item.titleUk : item.titleEn;
        const desc = lang === 'uk' ? item.descUk : item.descEn;
        const btnText = lang === 'uk' ? 'Детальніше' : 'Details';
        const animStyle = animate ? `style="animation-delay: ${delayIndex * 0.1}s;"` : '';
        const animClass = animate ? 'portfolio-item' : '';

        return `<div class="col ${animClass}" ${animStyle}>
            <div class="card h-100 portfolio-card bg-transparent d-flex flex-column border-0" onclick="openProjectModal(${index})" onkeydown="if(event.key==='Enter'||event.key===' ')openProjectModal(${index})" tabindex="0" role="button" aria-label="${title}">
                <img src="${item.img}" class="portfolio-img" alt="${title}">
                <div class="card-body px-0 pt-3 d-flex flex-column">
                    <h5 class="fw-bold">${title}</h5>
                    <p class="text-secondary small mb-4">${desc}</p>
                    <button class="btn btn-dark btn-sm text-white mt-auto align-self-start px-4">${btnText}</button>
                </div>
            </div>
        </div>`;
    };


    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            if (!isExpanded) {
                isExpanded = true;
                for (let i = itemsPerPage; i < portfolioData.length; i++) {
                    portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i - itemsPerPage, true));
                }
            } else {
                isExpanded = false;
                portfolioGrid.innerHTML = '';
                for (let i = 0; i < itemsPerPage; i++) {
                    portfolioGrid.insertAdjacentHTML('beforeend', buildCard(portfolioData[i], i, i, false));
                }
                document.getElementById('portfolio').scrollIntoView({ behavior: 'smooth' });
            }
            updateBtnText();
        });
    }

    // =====================================================
    // МОДАЛКА ПРОЕКТОВ (НАВИГАЦИЯ)
    // =====================================================
    window._currentProjectIndex = 0;
    window.openProjectModal = function(dataIndex) {
        const data = window._portfolioData;
        if (!data || !data[dataIndex]) return;
        window._currentProjectIndex = dataIndex;
        const item = data[dataIndex];
        
        document.getElementById('pmImg').src = item.img;
        document.getElementById('pmImg').alt = lang === 'uk' ? item.titleUk : item.titleEn;
        document.getElementById('pmTitle').textContent = lang === 'uk' ? item.titleUk : item.titleEn;
        document.getElementById('pmDesc').textContent = lang === 'uk' ? item.descUk : item.descEn;
        document.getElementById('pmLink').href = item.link;
        document.getElementById('pmLink').textContent = lang === 'uk' ? 'Переглянути сайт' : 'View Site';
        
        const tagsEl = document.getElementById('pmTags');
        tagsEl.innerHTML = (item.tags || []).map(t => `<span class="project-tag">${t}</span>`).join('');
        
        document.getElementById('pmPrev').classList.toggle('nav-hidden', dataIndex === 0);
        document.getElementById('pmNext').classList.toggle('nav-hidden', dataIndex === data.length - 1);
        
        bootstrap.Modal.getOrCreateInstance(document.getElementById('projectModal')).show();
    };

    window.navigateProject = function(direction) {
        const data = window._portfolioData;
        const newIndex = window._currentProjectIndex + direction;
        if (newIndex >= 0 && newIndex < data.length) {
            window.openProjectModal(newIndex);
        }
    };

    // =====================================================
    // АНИМАЦИЯ ФОНОВЫХ ЛИНИЙ НА ХЕРО
    // =====================================================
    const canvas = document.getElementById('linesCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let w, h, lines = [];

        const initCanvas = () => {
            w = canvas.width = canvas.offsetWidth;
            h = canvas.height = canvas.offsetHeight;
            lines = Array.from({length: 6}, () => ({
                y: Math.random() * h,
                speed: 0.0015 + Math.random() * 0.002,
                offset: Math.random() * Math.PI * 2,
                amp: 30 + Math.random() * 40
            }));
        };

        initCanvas();
        window.addEventListener('resize', initCanvas);

        const animateCanvas = () => {
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.lineWidth = 1;
            
            lines.forEach(line => {
                line.offset += line.speed;
                ctx.beginPath();
                for (let x = 0; x < w; x++) {
                    const y = line.y + Math.sin(x * 0.004 + line.offset) * line.amp;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });
            requestAnimationFrame(animateCanvas);
        };
        animateCanvas();
    }

    // =====================================================
    // ЖИВАЯ 3D ВИЗИТКА
    // =====================================================
    const card = document.getElementById('businessCard');
    if (card) {
        card.addEventListener('mousemove', (e) => {
            card.classList.add('is-tilting');
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / (rect.width / 2);
            const dy = (e.clientY - cy) / (rect.height / 2);
            
            const tiltX = -dy * 14;
            const tiltY = dx * 14;
            
            card.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(20px)`;
            card.style.boxShadow = `${-dx * 15}px ${-dy * 15}px 30px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.15)`;
        });

        card.addEventListener('mouseleave', () => {
            card.classList.remove('is-tilting');
            card.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0)';
            card.style.boxShadow = '';
        });
    }

    // =====================================================
    // SCROLL REVEAL (ПОЯВЛЕНИЕ СЕКЦИЙ)
    // =====================================================
    const reveals = document.querySelectorAll('.reveal');
    const checkReveal = () => {
        reveals.forEach(r => {
            const top = r.getBoundingClientRect().top;
            if (top < window.innerHeight * 0.85) r.classList.add('visible');
        });
    };
    window.addEventListener('scroll', checkReveal);
    checkReveal();

    // =====================================================
    // ПОДСВЕТКА АКТИВНОГО ПУНКТА МЕНЮ ПРИ СКРОЛЛЕ
    // =====================================================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');

    window.addEventListener('scroll', () => {
        let currentId = "";
        sections.forEach(sec => {
            const top = sec.offsetTop - 120;
            if (window.scrollY >= top) currentId = sec.getAttribute('id');
        });

        navLinks.forEach(link => {
            link.classList.remove('active-section');
            if (link.getAttribute('href') === `#${currentId}`) {
                link.classList.add('active-section');
            }
        });
    });

    // =====================================================
    // MOBILE DRAWER УПРАВЛЕНИЕ
    // =====================================================
    const navbarNav = document.getElementById('navbarNav');
    const navOverlay = document.getElementById('navOverlay');

    if (navbarNav && navOverlay) {
        navbarNav.addEventListener('show.bs.collapse', () => {
            navOverlay.style.display = 'block';
            setTimeout(() => navOverlay.classList.add('show'), 10);
            document.body.style.overflow = 'hidden';
        });

        navbarNav.addEventListener('hide.bs.collapse', () => {
            navOverlay.classList.remove('show');
            setTimeout(() => navOverlay.style.display = 'none', 350);
            document.body.style.overflow = '';
        });

        navOverlay.addEventListener('click', () => {
            bootstrap.Collapse.getInstance(navbarNav)?.hide();
        });

        document.querySelectorAll('#navbarNav .nav-link').forEach(link => {
            link.addEventListener('click', () => {
                bootstrap.Collapse.getInstance(navbarNav)?.hide();
            });
        });
    }

    // =====================================================
    // ЛОГИКА ФОРМЫ СВЯЗИ И ВАЛИДАЦИИ
    // =====================================================
    const mCheck = document.getElementById('messengerCheck');
    const mBlock = document.getElementById('messengerBlock');
    const mInput = document.getElementById('messengerNick');

    const updateNickBlock = () => {
        const nickBlock = document.getElementById('telegramNickBlock');
        if (!nickBlock) return;
        nickBlock.style.display = messengerType === 'Telegram' ? 'block' : 'none';
        if (messengerType !== 'Telegram' && mInput) mInput.value = '';
    };

    if (mCheck) {
        mCheck.addEventListener('change', () => {
            if (mCheck.checked) {
                mBlock.style.display = 'block';
                updateNickBlock();
            } else {
                mBlock.style.display = 'none';
                if (mInput) mInput.value = '';
            }
        });
    }

    let messengerType = "Telegram";
    document.querySelectorAll('.msg-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.msg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            messengerType = this.getAttribute('data-type');
            updateNickBlock();
        });
    });

    const msgInput = document.getElementById('userMessage');
    const charCounter = document.getElementById('charCounter');
    const MAX_CHARS = 500;

    if (msgInput && charCounter) {
        msgInput.addEventListener('input', () => {
            const len = msgInput.value.length;
            charCounter.textContent = `${len} / ${MAX_CHARS}`;
            charCounter.className = 'char-counter';
            if (len >= MAX_CHARS) charCounter.classList.add('limit');
            else if (len >= MAX_CHARS * 0.8) charCounter.classList.add('warn');
        });
    }

    // Инициализация intl-tel-input
    const phoneInput = document.getElementById('userPhone');
    let iti;
    if (phoneInput) {
        iti = window.intlTelInput(phoneInput, {
            initialCountry: "ua",
            preferredCountries: [],
            separateDialCode: false,
            autoPlaceholder: "off",
            utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js"
        });
        phoneInput.value = "+" + iti.getSelectedCountryData().dialCode + " ";

        const positionCountryList = () => {
            const list = document.querySelector('.iti__country-list');
            if (!list) return;
            const inputRect = phoneInput.getBoundingClientRect();
            const modalContent = document.querySelector('#contactModal .modal-content');
            const modalRect = modalContent ? modalContent.getBoundingClientRect() : { top: 0, left: 0 };
            const viewportH = window.innerHeight;
            const spaceBelow = viewportH - inputRect.bottom;
            const spaceAbove = inputRect.top;
            const listH = Math.min(220, Math.max(spaceBelow, spaceAbove) - 12);

            list.style.position = 'fixed';
            list.style.width = `${inputRect.width}px`;
            list.style.left = `${inputRect.left}px`;
            list.style.maxHeight = `${listH}px`;

            if (spaceBelow >= 150 || spaceBelow >= spaceAbove) {
                list.style.top = `${inputRect.bottom + 2}px`;
                list.style.bottom = 'auto';
            } else {
                list.style.bottom = `${viewportH - inputRect.top + 2}px`;
                list.style.top = 'auto';
            }
        };

        phoneInput.addEventListener('open:countrydropdown', () => {
            setTimeout(positionCountryList, 10);
        });
        window.addEventListener('resize', () => {
            if (document.querySelector('.iti__country-list')) positionCountryList();
        });
        document.getElementById('contactModal')?.addEventListener('scroll', () => {
            if (document.querySelector('.iti__country-list')) positionCountryList();
        });
        document.querySelector('#contactModal .modal-content')?.addEventListener('scroll', () => {
            if (document.querySelector('.iti__country-list')) positionCountryList();
        });

        // Форматирование номера телефона в реальном времени
        phoneInput.addEventListener('input', (e) => {
            const dialCode = iti.getSelectedCountryData().dialCode;
            let val = phoneInput.value.replace(/\D/g, '');
            if (!val.startsWith(dialCode) && val.length > 0) {
                val = dialCode + val;
            }
            const digits = val;
            const maxLen = 12;
            if (digits.length > maxLen) val = digits.slice(0, maxLen);
            
            if (val.startsWith(dialCode)) {
                let nationalPart = val.slice(dialCode.length);
                let formatted = "";
                if (nationalPart.length > 0) {
                    if (nationalPart.length <= 2) formatted = nationalPart;
                    else if (nationalPart.length <= 5) formatted = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5);
                    else if (nationalPart.length <= 7) formatted = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5) + " " + nationalPart.slice(5, 7);
                    else formatted = nationalPart.slice(0, 2) + " " + nationalPart.slice(2, 5) + " " + nationalPart.slice(5, 7) + " " + nationalPart.slice(7);
                }
                phoneInput.value = "+" + dialCode + " " + formatted;
            } else {
                phoneInput.value = "+" + digits;
            }
        });
    }

    // Очистка формы при закрытии модалки
    document.getElementById('contactModal')?.addEventListener('hidden.bs.modal', () => {
        document.getElementById('contactForm').reset();
        if (mBlock) mBlock.style.display = 'none';
        document.getElementById('validationBanner').style.display = 'none';
        if (charCounter) {
            charCounter.textContent = '0 / 500';
            charCounter.className = 'char-counter';
        }
        if (phoneInput && iti) {
            phoneInput.value = "+" + iti.getSelectedCountryData().dialCode + " ";
        }
    });

    // Навигация по полям стрелками
    const formFields = ['userName', 'userPhone', 'userMessage', 'messengerNick'];
    document.getElementById('contactModal')?.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        const idx = formFields.indexOf(active.id);

        if (e.key === 'Enter' && active.tagName !== 'BUTTON') {
            e.preventDefault();
            document.getElementById('submitForm').click();
        }

        if (e.key === 'ArrowDown' && idx !== -1) {
            e.preventDefault();
            for (let i = idx + 1; i < formFields.length; i++) {
                const next = document.getElementById(formFields[i]);
                if (next && next.offsetParent !== null) { next.focus(); break; }
            }
        }

        if (e.key === 'ArrowUp' && idx !== -1) {
            e.preventDefault();
            for (let i = idx - 1; i >= 0; i--) {
                const prev = document.getElementById(formFields[i]);
                if (prev && prev.offsetParent !== null) { prev.focus(); break; }
            }
        }
    });

    const showToast = (msg, type = 'success') => {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `toast-item ${type}`;
        
        let icon = 'bi-check-circle';
        if (type === 'error') icon = 'bi-x-circle';
        else if (type === 'limit') icon = 'bi-clock';

        el.innerHTML = `<i class="bi ${icon}"></i> <span>${msg}</span>`;
        container.appendChild(el);
        
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => el.remove(), 300);
        }, 4000);
    };

    const showBanner = (msg) => {
        const banner = document.getElementById('validationBanner');
        if (banner) {
            banner.textContent = msg;
            banner.style.display = 'block';
            document.getElementById('contactModal').scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Отправка формы AJAX
    document.getElementById('contactForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        document.getElementById('validationBanner').style.display = 'none';

        const name = document.getElementById('userName').value.trim();
        const message = document.getElementById('userMessage').value.trim();
        const isMessenger = mCheck ? mCheck.checked : false;
        const messengerNick = mInput ? mInput.value.trim() : "";
        const honeypot = document.getElementById('username_hp').value;
        const submitBtn = document.getElementById('submitForm');

        if (honeypot) {
            console.warn("Spambot detected.");
            return;
        }

        // Дозволені символи: літери (латиниця, кирилиця, розширена латиниця),
        // апостроф (прямий і типографський), тире, пробіл
        const nameAllowed = /^[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u2019''\-\s]+$/;
        const nameHasLetter = /[a-zA-Z\u00C0-\u024F\u0400-\u04FF]/;

        if (!name || name.length < 2) {
            showBanner(lang === 'uk' ? "Будь ласка, вкажіть ваше ім'я." : "Please enter your name.");
            document.getElementById('userName').focus();
            return;
        }
        if (!nameAllowed.test(name) || !nameHasLetter.test(name)) {
            showBanner(lang === 'uk' ? "Ім'я може містити лише літери, апостроф та тире." : "Name may only contain letters, apostrophe and hyphen.");
            document.getElementById('userName').focus();
            return;
        }

        const rawPhone = phoneInput.value;
        const totalDigits = rawPhone.replace(/\D/g, '');
        if (totalDigits.length < 7) {
            showBanner(lang === 'uk' ? "Будь ласка, введіть коректний номер телефону." : "Please enter your phone number.");
            document.getElementById('userPhone').focus();
            return;
        }

        if (iti && !iti.isValidNumber()) {
            showBanner(lang === 'uk' ? "Введіть коректний номер телефону." : "Please enter a valid phone number.");
            return;
        }

        // messengerNick is optional — only Telegram may have it

        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = lang === 'uk' ? "Відправляється..." : "Sending...";
        submitBtn.disabled = true;

        const data = {
            name,
            phone: "+" + totalDigits,
            message,
            messenger: isMessenger ? messengerType : (lang === 'uk' ? 'Пошта/Дзвінок' : 'Email/Call'),
            nick: isMessenger ? messengerNick : '-',
            honeypot: honeypot
        };

        try {
            const response = await fetch('/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                // Спочатку закриваємо модалку, тост показуємо ПІСЛЯ її закриття —
                // інакше Bootstrap backdrop перекриває тост під час анімації.
                const modalEl = document.getElementById('contactModal');
                const modalInstance = bootstrap.Modal.getInstance(modalEl);

                const successMsg = lang === 'uk'
                    ? "Заявку відправлено! Зв'яжуся з вами найближчим часом."
                    : "Request sent! I'll get back to you shortly.";

                // setTimeout is more reliable than hidden.bs.modal:
                // avoids conflict between contactForm.reset() and iti state during 300ms animation
                modalInstance.hide();
                setTimeout(() => showToast(successMsg, 'success'), 400);
            } else {
                const modalEl2 = document.getElementById('contactModal');
                const modalInstance2 = bootstrap.Modal.getInstance(modalEl2);
                if (response.status === 429) {
                    showToast(lang === 'uk' ? "Занадто багато запитів. Спробуйте через 10 хвилин." : "Too many requests. Try again in 10 minutes.", 'limit');
                } else {
                    // Закриваємо модалку, потім показуємо помилку тостом — так вона бачна, не ховається всередині модалки
                    if (modalInstance2) modalInstance2.hide();
                    const errMsg = result.saved
                        ? (lang === 'uk'
                            ? "Заявку збережено, але email-сповіщення не надішлалось. Зв'яжусь з вами вручну."
                            : "Request saved, but email notification failed. I'll contact you directly.")
                        : (result.error || (lang === 'uk' ? "Помилка сервера. Спробуйте пізніше." : "Server error. Please try again later."));
                    setTimeout(() => showToast(errMsg, 'error'), 400);
                }
            }
        } catch (err) {
            // Сервер недоступний — дані НЕ збережені
            showToast(lang === 'uk' ? "Сервер недоступний. Заявку не надіслано." : "Server unavailable. Request was not sent.", 'error');
                } finally {
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    // Установка стартового языка интерфейса
    updateLanguage(lang);

    // =====================================================
    // КЛІК НА EMAIL — копіювати в буфер
    // =====================================================
    const cardEmail = document.getElementById('cardEmail');
    if (cardEmail) {
        cardEmail.addEventListener('click', () => {
            navigator.clipboard.writeText('kvashayumi@gmail.com').then(() => {
                showToast(lang === 'uk' ? 'Email скопійовано' : 'Email copied', 'success');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = 'kvashayumi@gmail.com';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast(lang === 'uk' ? 'Email скопійовано' : 'Email copied', 'success');
            });
        });
    }

    // =====================================================
    // FIX: Bootstrap modal не зсуває сторінку
    // =====================================================
    document.querySelectorAll('.modal').forEach(m => {
        m.addEventListener('show.bs.modal', () => {
            setTimeout(() => { document.body.style.paddingRight = '0px'; }, 0);
        });
        m.addEventListener('hidden.bs.modal', () => {
            document.body.style.paddingRight = '';
        });
    });


    // =====================================================
    // АНІМАЦІЯ TIMELINE — по черзі при скролі, одноразова
    // =====================================================
    document.querySelectorAll('.timeline-item').forEach((item) => {
        new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                item.classList.add('animated');
                obs.disconnect();
            }
        }, { threshold: 0.45 }).observe(item);
    });

    // =====================================================
    // VERTICAL ACCORDION — CLICK TOGGLE
    // =====================================================
    const accItems = document.querySelectorAll('.v-acc-item');

    accItems.forEach(item => {
        const head  = item.querySelector('.v-acc-head');
        const body  = item.querySelector('.v-acc-body');
        const inner = item.querySelector('.v-acc-body-inner');

        head.addEventListener('click', () => {
            const isOpen = item.classList.contains('is-open');

            // Close all
            accItems.forEach(i => {
                i.classList.remove('is-open');
                i.querySelector('.v-acc-body').style.maxHeight = '0';
            });

            // Open clicked one if it was closed
            if (!isOpen) {
                item.classList.add('is-open');
                item.classList.add('was-viewed');
                body.style.maxHeight = inner.scrollHeight + 'px';
            }
        });
    });

});
    