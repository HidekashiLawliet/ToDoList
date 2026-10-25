// * Change page title if focus or not
window.onload = function () {
    var pageTitle = document.title;
    var attentionMessage = 'Come back here and focus ';

    document.addEventListener('visibilitychange', function () {
        document.title = document.hidden ? `${attentionMessage} 😡` : pageTitle;
    });
}
// * -------------------

// * Create a typing effect for the title
const title = document.getElementById("title");
const titleText = "Stay focused and productive!";

function toggleTextVisibility(element, text, duration = 200) {
    let i = 0;
    let timer;

    function typingEffect() {
        if (i !== text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            timer = setTimeout(typingEffect, 150);
        } else {
            timer = setTimeout(reverseTypingEffect, duration);
        }
    }

    function reverseTypingEffect() {
        if (i !== 1) {
            element.innerHTML = text.substring(0, i - 1);
            i--;
            timer = setTimeout(reverseTypingEffect, 150);
        } else {
            timer = setTimeout(typingEffect, duration);
        }
    }
    return {
        start() {
            clearTimeout(timer);
            i = 0;
            // Invisible character, as in index.html, keeps header height
            element.textContent = 'ㅤ';
            typingEffect();
        },
        stop() {
            clearTimeout(timer);
            element.textContent = text;
        },
    };
}
const titleEffect = toggleTextVisibility(title, titleText);

// * Animations: off for reduced motion or data saving; pausable
const bgVideo = document.getElementById('bg_video');
const motionBtn = document.getElementById('motion_btn');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let animationsOn = !reduceMotion.matches && !navigator.connection?.saveData;

function setAnimations(on) {
    animationsOn = on;
    motionBtn.textContent = on ? 'Pause animations' : 'Play animations';
    if (on) {
        titleEffect.start();
        // Video loads only here; the page works if play() fails
        bgVideo.play()?.catch(() => { });
    } else {
        titleEffect.stop();
        bgVideo.pause();
    }
}

motionBtn.addEventListener('click', () => setAnimations(!animationsOn));
reduceMotion.addEventListener('change', () => setAnimations(!reduceMotion.matches));
setAnimations(animationsOn);

// * -----------------


// * Database (MariaDB via server.ts) - start with `npm start`
const API_URL = '/todos';

async function api(path = '', options = {}) {
    const response = await fetch(API_URL + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (response.status === 401) {
        // Session over or server restarted: back to login page
        window.location.href = '/login.html';
        throw new Error('Not logged in');
    }
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
}
// * -----------------

// * Create li element inside the ul
const list = document.getElementById('scroll_list');
const project_counter = document.getElementById('project_counter');

function renderItem(item) {
    const li = document.createElement('li');
    li.className = item.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `checkbox${item.id}`;
    checkbox.name = 'todocheck';
    checkbox.value = 'todo';
    checkbox.checked = item.done;
    checkbox.addEventListener('change', function () {
        api(`/${item.id}`, { method: 'PATCH', body: JSON.stringify({ done: this.checked }) })
            .catch(showError);
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.dataset.content = item.text;
    label.textContent = item.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete task ${item.text}`);
    deleteBtn.textContent = 'X';
    deleteBtn.addEventListener('click', function () {
        deleteItem(li, item.id);
    });

    const subtask = document.createElement('ul');
    subtask.className = 'subtask-list';
    (item.subtasks ?? []).forEach(sub => renderSubtask(subtask, item.id, sub));

    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.className = 'subtask-text';
    subInput.placeholder = 'Add a sub-task';
    subInput.setAttribute('aria-label', `Add a sub-task to ${item.text}`);
    subInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            addSubtask(subtask, item.id, subInput);
        }
    });

    const subAddBtn = document.createElement('button');
    subAddBtn.className = 'subtask-add-btn';
    subAddBtn.setAttribute('aria-label', `Add the sub-task to ${item.text}`);
    subAddBtn.textContent = '+';
    subAddBtn.addEventListener('click', function () {
        addSubtask(subtask, item.id, subInput);
    });

    li.append(checkbox, label, deleteBtn, subtask, subInput, subAddBtn);
    list.appendChild(li);
    ItemCounter();
}

function renderSubtask(subtask, todoId, sub) {
    const li = document.createElement('li');

    // Different prefix: sub-task ids can clash with todo checkboxes
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `subcheck${sub.id}`;
    checkbox.checked = sub.done;
    checkbox.addEventListener('change', function () {
        api(`/${todoId}/subtasks/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ done: this.checked }) })
            .catch(showError);

        // Parent todo is done exactly when all sub-tasks are
        const allDone = Array.from(subtask.querySelectorAll('input[type="checkbox"]'))
            .every(box => box.checked);
        const parentCheckbox = document.getElementById(`checkbox${todoId}`);
        if (parentCheckbox.checked !== allDone) {
            parentCheckbox.checked = allDone;
            api(`/${todoId}`, { method: 'PATCH', body: JSON.stringify({ done: allDone }) })
                .catch(showError);
        }
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.dataset.content = sub.text;
    label.textContent = sub.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'subtask-delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete sub-task ${sub.text}`);
    deleteBtn.textContent = 'X';
    deleteBtn.addEventListener('click', async function () {
        try {
            await api(`/${todoId}/subtasks/${sub.id}`, { method: 'DELETE' });
            li.remove();
        } catch (error) {
            showError(error);
        }
    });


    li.append(checkbox, label, deleteBtn);
    subtask.appendChild(li);
}

async function addSubtask(subtask, todoId, input) {
    const text = input.value.trim();
    input.value = '';
    if (text === '') {
        window.alert('Please enter a sub-task');
        return;
    }
    try {
        const sub = await api(`/${todoId}/subtasks`, { method: 'POST', body: JSON.stringify({ text }) });
        renderSubtask(subtask, todoId, sub);
    } catch (error) {
        showError(error);
    }
}

async function addItemInList() {
    const input = document.getElementById('todo_text');
    const text = input.value.trim();
    input.value = '';
    if (text === '') {
        window.alert('Please enter a task');
        return;
    }
    try {
        const item = await api('', { method: 'POST', body: JSON.stringify({ text, done: false }) });
        renderItem(item);
    } catch (error) {
        showError(error);
    }
}

async function loadItems() {
    try {
        const items = await api();
        items.forEach(renderItem);
    } catch (error) {
        showError(error);
    }
}
loadItems();
// * ------------------

// * Various litle function to make the one above work
async function deleteItem(li, id) {
    try {
        await api(`/${id}`, { method: 'DELETE' });
        li.remove();
        ItemCounter();
    } catch (error) {
        showError(error);
    }
}

function ItemCounter() {
    project_counter.innerHTML = list.children.length;
}

function showError(error) {
    // The page is already leaving for the login page
    if (error.message === 'Not logged in') {
        return;
    }
    console.error(error);
    window.alert('Could not reach the database. Is `npm start` running?');
}

window.addEventListener('keydown', function (event) {
    // Main input only; sub-tasks have their own Enter handler
    if (event.key === 'Enter' && event.target.id === 'todo_text') {
        addItemInList();
    }
});

async function deleteAll() {
    if (!confirm('Are you sure you want to delete all tasks?')) {
        return;
    }
    try {
        const items = await api();
        await Promise.all(items.map(item => api(`/${item.id}`, { method: 'DELETE' })));
        list.replaceChildren();
        ItemCounter();
    } catch (error) {
        showError(error);
    }
}

// * -------------------

// * Pomodoro timer: 30 min focus, 5 min break, repeat
const FOCUS_MINUTES = 30;
const BREAK_MINUTES = 5;

const pomoTime = document.getElementById('pomo_time');
const pomoMode = document.getElementById('pomo_mode');

let isBreak = false;
let secondsLeft = FOCUS_MINUTES * 60;
let endTime = null;
let pomoInterval = null;

function showTime() {
    const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const seconds = String(secondsLeft % 60).padStart(2, '0');
    pomoTime.textContent = `${minutes}:${seconds}`;
}

function tick() {
    // Clock-based, so background tabs keep correct time
    secondsLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    showTime();
    if (secondsLeft === 0) {
        pauseTimer();
        beep();
        isBreak = !isBreak;
        pomoMode.textContent = isBreak ? 'Break time' : 'Focus time';
        secondsLeft = (isBreak ? BREAK_MINUTES : FOCUS_MINUTES) * 60;
        showTime();
    }
}

function startTimer() {
    if (pomoInterval) {
        return;
    }
    if (!isBreak && pomoMode.textContent === 'Pomodoro Timer') {
        pomoMode.textContent = 'Focus time';
    }
    // * Sound needs a click first, so prepare audio now
    audio ??= new AudioContext();
    audio.resume();
    endTime = Date.now() + secondsLeft * 1000;
    pomoInterval = setInterval(tick, 250);
}

function pauseTimer() {
    clearInterval(pomoInterval);
    pomoInterval = null;
}

function resetTimer() {
    pauseTimer();
    isBreak = false;
    pomoMode.textContent = 'Pomodoro Timer';
    secondsLeft = FOCUS_MINUTES * 60;
    showTime();
}

let audio = null;

function beep(count = 3, length = 0.5, gap = 0.5) {
    audio ??= new AudioContext();
    const firstBeep = audio.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
        // Oscillators start once, so each beep needs its own
        const oscillator = audio.createOscillator();
        oscillator.frequency.value = 600;
        oscillator.connect(audio.destination);
        const startAt = firstBeep + i * (length + gap);
        oscillator.start(startAt);
        oscillator.stop(startAt + length);
    }
}

document.getElementById('startBtn').addEventListener('click', startTimer);
document.getElementById('pauseBtn').addEventListener('click', pauseTimer);
document.getElementById('resetBtn').addEventListener('click', resetTimer);

// * -------------------


// * Weather API
var W_city = document.querySelector('.W_city')
var T_city = document.querySelector('.T_city')
var wind = document.querySelector('.wind')
var humidity = document.querySelector('.humidity')
var description = document.querySelector('.description')
var time = document.querySelector('.time')
var refresh = document.querySelector('.refresh')


// * The key lives in .env, so server.ts calls OpenWeather
async function showWeather(city_name) {
    try {
        const response = await fetch('/weather?city=' + encodeURIComponent(city_name));
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        const data = await response.json();
        if (!response.ok) {
            window.alert('Weather error: ' + (data.message ?? data.error));
            return;
        }
        // * OpenWeather gives the wind in m/s with metric units
        const windKmh = Math.round(data.wind.speed * 3.6);

        // * data.timezone is the city's shift from UTC in seconds
        const cityTime = new Date(Date.now() + data.timezone * 1000);
        const updatedAt = new Date((data.dt + data.timezone) * 1000);
        const format = { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' };

        T_city.textContent = data.main.temp + ' °C';
        time.textContent = 'local time: ' + cityTime.toLocaleTimeString([], format)
            + ' (updated ' + updatedAt.toLocaleTimeString([], format) + ')';
        humidity.textContent = data.main.humidity + ' % (humidity)';
        wind.textContent = 'wind speed: ' + windKmh + ' Km/h';
        description.textContent = data.weather[0].description;
    } catch (error) {
        console.error(error);
        window.alert('Could not reach the weather service. Check your API key in the .env');
    }
}

refresh.addEventListener('click', function () {
    var city_name = W_city.value.trim();
    if (city_name === '') {
        window.alert('Please enter a city name');
        return;
    }
    showWeather(city_name);
})
showWeather('tokyo');
// * -------------------