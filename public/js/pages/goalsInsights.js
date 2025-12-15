export const GoalsInsightsPage = {
  title: "Goals & Insights",
  subtitle: "Read-only performance vs goals (server-side aggregates).",
  render: async () => {
    const d = document.createElement("div");
    d.className = "card";
    d.textContent = "Next: wire to views (v_hub_goals_month, v_hub_actuals_mtd, etc.).";
    return d;
  },
};
