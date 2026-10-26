const form = document.getElementById('login_form');
const fields = {
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    confirm: document.getElementById('confirm_password')
};
const errorBox = document.getElementById('login_error');

// Fixed messages per code; URL text is never displayed
const LOGIN_ERRORS = {
    1: 'Wrong pseudonyme or password.'
};
const REGISTER_ERRORS = {
    pseudonyme: 'The pseudonyme must have 3 to 50 characters.',
    password: 'The password must have 8 to 72 characters.',
    mismatch: 'The two passwords are different.',
    exists: 'This pseudonyme is already taken.'
};

function setMode(registering) {
    form.action = registering ? '/userregister' : '/userlogin';
    document.title = (registering ? 'Create account' : 'Login') + ' - ToDo List';
    document.getElementById('login_title').textContent = registering ? 'Create account' : 'Login';
    document.getElementById('login_subtitle').textContent = registering
        ? 'Choose a pseudonyme and a password to create your account.'
        : 'Please enter your credentials to access your tasks.';
    document.getElementById('submit_btn').textContent = registering ? 'Create Account' : 'Login';
    document.getElementById('switch_btn').textContent = registering ? 'Back to login' : 'Create Account';

    // Same limits as register.ts, applied only when creating accounts
    fields.password.autocomplete = registering ? 'new-password' : 'current-password';
    const limits = [[fields.username, 'minlength', '3'], [fields.password, 'minlength', '8'],
        [fields.password, 'maxlength', '72'], [fields.password, 'aria-describedby', 'password_hint']];
    for (const [field, name, value] of limits) {
        if (registering) {
            field.setAttribute(name, value);
        } else {
            field.removeAttribute(name);
        }
    }
    document.getElementById('password_hint').hidden = !registering;

    document.getElementById('confirm_label').hidden = !registering;
    fields.confirm.hidden = !registering;
    fields.confirm.disabled = !registering;
    fields.confirm.value = '';
    fields.confirm.setCustomValidity('');
    errorBox.hidden = true;
}

// Browser flags a mismatch early; the server checks again
function checkSamePassword() {
    const different = !fields.confirm.disabled && fields.confirm.value !== fields.password.value;
    fields.confirm.setCustomValidity(different ? 'The two passwords are different.' : '');
}
fields.password.addEventListener('input', checkSamePassword);
fields.confirm.addEventListener('input', checkSamePassword);

document.getElementById('switch_btn').addEventListener('click', () => {
    setMode(fields.confirm.disabled);
    const firstEmpty = [fields.username, fields.password, fields.confirm].find(f => !f.hidden && f.value === '');
    (firstEmpty || fields.username).focus();
});

// Failures return as ?error=<code> or ?register&error=<code>
const params = new URLSearchParams(window.location.search);
const registering = params.has('register');
if (registering) {
    setMode(true);
}
if (params.has('error')) {
    const code = params.get('error');
    const messages = registering ? REGISTER_ERRORS : LOGIN_ERRORS;
    let message = 'Something went wrong, please try again.';
    if (Object.hasOwn(messages, code)) { // hasOwn: "constructor" must not match Object.prototype
        message = messages[code];
    }
    errorBox.textContent = message;
    errorBox.hidden = false;
}
