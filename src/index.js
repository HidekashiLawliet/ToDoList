
window.onload = function () {
    var pageTitle = document.title;
    var attentionMessage = 'Come back here and focus ';

    document.addEventListener('visibilitychange', function () {
        document.title = document.hidden ? `${attentionMessage} 😡` : pageTitle;
    });
}

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

const addTodo = document.getElementById('addBtn');
let todo = JSON.parse(localStorage.getItem("todo"));
let count = 0;
let totalTasks = 0;

function addItemInList() {
    const input = document.getElementById('todo_text');
    const todo = input.value;
    if (todo === '' || todo.trim() === '') {
        input.value = '';
        window.alert('Please enter a task');
        return;
    }
    input.value = '';
    console.log(todo);
    localStorage.setItem('todo', JSON.stringify(todo));
    const li = document.createElement('li');
    document.getElementById('scroll_list').appendChild(li);
    li.className = count;
    li.innerHTML = `${todo}`;
    li.innerHTML = `
        <input type="checkbox" id="todo" name="todo" value="todo">
        <label for="todo" data-content="${todo}">${todo}</label>
        `
    const deleteBtn = document.createElement('button');
    li.appendChild(deleteBtn);
    deleteBtn.id = 'delete_btn';
    deleteBtn.textContent = 'X';
    deleteBtn.addEventListener('click', function () {
        deleteItem(this);
    });
    console.log(li.appendChild);

    totalTasks += 1;
    ItemCounter(totalTasks);
}

function deleteItem(element) {
    totalTasks -= 1;
    element.parentNode.parentNode.removeChild(element.parentNode);
    ItemCounter(totalTasks);
}

project_counter = document.getElementById('project_counter');

function ItemCounter(nb) {
    let total = 0;
    total += nb;
    project_counter.innerHTML = total;
}

addTodo.addEventListener('click', function () {
    addItemInList()
});

window.addEventListener('keydown', function (event) {
    if (event.keyCode === 13) {
        addItemInList();
        console.log('key enter pressed');
    }
    return;
});
