
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

// * Retrieve ToDo from local storage

let todo = JSON.parse(localStorage.getItem("todo"));
let count = 0;
// * Add new ToDo

const addTodo = document.getElementById('addBtn');
addTodo.addEventListener('click', function () {
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
    document.getElementById('todo_list').appendChild(li);
    count += 1;
    li.innerHTML = `<button class="completed">✔</button>${todo} <button class="delete_btn">X</button>`;
});



// * Delete ToDo

// const deleteTodo = document.getElementById('delete_btn');
// deleteTodo.addEventListener('click', function () {
//     const input = document.getElementById('todo-input');
//     const todo = input.value;
//     input.value = '';
//     if (todo) {
//         const index = todo.indexOf(todo);
//         todo.splice(index, 1);
//         localStorage.setItem('todo', JSON.stringify(todo));
//         const li = document.getElementById(todo);
//         li.parentNode.removeChild(li);
//     }
// });
