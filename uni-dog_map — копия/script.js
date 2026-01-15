let map, markers = [], currentUser = null, firebaseLoaded = false, mapLoaded = false, isMobile = false, mapActive = false;

document.addEventListener('DOMContentLoaded', function() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    isInIframe = window.parent !== window;

    console.log('Страница загружена:', { isMobile, isInIframe, userAgent: navigator.userAgent });

    // Для iframe в мобильных браузерах может потребоваться дополнительная задержка
    if (isInIframe && isMobile) {
        console.log('Мобильный iframe - ждем полной загрузки...');
        window.addEventListener('load', function() {
            // Небольшая задержка для мобильных устройств
            setTimeout(initializeApp, 1000);
        });
    } else {
        // Для всех остальных случаев запускаем сразу
        initializeApp();
    }
});

async function initializeApp() {
    try {
        console.log('Начало инициализации приложения...', { isMobile, isInIframe: window.parent !== window });
        showNotification('Загружаем приложение... 🐾', 'info');

        // Для iframe используем последовательную загрузку с увеличенными таймаутами
        const isInIframe = window.parent !== window;
        console.log('Загрузка Firebase...');

        await loadFirebase();
        console.log('Firebase загружен, загрузка Yandex Maps...');

        await loadYandexMaps();
        console.log('Yandex Maps загружены, инициализация аутентификации...');

        await initializeAuth();
        console.log('Аутентификация пройдена, инициализация карты...');

        initializeMap();
        console.log('Карта инициализирована, загрузка маркеров...');

        await loadMarkers();
        console.log('Маркеры загружены, настройка обработчиков...');

        setupEventListeners();

        console.log('Приложение успешно инициализировано');
        showNotification('Приложение готово! 🎉', 'success');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        console.error('Детали ошибки:', {
            message: error.message,
            stack: error.stack,
            isMobile,
            isInIframe: window.parent !== window,
            firebaseLoaded,
            mapLoaded
        });

        showNotification('Ошибка загрузки. Работаем в автономном режиме', 'error');
        showOfflineMode();
    }
}

async function loadFirebase() {
    if (window.firebaseLoaded) {
        console.log('Firebase уже загружен');
        return;
    }

    try {
        const isInIframe = window.parent !== window;
        // Увеличиваем таймауты для мобильных устройств и iframe
        const timeoutMs = isInIframe && isMobile ? 25000 : (isInIframe ? 20000 : (isMobile ? 15000 : 15000));

        console.log(`Загрузка Firebase... (таймаут: ${timeoutMs}мс, iframe: ${isInIframe}, mobile: ${isMobile})`);

        const timeout = setTimeout(() => {
            console.error('Firebase timeout - превышено время ожидания');
            throw new Error('Firebase timeout');
        }, timeoutMs);

        // На мобильных устройствах проверяем дополнительный флаг
        if (isMobile && window.firebaseMobileFailed) {
            throw new Error('Firebase не загружен на мобильном устройстве');
        }

        // Ждем загрузки Firebase SDK (он загружается в HTML)
        let attempts = 0;
        const maxAttempts = isMobile ? 100 : 50; // Больше попыток для мобильных

        while (!window.firebase && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;

            // На мобильных проверяем дополнительный флаг готовности
            if (isMobile && window.firebaseMobileReady) {
                console.log('Firebase готовность подтверждена на мобильном устройстве');
                break;
            }
        }

        if (!window.firebase) {
            throw new Error(`Firebase SDK не найден после ${attempts} попыток`);
        }

        clearTimeout(timeout);
        firebaseLoaded = true;
        console.log('Firebase успешно загружен');
    } catch (error) {
        console.error('Firebase error:', error);
        firebaseLoaded = false;
        throw error;
    }
}

async function loadYandexMaps() {
    return new Promise((resolve, reject) => {
        // Проверяем, загружены ли уже карты
        if (typeof ymaps !== 'undefined') {
            mapLoaded = true;
            console.log('Yandex Maps уже загружены');
            resolve();
            return;
        }

        // Для iframe и мобильных увеличиваем таймаут
        const isInIframe = window.parent !== window;
        const timeoutMs = isInIframe && isMobile ? 35000 : (isInIframe ? 30000 : (isMobile ? 25000 : 20000));

        console.log(`Загрузка Yandex Maps... (таймаут: ${timeoutMs}мс, iframe: ${isInIframe}, mobile: ${isMobile})`);

        const timeout = setTimeout(() => {
            console.error('Yandex Maps timeout - превышено время ожидания');
            reject(new Error('Yandex Maps timeout'));
        }, timeoutMs);

        window.ymapsReady = function() {
            clearTimeout(timeout);
            mapLoaded = true;
            console.log('Yandex Maps успешно загружены');
            resolve();
        };

        // Если скрипт уже существует, не создаем новый
        if (!document.querySelector('script[src*="api-maps.yandex.ru"]')) {
            console.log('Создание скрипта Yandex Maps...');
            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?apikey=4f49b7f4-1b34-435b-af60-a83875905033&lang=ru_RU&onload=ymapsReady';
            script.async = true;
            script.onerror = function() {
                clearTimeout(timeout);
                console.error('Ошибка загрузки скрипта Yandex Maps');
                reject(new Error('Yandex Maps load error'));
            };
            document.head.appendChild(script);
        } else {
            console.log('Скрипт Yandex Maps уже существует, ждем загрузки...');
        }
    });
}

async function initializeAuth() {
    if (!firebaseLoaded) {
        showNotification('Firebase недоступен. Автономный режим', 'error');
        return;
    }

    try {
        // Увеличиваем таймаут для iframe
        const isInIframe = window.parent !== window;
        const authTimeout = isInIframe ? 10000 : 5000;

        const authPromise = window.firebaseFunctions.signInAnonymously(window.firebaseAuth);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth timeout')), authTimeout)
        );

        await Promise.race([authPromise, timeoutPromise]);

        window.firebaseFunctions.onAuthStateChanged(window.firebaseAuth, (user) => {
            currentUser = user;
            updateAuthStatus(user);
            if (user) {
                console.log('Пользователь авторизован:', user.uid);
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        showNotification('Ошибка авторизации', 'error');
    }
}

function updateAuthStatus(user) {
    const authStatus = document.getElementById('auth-status');
    if (user) {
        authStatus.textContent = '🐕 Подключен к стае собачек';
        authStatus.style.color = '#27ae60';
    } else if (firebaseLoaded) {
        authStatus.textContent = '🐾 Подключаемся к стае...';
        authStatus.style.color = '#e74c3c';
    } else {
        authStatus.textContent = '📱 Автономный режим';
        authStatus.style.color = '#f39c12';
    }
}

function initializeMap() {
    if (!mapLoaded) {
        setTimeout(() => {
            const isInIframe = window.parent !== window;
            const mapElement = document.getElementById('map');
            mapElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f8f4ee;border-radius:16px;"><div style="text-align:center;padding:20px;"><h3>🗺️ Карта недоступна</h3><p>Попробуйте перезагрузить страницу</p><button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;background:#7B4AE2;color:#FFF;border:none;border-radius:8px;cursor:pointer;">Перезагрузить</button></div></div>';
            showNotification('Карта недоступна. Попробуйте позже', 'error');
        }, 3000);
        return;
    }

    try {
        ymaps.ready(function() {
            const isInIframe = window.parent !== window;

            // Создаем карту с дополнительными опциями для iframe
            const mapOptions = {
                center: [55.7558, 37.6173],
                zoom: 10,
                controls: isInIframe ? ['zoomControl', 'typeSelector'] : ['zoomControl', 'searchControl', 'typeSelector', 'fullscreenControl'],
                suppressMapOpenBlock: isInIframe // Отключаем блок "Открыть в Яндекс.Картах" в iframe
            };

            map = new ymaps.Map('map', mapOptions);

            // Настраиваем карту для iframe
            if (isInIframe) {
                map.behaviors.disable(['scrollZoom', 'dblClickZoom', 'multiTouch', 'rightMouseButtonMagnifier']);
            }

            if (isMobile) {
                setupMobileMapInteraction();
            } else {
                map.events.add('click', function(e) {
                    const coords = e.get('coords');
                    showAddMarkerForm(coords);
                });
            }

            console.log('Карта Яндекса инициализирована', isInIframe ? '(iframe режим)' : '');

            // Для iframe пытаемся сообщить родительскому окну о готовности
            if (isInIframe && window.parent) {
                try {
                    // Отправляем сообщение о готовности карты
                    window.parent.postMessage({
                        type: 'map-ready',
                        height: document.body.scrollHeight
                    }, '*');
                } catch (e) {
                    console.log('Не удалось отправить сообщение родителю');
                }
            }
        });
    } catch (error) {
        console.error('Map init error:', error);
        showNotification('Ошибка инициализации карты', 'error');

        // Fallback для iframe
        if (isInIframe) {
            document.getElementById('map').innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:300px;background:#f8f4ee;border-radius:16px;">
                    <div style="text-align:center;padding:20px;">
                        <h3>🗺️ Карта временно недоступна</h3>
                        <p>Попробуйте обновить страницу</p>
                    </div>
                </div>
            `;
        }
    }
}

function setupMobileMapInteraction() {
    const mapElement = document.getElementById('map');
    let tapCount = 0;
    let tapTimer;

    // Для iframe добавляем дополнительные проверки
    const touchHandler = function(e) {
        if (e.touches.length === 1) {
            tapCount++;
            if (tapCount === 1) {
                tapTimer = setTimeout(() => {
                    tapCount = 0;
                }, 300);
            } else if (tapCount === 2) {
                clearTimeout(tapTimer);
                tapCount = 0;
                e.preventDefault();
                e.stopPropagation();
                activateMap();
            }
        }
    };

    mapElement.addEventListener('touchstart', touchHandler, { passive: false });

    // Предотвращаем конфликты с iframe скроллом
    if (isInIframe) {
        mapElement.addEventListener('touchmove', function(e) {
            // Разрешаем скролл только когда карта активна
            if (!mapActive) {
                e.preventDefault();
            }
        }, { passive: false });
    }
}

function activateMap() {
    if (!map || !isMobile) return;

    mapActive = true;
    const mapElement = document.getElementById('map');
    mapElement.classList.add('map-active');

    showNotification('Карта активирована! Теперь нажмите на место для метки 📍', 'success');

    // Убираем существующие обработчики кликов
    map.events.remove('click');

    // Добавляем новый обработчик для установки метки
    map.events.add('click', function(e) {
        const coords = e.get('coords');
        addTemporaryMarker(coords);
        showAddMarkerForm(coords);

        // После установки метки деактивируем карту
        deactivateMap();
    });
}

function deactivateMap() {
    if (!isMobile) return;

    mapActive = false;
    const mapElement = document.getElementById('map');
    mapElement.classList.remove('map-active');

    // Убираем обработчик кликов
    if (map) {
        map.events.remove('click');
    }
}

function addTemporaryMarker(coords) {
    if (!map || !isMobile) return;

    const markerElement = document.createElement('div');
    markerElement.className = 'temp-marker';
    markerElement.style.left = '50%';
    markerElement.style.top = '50%';

    document.getElementById('map').appendChild(markerElement);
    showNotification('Метка установлена! Заполните форму ниже 📝', 'success');

    setTimeout(() => {
        if (markerElement.parentNode) {
            markerElement.parentNode.removeChild(markerElement);
        }
    }, 3000);
}

function showOfflineMode() {
    // Очищаем предыдущие уведомления
    const existingOffline = document.querySelector('.offline-mode');
    if (existingOffline) {
        existingOffline.remove();
    }

    const offlineDiv = document.createElement('div');
    offlineDiv.className = 'offline-mode';
    offlineDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#FFF;padding:24px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;z-index:1000;max-width:90vw;';
    offlineDiv.innerHTML = `
        <h3 style="color:#7B4AE2;margin-bottom:16px;">🐾 Автономный режим</h3>
        <p style="margin-bottom:16px;">Некоторые функции недоступны из-за проблем с подключением.</p>
        <div style="background:#f8f4ee;padding:12px;border-radius:8px;margin-bottom:16px;font-size:12px;text-align:left;">
            <strong>Статус подключения:</strong><br>
            • Firebase: ${firebaseLoaded ? '✅ Загружен' : '❌ Не загружен'}<br>
            • Яндекс Карты: ${mapLoaded ? '✅ Загружены' : '❌ Не загружены'}<br>
            • Мобильное устройство: ${isMobile ? '📱 Да' : '💻 Нет'}<br>
            • В iframe: ${window.parent !== window ? '🖼️ Да' : '🌐 Нет'}<br>
            • Интернет: ${navigator.onLine ? '📶 Есть' : '📵 Нет'}<br>
            <br>
            <strong>Возможные причины:</strong><br>
            • Медленное интернет-соединение на мобильном устройстве<br>
            • Блокировка загрузки скриптов в iframe<br>
            • Проблемы с сетью оператора<br>
            • Временные сбои сервисов
        </div>
        <p style="margin-bottom:16px;font-weight:500;">Попробуйте:</p>
        <ul style="text-align:left;margin-bottom:20px;">
            <li>🔄 Перезагрузить страницу</li>
            <li>📶 Проверить подключение к интернету</li>
            <li>🚫 Отключить VPN если используется</li>
            <li>📱 Попробовать другую сеть (Wi-Fi/мобильный интернет)</li>
            <li>⏱️ Подождать несколько секунд и обновить</li>
        </ul>
        <button onclick="location.reload()" style="background:#7B4AE2;color:#FFF;border:none;padding:12px 24px;border-radius:24px;margin-right:10px;cursor:pointer;font-weight:500;">Перезагрузить</button>
        <button onclick="this.parentElement.remove(); retryConnection()" style="background:#ffc107;color:#000;border:none;padding:12px 24px;border-radius:24px;margin-right:10px;cursor:pointer;font-weight:500;">Повторить попытку</button>
        <button onclick="this.parentElement.remove(); tryOfflineMode()" style="background:#28a745;color:#FFF;border:none;padding:12px 24px;border-radius:24px;margin-right:10px;cursor:pointer;font-weight:500;">Продолжить без интернета</button>
        <button onclick="this.parentElement.remove()" style="background:#6c757d;color:#FFF;border:none;padding:12px 24px;border-radius:24px;cursor:pointer;font-weight:500;">Закрыть</button>
    `;
    document.body.appendChild(offlineDiv);
}

// Функция для работы в полностью автономном режиме
function tryOfflineMode() {
    console.log('Переход в автономный режим...');

    // Создаем заглушку для карты
    const mapElement = document.getElementById('map');
    if (mapElement) {
        mapElement.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f8f4ee;border-radius:16px;flex-direction:column;">
                <div style="text-align:center;padding:20px;">
                    <h3 style="color:#7B4AE2;margin-bottom:16px;">🗺️ Карта недоступна</h3>
                    <p style="margin-bottom:16px;">Работаем в автономном режиме</p>
                    <div style="background:#FFF;padding:16px;border-radius:8px;border:1px solid #ddd;">
                        <p style="margin:0;font-size:14px;color:#666;">
                            📍 Ваши сохраненные метки будут доступны при восстановлении соединения
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    // Показываем форму, но делаем неактивной
    const form = document.getElementById('add-marker-form');
    if (form) {
        const inputs = form.querySelectorAll('input, textarea, button');
        inputs.forEach(input => {
            input.disabled = true;
            input.style.opacity = '0.6';
        });

        // Добавляем сообщение
        const message = document.createElement('div');
        message.style.cssText = 'background:#fff3cd;color:#856404;padding:12px;border-radius:8px;margin-top:16px;font-size:14px;border:1px solid #ffeaa7;';
        message.innerHTML = '⚠️ Форма недоступна в автономном режиме. Подключитесь к интернету для добавления меток.';
        form.appendChild(message);
    }

    showNotification('Работаем в автономном режиме', 'info');
}

function showAddMarkerForm(coords) {
    const form = document.getElementById('add-marker-form');
    const titleInput = document.getElementById('marker-title');
    const commentInput = document.getElementById('marker-comment');

    titleInput.value = '';
    commentInput.value = '';
    form.dataset.coords = JSON.stringify(coords);

    if (isMobile) {
        // На мобильных устройствах форма уже над картой, просто фокусируемся на поле
        setTimeout(() => {
            titleInput.focus();
            // Прокручиваем к форме, если нужно
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 500);
    } else {
        titleInput.focus();
    }
}

function setupEventListeners() {
    const form = document.getElementById('add-marker-form');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!firebaseLoaded) {
            showNotification('Firebase недоступен. Работа в автономном режиме', 'error');
            return;
        }

        if (!currentUser) {
            showNotification('Необходимо подключиться к сети собачек', 'error');
            return;
        }

        const title = document.getElementById('marker-title').value.trim();
        const comment = document.getElementById('marker-comment').value.trim();
        const coords = JSON.parse(form.dataset.coords);

        if (!title) {
            showNotification('Пожалуйста, введите ваше имя!', 'error');
            return;
        }

        try {
            await addMarker(coords, title, comment);
            showNotification('Ваш след успешно оставлен! Добро пожаловать в семью UNIDOG! 🐾', 'success');

            form.reset();
            delete form.dataset.coords;

            // Деактивируем карту после успешного добавления метки
            deactivateMap();

        } catch (error) {
            console.error('Ошибка добавления метки:', error);
            showNotification('Упс! Не удалось оставить след. Проверьте подключение 🐶', 'error');
        }
    });
}

async function addMarker(coords, title, comment) {
    if (!firebaseLoaded) throw new Error('Firebase not loaded');

    const markerData = {
        title: title,
        comment: comment || '',
        latitude: coords[0],
        longitude: coords[1],
        userId: currentUser.uid,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const docRef = await window.firebaseFunctions.addDoc(window.firebaseFunctions.collection(window.firebaseDb, 'markers'), markerData);
    createMapMarker({ ...markerData, id: docRef.id }, true);
    markers.push({ ...markerData, id: docRef.id });
}

function createMapMarker(markerData, isNew = false) {
    if (!mapLoaded || !map) return;

    try {
        const placemark = new ymaps.Placemark([markerData.latitude, markerData.longitude], {
            balloonContentHeader: markerData.title,
            balloonContentBody: markerData.comment || 'Без комментария',
            balloonContentFooter: `Создано: ${new Date(markerData.createdAt.seconds * 1000).toLocaleString('ru-RU')}`
        }, {
            preset: 'islands#dotIcon',
            iconColor: isNew ? '#27ae60' : '#3498db'
        });

        map.geoObjects.add(placemark);
        placemark.markerData = markerData;
    } catch (error) {
        console.error('Error creating map marker:', error);
    }
}

async function loadMarkers() {
    if (!firebaseLoaded) {
        console.log('Firebase недоступен, пропускаем загрузку маркеров');
        updateMarkersList();
        return;
    }

    try {
        const querySnapshot = await window.firebaseFunctions.getDocs(window.firebaseFunctions.collection(window.firebaseDb, 'markers'));
        markers = [];
        querySnapshot.forEach((doc) => {
            const markerData = { id: doc.id, ...doc.data() };
            markers.push(markerData);
            createMapMarker(markerData);
        });
        updateMarkersList();
        console.log(`Загружено ${markers.length} меток`);
    } catch (error) {
        console.error('Ошибка загрузки маркеров:', error);
        updateMarkersList();
    }
}

function updateMarkersList() {
    const container = document.getElementById('markers-list');

    if (!firebaseLoaded) {
        container.innerHTML = '<p>📱 Автономный режим: данные недоступны</p><p>🔄 Перезагрузите страницу для повторной попытки</p>';
        return;
    }

    if (markers.length === 0) {
        container.innerHTML = '<p>Ещё никто не оставил свой след... Будьте первым! 🐕‍🦺</p>';
        return;
    }

    container.innerHTML = markers.sort((a, b) => new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000)).map(marker => `
        <div class="marker-item">
            <div class="marker-title">${escapeHtml(marker.title)}</div>
            <div class="marker-comment">${escapeHtml(marker.comment || 'Без комментария')}</div>
            <div class="marker-coords">Координаты: ${marker.latitude.toFixed(6)}, ${marker.longitude.toFixed(6)}</div>
            <div class="marker-actions">
                <button class="btn btn-secondary" onclick="focusOnMarker('${marker.id}')" ${!mapLoaded ? 'disabled' : ''}>Найти на карте 🗺️</button>
                ${currentUser && currentUser.uid === marker.userId ? `<button class="btn btn-danger" onclick="deleteMarker('${marker.id}')">Удалить след 🗑️</button>` : ''}
            </div>
        </div>
    `).join('');
}

function focusOnMarker(markerId) {
    if (!mapLoaded) {
        showNotification('Карта недоступна', 'error');
        return;
    }

    const marker = markers.find(m => m.id === markerId);
    if (marker && map) {
        map.setCenter([marker.latitude, marker.longitude], 15);
    }
}

async function deleteMarker(markerId) {
    if (!firebaseLoaded) {
        showNotification('Firebase недоступен', 'error');
        return;
    }

    if (!confirm('Вы уверены, что хотите удалить свой след? Это действие нельзя отменить 🐕')) {
        return;
    }

    try {
        const docRef = window.firebaseFunctions.doc(window.firebaseDb, 'markers', markerId);
        await window.firebaseFunctions.deleteDoc(docRef);
        markers = markers.filter(m => m.id !== markerId);
        await reloadMap();
        updateMarkersList();
        showNotification('След удалён. Но вы всегда можете оставить новый! 🐾', 'success');
    } catch (error) {
        console.error('Ошибка удаления метки:', error);
        showNotification('Не удалось удалить след. Проверьте подключение 🐶', 'error');
    }
}

async function reloadMap() {
    if (!mapLoaded) return;
    if (map) {
        map.geoObjects.removeAll();
        markers.forEach(marker => createMapMarker(marker));
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// Функция для повторной попытки подключения
async function retryConnection() {
    console.log('Повторная попытка подключения...');
    showNotification('Повторная попытка подключения...', 'info');

    try {
        // Сбрасываем флаги
        firebaseLoaded = false;
        mapLoaded = false;

        // Пытаемся загрузить заново
        await loadFirebase();
        await loadYandexMaps();

        // Если дошли до сюда, значит загрузка успешна
        console.log('Повторная загрузка успешна!');

        // Повторно инициализируем приложение
        await initializeAuth();
        initializeMap();
        await loadMarkers();
        setupEventListeners();

        showNotification('Подключение восстановлено! 🎉', 'success');

        // Убираем автономный режим
        const offlineElements = document.querySelectorAll('.offline-mode');
        offlineElements.forEach(el => el.remove());

        // Восстанавливаем форму
        const form = document.getElementById('add-marker-form');
        if (form) {
            const inputs = form.querySelectorAll('input, textarea, button');
            inputs.forEach(input => {
                input.disabled = false;
                input.style.opacity = '1';
            });

            // Убираем сообщение об автономном режиме
            const message = form.querySelector('[style*="background:#fff3cd"]');
            if (message) {
                message.remove();
            }
        }

    } catch (error) {
        console.error('Повторная попытка не удалась:', error);
        showNotification('Подключение не удалось. Попробуйте позже.', 'error');
        // Показываем автономный режим снова
        setTimeout(() => showOfflineMode(), 2000);
    }
}

// Экспортируем функции для глобального доступа
window.focusOnMarker = focusOnMarker;
window.deleteMarker = deleteMarker;
window.retryConnection = retryConnection;
