/**
 * The server's one password rule (`services/passwords.py::MIN_PASSWORD_LENGTH`): at least
 * fifteen characters for a password being set, no composition rules. The forms only mirror
 * it so the button can wait; the server still decides. The login form never checks it —
 * older passwords are shorter and keep working.
 */
export const MIN_PASSWORD_LENGTH = 15;
