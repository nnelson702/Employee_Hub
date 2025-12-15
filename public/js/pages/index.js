// public/js/pages/index.js
import { renderDashboard } from "./dashboard.js";
import { renderGoalsAdmin } from "./goals_admin.js";
import { renderGoalsInsights } from "./goals_insights.js";
import { renderCommsFeed } from "./comms_feed.js";
import { renderTasks } from "./tasks.js";
import { renderDeptWalks } from "./dept_walks.js";
import { renderMarketingTraining } from "./marketing_training.js";
import { renderAdminPanel } from "./admin_panel.js";

export const PAGES = {
  dashboard: { title: "Dashboard", render: renderDashboard },
  goals_admin: { title: "Goals Admin", render: renderGoalsAdmin },
  goals_insights: { title: "Goals & Insights", render: renderGoalsInsights },
  comms_feed: { title: "Comms Feed", render: renderCommsFeed },
  tasks: { title: "Tasks", render: renderTasks },
  dept_walks: { title: "Dept Walks", render: renderDeptWalks },
  marketing_training: { title: "Marketing & Training", render: renderMarketingTraining },
  admin_panel: { title: "Admin Panel", render: renderAdminPanel },
};
