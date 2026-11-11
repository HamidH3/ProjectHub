// Rules for the login and account forms. The same rules run on the server
// before anything is sent to Supabase.
import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, numbers or underscores.");

// 72 is the most Supabase's password hashing will use.
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use 72 characters or fewer.");

export const setupSchema = z
  .object({
    token: z.string().min(1, "Enter the setup token."),
    email: emailSchema,
    username: usernameSchema,
    fullName: z.string().trim().min(1, "Enter your name.").max(100, "That name is too long."),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "The passwords don't match.",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username.").max(254),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "The passwords don't match.",
    path: ["confirm"],
  });

// What a form action sends back. `values` refills non-secret fields after a
// failed attempt (React clears forms after every submit).
export type FormState =
  | { error?: string; success?: string; values?: Record<string, string> }
  | undefined;
