// Rules for inviting people and changing access. Checked on the server.
import { z } from "zod";
import { emailSchema, newPasswordSchema, usernameSchema } from "@/lib/validation/auth";

export const roleSchema = z.enum(["admin", "member"]);
export const idSchema = z.uuid();

export const inviteSchema = z.object({
  email: emailSchema,
  fullName: z
    .string()
    .trim()
    .max(100, "That name is too long.")
    .transform((v) => (v === "" ? null : v)),
  role: roleSchema,
  projectIds: z.array(idSchema).max(200),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const welcomeSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name.").max(100, "That name is too long."),
    username: usernameSchema,
  })
  .and(newPasswordSchema);
