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
const titleText = "ToDo List";

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
    typingEffect();
}
toggleTextVisibility(title, titleText);

// * -----------------


// * Database (MariaDB through server.js) - start it with `npm start`
const API_URL = 'http://localhost:3000/todos';

async function api(path = '', options = {}) {
    const response = await fetch(API_URL + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
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
    deleteBtn.id = 'delete_btn';
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
    subInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            addSubtask(subtask, item.id, subInput);
        }
    });

    const subAddBtn = document.createElement('button');
    subAddBtn.className = 'subtask-add-btn';
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

    // Sub-tasks have their own ids, so use another prefix to not clash with the todo checkboxes
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `subcheck${sub.id}`;
    checkbox.checked = sub.done;
    checkbox.addEventListener('change', function () {
        api(`/${todoId}/subtasks/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ done: this.checked }) })
            .catch(showError);
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.dataset.content = sub.text;
    label.textContent = sub.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'subtask-delete-btn';
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
    console.error(error);
    window.alert('Could not reach the database. Is `npm start` running?');
}

window.addEventListener('keydown', function (event) {
    // Only the main input adds a todo, the sub-task inputs have their own Enter handler
    if (event.key === 'Enter' && event.target.id === 'todo_text') {
        addItemInList();
    }
});

async function deleteAll() {
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

// * Pomodoro timer: 25 min of focus, then 5 min of break, and so on
const FOCUS_MINUTES = 30;
const BREAK_MINUTES = 7;

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
    // Based on the clock so the timer stays right even when the tab is in the background
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
    // Browsers only allow sound after a click, so prepare the audio now
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
        // An oscillator can only be started once, so each beep needs its own
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
