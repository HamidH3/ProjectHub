import { z } from "zod";
import { PROJECT_COLOR_NAMES, type ProjectColor } from "@/lib/project-colors";

// "" from an empty date field becomes null.
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.iso.date("Use a valid date.").nullable());

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Give the project a name.").max(120, "Keep the name under 120 characters."),
    description: z
      .string()
      .trim()
      .max(2000, "Keep the description under 2,000 characters.")
      .transform((v) => (v === "" ? null : v)),
    color: z.enum(PROJECT_COLOR_NAMES as [ProjectColor, ...ProjectColor[]]),
    status: z.enum(["active", "on_hold", "completed"]),
    start_date: optionalDate,
    deadline: optionalDate,
  })
  .refine((p) => !p.start_date || !p.deadline || p.deadline >= p.start_date, {
    message: "The deadline can't be before the start date.",
    path: ["deadline"],
  });

export const projectIdSchema = z.uuid();

export type ProjectInput = z.infer<typeof projectSchema>;
