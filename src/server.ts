import dotenv from 'dotenv';
import mariadb from 'mariadb';
import path from 'node:path';
import { createApp } from './app.ts';
import { createRepository } from './repository.ts';

dotenv.config({ quiet: true });

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});
const repo = createRepository(pool);

const port = process.env.PORT || 3000;

async function start() {
    // Outdated schema fails at startup, not on first request
    await repo.checkSchema();
    const app = await createApp({
        repo,
        publicDir: path.join(import.meta.dirname, '..', 'public'),
        weatherApiKey: process.env.WEATHER_API_KEY,
        spotifyClientId: process.env.spotify_client_id,
        // Spotify refuses "localhost" redirect URIs; Electron opens 127.0.0.1 too
        spotifyRedirectUri: `http://127.0.0.1:${port}/spotify/callback`,
    });
    app.listen(port, () => console.log(`ToDo List running on http://localhost:${port}`));
}

start().catch((err: Error) => {
    console.error('Could not connect to MariaDB:', err.message);
    console.error('Has an admin run schema.sql? (mariadb -u root -p < database/schema.sql) users needs user_id, pseudonyme, hashed_password and todos needs parent_id (the owner).');
    process.exit(1);
});
