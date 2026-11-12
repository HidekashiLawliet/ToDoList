// Electron shell: starts the Express server, then shows it in a window
import electron from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

// "components" only exists in the castLabs build (Widevine); plain Electron gives undefined
const { app, BrowserWindow, components, dialog } = electron;

const root = path.join(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
// 127.0.0.1, not localhost: it must match the Spotify redirect URI
const url = `http://127.0.0.1:${process.env.PORT || 3000}`;

let server = null;
let serverLog = '';
let win = null;

// Shows the problem, then really quits (app.quit() does nothing before "ready")
async function fail(message) {
    await app.whenReady();
    dialog.showErrorBox('ToDo List could not start', message);
    server?.kill();
    app.exit(1);
}

// True as soon as something answers on the app's address
async function serverAnswers() {
    try {
        await fetch(url);
        return true;
    } catch {
        return false;
    }
}

// Poll until the server answers (or give up after ~15 s)
async function waitForServer() {
    for (let i = 0; i < 60; i++) {
        if (await serverAnswers()) return true;
        if (server !== null && server.exitCode !== null) return false;
        await new Promise((r) => setTimeout(r, 250));
    }
    return false;
}

function startServer() {
    // The system Node runs the server, so bcrypt needs no rebuild for Electron
    server = spawn('node', ['src/server.ts'], { cwd: root });
    server.stdout.on('data', (d) => process.stdout.write(d));
    server.stderr.on('data', (d) => {
        serverLog += d;
        process.stderr.write(d);
    });
    server.on('error', (err) => fail(`Could not run "node": ${err.message}`));
    server.on('exit', (code) => {
        if (win === null) {
            fail(serverLog || `The server stopped with code ${code}.`);
        }
    });
}

// A second launch just brings the first window to the front
if (!app.requestSingleInstanceLock()) {
    app.exit(0);
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        // A server already running (npm start) is used as it is
        if (await serverAnswers()) {
            console.log(`Using the server already running on ${url}`);
        } else {
            startServer();
        }
        // castLabs Electron only: wait for Widevine, which Spotify playback needs
        if (components) {
            await components.whenReady().catch((err) => console.error('Widevine not available:', err));
        }
        if (!(await waitForServer())) {
            return fail(serverLog || `The server did not answer on ${url}.`);
        }
        win = new BrowserWindow({ width: 1200, height: 800, autoHideMenuBar: true });
        win.loadURL(url);
    });

    app.on('window-all-closed', () => app.quit());
    app.on('quit', () => server?.kill());
}
