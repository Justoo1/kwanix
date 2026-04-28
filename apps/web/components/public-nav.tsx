import Link from "next/link";

export default function PublicNav() {
  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/85 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-extrabold tracking-tighter text-primary"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Kwanix
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/discover"
            className="font-medium tracking-tight text-muted-foreground hover:text-foreground transition-colors duration-200"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Find a trip
          </Link>
          <Link
            href="/track"
            className="font-medium tracking-tight text-muted-foreground hover:text-foreground transition-colors duration-200"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Track parcel
          </Link>
        </nav>

        <Link
          href="/login"
          className="hidden sm:inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all duration-200"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
