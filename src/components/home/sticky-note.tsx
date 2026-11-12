// A paper sticky note: pastel sheet, faint ruled lines, a strip of tape and a
// slight tilt. Used for today's to-dos on the home page.
import { cn } from "@/lib/utils";

export function StickyNote({
  title,
  paper,
  tilt = 0,
  children,
  className,
}: {
  title: string;
  paper: string; // background colour, e.g. from PROJECT_COLORS[...].paper
  tilt?: number; // degrees, small values like -1.5 to 1.5
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative min-h-52 min-w-0 rounded-[3px] px-5 pb-5 pt-7 text-[#2b2b2b] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7),0_2px_4px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:rotate-0",
        className,
      )}
      style={{
        backgroundColor: paper,
        // Ruled lines every 28px (one per line of text), starting below the title.
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(60,60,60,0.12) 27px, rgba(60,60,60,0.12) 28px)",
        backgroundPosition: "0 60px", // lines sit under each row of text
        transform: `rotate(${tilt}deg)`,
      }}
    >
      {/* Tape */}
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-2deg] bg-white/45 shadow-sm backdrop-blur-[1px]"
      />
      <h3 title={title} className="font-note line-clamp-2 text-lg font-semibold leading-6 [overflow-wrap:anywhere]">
        {title}
      </h3>
      <div className="mt-2 min-w-0 text-sm leading-7 [overflow-wrap:anywhere]">{children}</div>
    </article>
  );
}
