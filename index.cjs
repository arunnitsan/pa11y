import express from "express";
import pa11y from "pa11y";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3200;

// Enable CORS
app.use(cors());
app.use(express.static("public"));

// Run Pa11y Test
async function runTest(url, standard) {
  try {
    const results = await pa11y(url, {
      standard,
      includeWarnings: true,
      timeout: 180000,
      ignore: [],
    });

    console.log(`🔍 Raw Pa11y Issues (${standard}):`, results.issues);
    return {
      standard,
      grouped: results.issues,
    };
  } catch (err) {
    console.error(`❌ Pa11y Error (${standard}):`, err.message);
    return { standard, error: err.message };
  }
}

// API Route - Run Accessibility Test
app.get("/api/test/summary", async (req, res) => {
  if (!req.query.url || !/^https?:\/\//.test(req.query.url)) {
    return res.status(400).json({ error: "A valid URL is required" });
  }

  const url = req.query.url;
  const standards = ["WCAG2A", "WCAG2AA", "WCAG2AAA"];
  console.log(`🚀 Running Pa11y Test for: ${url}`);

  const results = await Promise.all(standards.map((standard) => runTest(url, standard)));
  res.status(200).json(results);
});

// Start Server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
