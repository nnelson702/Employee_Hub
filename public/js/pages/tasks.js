export const TasksPage = {
  title: "Tasks",
  subtitle: "Assigned tasks, priority, due date, and completion flow.",
  render: async () => {
    const d = document.createElement("div");
    d.className = "card";
    d.textContent = "Next: wire to hub_tasks + create modal.";
    return d;
  },
};
