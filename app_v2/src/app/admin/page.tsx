"use client";

export default function AdminPanelPage() {
  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    background: "white",
  };

  const linkBtn: React.CSSProperties = {
    display: "inline-block",
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Admin</div>
          <h1 style={{ margin: 0 }}>Admin Panel</h1>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            Jump to each admin tool.
          </div>
        </div>
        <a href="/home" style={{ fontWeight: 800 }}>
          Home
        </a>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={{ fontWeight: 1000, marginBottom: 6 }}>Goals</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
            Set monthly goals, prepare daily distribution, publish to stores.
          </div>
          <a href="/admin/goals" style={linkBtn}>
            Open Goals Admin
          </a>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 1000, marginBottom: 6 }}>Coming next</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
            Add additional admin tools here as we build them (users, announcements, templates, etc).
          </div>
          <span style={{ fontSize: 12, opacity: 0.65 }}>Placeholder card</span>
        </div>
      </div>
    </div>
  );
}
