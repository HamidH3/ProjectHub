// The project colours (these names match the database's allowed values).
// `dot` is used in the sidebar and on cards; `paper` tints the sticky notes.
export const PROJECT_COLORS = {
  orange: { label: "Orange", dot: "#d97757", paper: "#f6d7c8" },
  yellow: { label: "Yellow", dot: "#e5b94e", paper: "#f7e8a8" },
  pink: { label: "Pink", dot: "#e58fb4", paper: "#f7d2e2" },
  mint: { label: "Mint", dot: "#5fc9a0", paper: "#cdeedf" },
  blue: { label: "Blue", dot: "#6aa4f0", paper: "#d2e3fa" },
  lilac: { label: "Lilac", dot: "#a891f0", paper: "#e2dafb" },
  grey: { label: "Grey", dot: "#9a9a9a", paper: "#e6e6e3" },
} as const;

export type ProjectColor = keyof typeof PROJECT_COLORS;
export const PROJECT_COLOR_NAMES = Object.keys(PROJECT_COLORS) as ProjectColor[];

export function colorOf(name: string | null | undefined) {
  return PROJECT_COLORS[(name ?? "orange") as ProjectColor] ?? PROJECT_COLORS.orange;
}

export const PROJECT_STATUSES = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUSES;
