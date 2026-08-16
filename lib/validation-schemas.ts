import { z } from 'zod';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const emailField = z.string().trim().transform((email) => email.toLowerCase());
const nameField = z.string().trim();
const passwordField = z.string();

export const loginSchema = z
  .object({
    email: emailField,
    password: passwordField,
  })
  .superRefine(({ email, password }, ctx) => {
    const addLoginIssue = (message: string) => ctx.addIssue({ code: 'custom', message });

    if (!email && !password) {
      addLoginIssue('Introduce correo y contraseña.');
      return;
    }

    if (!email) {
      addLoginIssue('Introduce correo.');
      return;
    }

    if (!password) {
      addLoginIssue('Faltan piezas: introduce contraseña');
      return;
    }

    if (password.length < 6) {
      addLoginIssue('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      addLoginIssue('Usa un correo válido.');
    }
  });

export const registrationSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirmPassword: passwordField,
  })
  .superRefine(({ name, email, password, confirmPassword }, ctx) => {
    const addRegistrationIssue = (message: string) => ctx.addIssue({ code: 'custom', message });

    if (!name) {
      addRegistrationIssue('Introduce tu nombre para crear tu cuenta.');
      return;
    }
    if (!email) {
      addRegistrationIssue('Introduce correo para crear tu cuenta.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      addRegistrationIssue('Usa un correo válido.');
      return;
    }

    if (!password) {
      addRegistrationIssue('Introduce contraseña.');
      return;
    }

    if (password.length < 6) {
      addRegistrationIssue('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    if (!confirmPassword) {
      addRegistrationIssue('Confirma la contraseña para cerrar el registro.');
      return;
    }

    if (password !== confirmPassword) {
      addRegistrationIssue('Las contraseñas no coinciden. Revísalas.');
    }
  });

export const todoTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Escribe un pendiente antes de añadirlo.' });

export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationData = z.output<typeof registrationSchema>;
