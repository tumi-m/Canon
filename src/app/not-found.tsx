import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 1060, margin: "0 auto", padding: "120px 24px" }}>
      <p
        style={{
          fontFamily: "var(--mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.22em",
          color: "var(--red)",
          textTransform: "uppercase",
        }}
      >
        404
      </p>
      <h1 style={{ fontWeight: 400, fontSize: "clamp(2rem,5vw,3rem)", marginTop: 14 }}>
        nobody has claimed that handle yet.
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 18, maxWidth: "48ch" }}>
        canons live at <code>canon.so/&lt;handle&gt;</code>. this one is still empty.
      </p>
      <p style={{ marginTop: 28 }}>
        <Link href="/">← back to the front</Link>
      </p>
    </main>
  );
}
