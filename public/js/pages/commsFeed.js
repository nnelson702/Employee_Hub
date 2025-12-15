export const CommsFeedPage = {
  title: "Comms Feed",
  subtitle: "Company + store-targeted posts (read receipts, comments, reactions).",
  render: async () => {
    const d = document.createElement("div");
    d.className = "card";
    d.textContent = "Next: render hub_feed_posts with targets + read receipts.";
    return d;
  },
};
