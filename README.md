# ToDo List

A to-do list with sub-tasks, a Pomodoro focus timer and a weather widget.

- **Front end:** plain HTML / CSS / JavaScript in [public/](public/)
- **Back end:** Node.js + Express, written in TypeScript ([server.ts](server.ts))
- **Database:** MariaDB (tasks and sub-tasks)
- **Weather:** OpenWeatherMap API, called by the server so the API key never reaches the browser

## Quick start (everything already installed)

```bash
npm install
cp .env.example .env   # then fill in the values, see below
npm start
```

Open <http://localhost:3000>. On Windows you can also double-click `todo.bat`, which opens the browser and starts the server.

## Configuration (`.env`)

| Variable          | Description                                   |
| ----------------- | --------------------------------------------- |
| `DB_HOST`         | MariaDB host, usually `localhost`             |
| `DB_USER`         | MariaDB user                                  |
| `DB_PASSWORD`     | Password of that user                         |
| `DB_NAME`         | Database name, `todo` by default              |
| `PORT`            | Port the server listens on, `3000` by default |
| `WEATHER_API_KEY` | Your OpenWeatherMap API key                   |

`.env` is ignored by git: never commit your passwords or API key.

## Scripts

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `npm start`         | Starts the server (Node runs `server.ts` directly by stripping types) |
| `npm run typecheck` | Checks the TypeScript types with `tsc` (nothing is compiled)          |

## API

| Method   | Route                         | Body       | Description                     |
| -------- | ----------------------------- | ---------- | ------------------------------- |
| `GET`    | `/todos`                      |            | All tasks with their sub-tasks  |
| `POST`   | `/todos`                      | `{ text }` | Create a task                   |
| `PATCH`  | `/todos/:id`                  | `{ done }` | Mark a task done / not done     |
| `DELETE` | `/todos/:id`                  |            | Delete a task and its sub-tasks |
| `POST`   | `/todos/:todoId/subtasks`     | `{ text }` | Add a sub-task                  |
| `PATCH`  | `/todos/:todoId/subtasks/:id` | `{ done }` | Mark a sub-task done / not done |
| `DELETE` | `/todos/:todoId/subtasks/:id` |            | Delete a sub-task               |
| `GET`    | `/weather?city=Paris`         |            | Current weather for a city      |

## Database and permissions

The database, the `todos` and `subtask` tables and the app's user are created by [schema.sql](schema.sql), **run once by an admin**:

```bash
mariadb -u root -p < schema.sql
```

The app connects as `todo_user`, which only has `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the `todo` database (principle of least privilege). It cannot create, alter or drop tables, so the server never creates the schema itself: it only checks at startup that the tables exist.

---

## How to start the project from scratch

This section assumes a fresh Windows computer with **nothing** installed. (On macOS / Linux the steps are the same, only the install commands differ.)

### 1. Install Git

Download and install Git from <https://git-scm.com/downloads> (default options are fine). Check it works in a new terminal:

```bash
git --version
```

### 2. Install Node.js

The server is written in TypeScript and Node runs it **directly**, so you need **Node.js 22.18 or newer** (the current LTS is fine).

Download the LTS installer from <https://nodejs.org> and install it. `npm` comes with it. Check:

```bash
node -v
npm -v
```

### 3. Install MariaDB

Download MariaDB Server from <https://mariadb.org/download/> and run the installer.

- When asked, **choose a password for the `root` user** and write it down.
- Keep the default port `3306`.
- Leave "Install as service" checked so MariaDB starts with Windows.

Alternatively, from a terminal: `winget install MariaDB.Server`.

### 4. Get a weather API key

1. Create a free account on <https://openweathermap.org>.
2. Go to **My API keys** and copy your key.

A new key can take a little while (up to a couple of hours) before it works. The rest of the app works without it.

### 5. Get the code

```bash
git clone <url-of-this-repository> ToDoList
cd ToDoList
```

### 6. Create the database, the tables and the app's user (admin)

This step is done **as the MariaDB admin (`root`)**, with [schema.sql](schema.sql).

1. Open `schema.sql` and replace `'change_me'` with a real password for `todo_user`.
2. Run it from the project folder and enter the root password:

   ```bash
   mariadb -u root -p < schema.sql
   ```

   In PowerShell, `<` does not work, use: `Get-Content schema.sql | mariadb -u root -p`.
   If `mariadb` is not found, open the **MySQL Client (MariaDB)** shortcut from the Start menu and type `source C:/path/to/ToDoList/schema.sql`.

3. Check the user's rights:

   ```sql
   SHOW GRANTS FOR 'todo_user'@'localhost';
   ```

   You should only see `GRANT SELECT, INSERT, UPDATE, DELETE ON todo.* ...` (plus the `USAGE` line, which means "can log in").

### 7. Install the dependencies

```bash
npm install
```

This creates `node_modules/` with Express, the MariaDB driver, dotenv and TypeScript.

### 8. Create the `.env` file

Copy the example file:

```bash
cp .env.example .env        # Git Bash / macOS / Linux
copy .env.example .env      # Windows cmd / PowerShell
```

Then edit `.env` with the values from steps 4 and 6:

```env
DB_HOST=localhost
DB_USER=todo_user
DB_PASSWORD=the_password_you_put_in_schema.sql
DB_NAME=todo
PORT=3000
WEATHER_API_KEY=your_openweathermap_key
```

### 9. Start the server

```bash
npm start
```

You should see:

```
ToDo List running on http://localhost:3000
```

Open <http://localhost:3000> in your browser. Done!

### Troubleshooting

| Problem                                        | Fix                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Could not connect to MariaDB: ...`            | Check MariaDB is running (Windows _Services_ → MariaDB) and the `DB_*` values in `.env`. |
| `Access denied for user`                       | Wrong `DB_USER` / `DB_PASSWORD` in `.env`, or `schema.sql` was not run (step 6).         |
| `Unknown database 'todo'` / `Table ... doesn't exist` | An admin must run `schema.sql` (step 6).                                          |
| `... command denied to user 'todo_user'`       | Expected for anything other than SELECT/INSERT/UPDATE/DELETE: do it as root.             |
| `SyntaxError` / `Unknown file extension ".ts"` | Your Node.js is too old: install 22.18 or newer (step 2).                                |
| `EADDRINUSE`                                   | Port 3000 is already used: stop the other program or change `PORT` in `.env`.            |
| Weather shows an error / `401`                 | API key missing, wrong, or not activated yet (step 4).                                   |
