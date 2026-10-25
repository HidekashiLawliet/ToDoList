-- Run as root: mariadb -u root -p < schema.sql

-- Name must match DB_NAME in .env
CREATE DATABASE IF NOT EXISTS todo
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE todo;

-- One row per user: UNIQUE pseudonyme, bcrypt hashed_password
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    pseudonyme VARCHAR(50) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;

-- One row per task; parent_id is the owning user
CREATE TABLE IF NOT EXISTS todos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NOT NULL,
    text VARCHAR(255) NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (parent_id) REFERENCES users(user_id) ON DELETE CASCADE
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;

-- One row per sub-task; deleted with its task
CREATE TABLE IF NOT EXISTS subtask (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT NOT NULL,
    text VARCHAR(255) NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE
)
COLLATE='utf8mb4_uca1400_ai_ci'
ENGINE=InnoDB;
