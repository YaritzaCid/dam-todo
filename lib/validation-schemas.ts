import { z } from 'zod';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const emailField = z.string().trim().transform((email) => email.toLowerCase());
const passwordField = z.string();

export const loginSchema = z
  .object({
    email: emailField,
    password: passwordField,
  })
  .superRefine(({ email, password }, ctx) => {
    const addLoginIssue = (message: string) => ctx.addIssue({ code: 'custom', message });

    if (!email && !password) {
      addLoginIssue('Faltan piezas: introduce correo y contraseña.');
      return;
    }

    if (!email) {
      addLoginIssue('Faltan piezas: introduce correo.');
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
      addLoginIssue('La pieza de correo no encaja: usa un correo válido.');
    }
  });

export const registrationSchema = z
  .object({
    email: emailField,
    password: passwordField,
    confirmPassword: passwordField,
  })
  .superRefine(({ email, password, confirmPassword }, ctx) => {
    const addRegistrationIssue = (message: string) => ctx.addIssue({ code: 'custom', message });

    if (!email) {
      addRegistrationIssue('Falta la pieza de correo para crear tu cuenta.');
      return;
    }

    if (!EMAIL_PATTERN.test(email)) {
      addRegistrationIssue('La pieza de correo no encaja: usa un correo válido.');
      return;
    }

    if (!password) {
      addRegistrationIssue('Faltan piezas: introduce contraseña');
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
      addRegistrationIssue('Las contraseñas no encajan. Revísalas.');
    }
  });

export const todoTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'Escribe una tarea antes de añadir la pieza.' });

export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;
export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationData = z.output<typeof registrationSchema>;
