-- ToDo List - MariaDB schema
--
-- Run it ONCE as an admin (root), never as the app's user:
--   mariadb -u root -p < schema.sql
--
-- It creates the database, the tables, and the app's user 'todo_user'.
-- That user only gets SELECT, INSERT, UPDATE and DELETE: the server can read
-- and write tasks, but it cannot create, alter or drop tables. If the server is
-- ever compromised, the attacker cannot destroy the schema or touch other databases.
--
-- Before running it: replace 'change_me' below with a real password,
-- and put the same password in DB_PASSWORD in your .env.
-- The database name must match DB_NAME in your .env (see .env.example).
--
-- Safe to run again: every statement uses IF NOT EXISTS, so no data is lost.

CREATE DATABASE IF NOT EXISTS todo
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE todo;

-- One row per user.
-- pseudonyme is UNIQUE (a TINYTEXT column cannot be, hence VARCHAR): the sign-up relies on it.
-- hashed_password is a bcrypt hash (60 characters), never the password itself.
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    pseudonyme VARCHAR(50) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;

-- One row per task. parent_id is its owner: the user (users.user_id) who created it, and the only one who sees it.
-- Deleting a user deletes their tasks, and through subtask's own cascade their sub-tasks.
CREATE TABLE IF NOT EXISTS todos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NOT NULL,
    text VARCHAR(255) NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (parent_id) REFERENCES users(user_id) ON DELETE CASCADE
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;

-- One row per sub-task. ON DELETE CASCADE removes a task's sub-tasks
-- when the task itself is deleted.
CREATE TABLE IF NOT EXISTS subtask (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NOT NULL,
    text VARCHAR(255) NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;

-- The app's user: least privilege, data only, on this database only
CREATE USER IF NOT EXISTS 'todo_user'@'localhost' IDENTIFIED BY 'change_me';

-- Start from zero, in case an older setup gave it ALL PRIVILEGES
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'todo_user'@'localhost';

GRANT SELECT, INSERT, UPDATE, DELETE ON todo.* TO 'todo_user'@'localhost';
