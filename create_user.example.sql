-- Copy to create_user.local.sql (git-ignored), replace change_me, run as root

-- Rerunning replaces the user, so it also changes the password
CREATE OR REPLACE USER 'todo_user'@'localhost' IDENTIFIED BY 'change_me';

-- Least privilege: data only, on this database
GRANT SELECT, INSERT, UPDATE, DELETE ON todo.* TO 'todo_user'@'localhost';
