export function buildNav(el, ctx, activeKey) {
  const items = [
    { key: "goals_admin", label: "Goals Admin", roles: ["admin"] },
    { key: "goals_insights", label: "Goals & Insights", roles: ["admin", "store_manager", "department_lead", "associate"] },
    { key: "admin_panel", label: "Admin Panel", roles: ["admin"] },
    { key: "comms_feed", label: "Comms Feed", roles: ["admin", "store_manager", "department_lead", "associate"] },
    { key: "tasks", label: "Tasks", roles: ["admin", "store_manager", "department_lead", "associate"] },
    { key: "dept_walks", label: "Dept Walks", roles: ["admin", "store_manager", "department_lead"] },
    { key: "marketing_training", label: "Marketing & Training", roles: ["admin", "store_manager", "department_lead", "associate"] },
  ];

  const allowed = items.filter((i) => i.roles.includes(ctx.role));

  el.innerHTML = "";
  allowed.forEach((i) => {
    const a = document.createElement("a");
    a.href = `#${i.key}`;
    a.textContent = i.label;
    if (i.key === activeKey) a.classList.add("active");
    el.appendChild(a);
  });
}
