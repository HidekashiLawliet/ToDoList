// * Spotify player in the header (Web Playback SDK, needs Premium)
(function () {
    const box = document.getElementById('spotify_player');
    if (!box) return;

    let accessToken = null;

    // Small helper: an element with a class and text, never innerHTML
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function showMessage(text, withConnect) {
        box.replaceChildren(el('p', 'sp_message', text));
        if (withConnect) box.append(connectButton());
    }

    function connectButton() {
        const btn = el('button', 'sp_btn sp_connect', 'Connect Spotify');
        btn.type = 'button';
        btn.addEventListener('click', () => { window.location.href = '/spotify/login'; });
        return btn;
    }

    async function fetchToken() {
        const response = await fetch('/spotify/token');
        if (!response.ok) return null;
        return response.json();
    }

    async function start() {
        let info;
        try {
            info = await fetchToken();
        } catch {
            return;
        }
        if (info === null || !info.configured && !info.connected) {
            box.hidden = true;
            return;
        }
        if (!info.connected) {
            const failed = new URLSearchParams(window.location.search).has('spotify');
            box.replaceChildren(connectButton());
            if (failed) box.prepend(el('p', 'sp_message', 'Spotify login failed, try again.'));
            return;
        }
        accessToken = info.accessToken;
        showMessage('Loading Spotify…');
        // The SDK calls this global once its script has loaded
        window.onSpotifyWebPlaybackSDKReady = createPlayer;
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.onerror = () => showMessage('Could not load Spotify.');
        document.head.append(script);
    }

    function createPlayer() {
        const player = new Spotify.Player({
            name: 'ToDo List',
            volume: 0.5,
            // Called at start and whenever the token expires
            getOAuthToken: async (callback) => {
                const info = await fetchToken().catch(() => null);
                if (info && info.connected) {
                    accessToken = info.accessToken;
                    callback(accessToken);
                } else {
                    showMessage('Spotify disconnected.', true);
                }
            },
        });

        const ui = buildControls(player);

        player.addListener('ready', async ({ device_id }) => {
            box.replaceChildren(ui.root);
            // Move playback to this window, without starting the music
            await fetch('https://api.spotify.com/v1/me/player', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_ids: [device_id], play: false }),
            }).catch(() => {});
        });
        player.addListener('player_state_changed', (state) => ui.update(state));
        player.addListener('initialization_error', () =>
            showMessage('This window cannot play Spotify (Widevine is missing).'));
        player.addListener('authentication_error', () => showMessage('Spotify login expired.', true));
        player.addListener('account_error', () => showMessage('Spotify Premium is required.'));
        player.addListener('playback_error', ({ message }) => console.error('Spotify:', message));

        player.connect();
    }

    // Compact pill (cover + play) in the header; the full panel pops out
    // below it on hover, keyboard focus, or a click on the cover (touch)
    function buildControls(player) {
        const root = el('div', 'sp_root');

        const pill = el('div', 'sp_pill');
        const toggle = el('button', 'sp_cover_btn');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Show Spotify player');
        toggle.setAttribute('aria-expanded', 'false');
        const smallCover = el('img', 'sp_cover sp_cover_small');
        smallCover.alt = '';
        smallCover.hidden = true;
        const note = el('span', 'sp_note', '♪');
        toggle.append(smallCover, note);
        const pillPlay = control('▶', 'Play', () => player.togglePlay());
        pill.append(toggle, pillPlay);

        const panel = el('div', 'sp_panel');
        const cover = el('img', 'sp_cover');
        cover.alt = '';
        cover.hidden = true;
        const info = el('div', 'sp_info');
        const track = el('p', 'sp_track', 'Nothing playing');
        const artist = el('p', 'sp_artist', 'Press play, or pick "ToDo List" as device in Spotify');
        info.append(track, artist);

        const buttons = el('div', 'sp_buttons');
        const prev = control('⏮', 'Previous track', () => player.previousTrack());
        const play = control('▶', 'Play', () => player.togglePlay());
        const next = control('⏭', 'Next track', () => player.nextTrack());
        const volume = el('input', 'sp_volume');
        volume.type = 'range';
        volume.min = '0';
        volume.max = '1';
        volume.step = '0.05';
        volume.value = '0.5';
        volume.setAttribute('aria-label', 'Volume');
        volume.addEventListener('input', () => player.setVolume(Number(volume.value)));
        const disconnect = control('✕', 'Disconnect Spotify', async () => {
            player.disconnect();
            await fetch('/spotify/disconnect', { method: 'POST' }).catch(() => {});
            box.replaceChildren(connectButton());
        });
        buttons.append(prev, play, next, volume, disconnect);
        panel.append(cover, info, buttons);
        root.append(pill, panel);

        // A click on the cover keeps the panel open (touch screens have no hover)
        function setOpen(open) {
            root.classList.toggle('sp_open', open);
            toggle.setAttribute('aria-expanded', String(open));
        }
        toggle.addEventListener('click', () => setOpen(!root.classList.contains('sp_open')));
        document.addEventListener('click', (event) => {
            if (!root.contains(event.target)) setOpen(false);
        });
        root.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
                toggle.focus();
            }
        });

        function update(state) {
            const current = state && state.track_window.current_track;
            if (!current) return;
            track.textContent = current.name;
            artist.textContent = current.artists.map((a) => a.name).join(', ');
            const image = current.album.images[0];
            for (const img of [cover, smallCover]) {
                img.hidden = !image;
                if (image) img.src = image.url;
            }
            note.hidden = Boolean(image);
            toggle.title = `${current.name} · ${artist.textContent}`;
            for (const btn of [play, pillPlay]) {
                btn.textContent = state.paused ? '▶' : '⏸';
                btn.setAttribute('aria-label', state.paused ? 'Play' : 'Pause');
            }
        }

        return { root, update };
    }

    function control(symbol, label, onClick) {
        const btn = el('button', 'sp_btn', symbol);
        btn.type = 'button';
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', onClick);
        return btn;
    }

    start();
})();
