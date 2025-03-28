import express from "express";
import pa11y from "pa11y";
import puppeteer from "puppeteer";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3200;

// Enable CORS for all requests
app.use(cors());
app.use(express.static("public"));

// WCAG Principles Mapping
const WCAG_PRINCIPLES = {
  1: "Perceivable",
  2: "Operable",
  3: "Understandable",
  4: "Robust",
};

// WCAG Titles Mapping
const WCAG_TITLES = {
  "1_1_1": "Missing Alternative Text for Images",
  "1_2_1": "No Captions for Audio/Video Content",
  "1_3_1": "Content Not Adaptable (Use Semantic HTML)",
  "1_4_3": "Low Contrast Text (Hard to Read)",
  "1_4_6": "Insufficient Contrast for AAA Compliance",
  "1_4_10": "User Zoom Restricted (Viewport Issues)",
  "1_4_11": "Non-Descriptive Focus Indicators (Low Visibility)",
  "2_1_1": "Keyboard Navigation Not Supported",
  "2_2_2": "Users Don't Have Enough Time to Read/Interact",
  "2_3_1": "Flashing Content (Seizure Risk)",
  "2_4_2": "No Clear Page Title (Hard to Identify Content)",
  "2_4_4": "Missing Descriptive Links (Improve Click Clarity)",
  "2_4_6": "Headings Are Not Descriptive",
  "2_5_3": "Pointer Gestures Require Multi-Touch or Path-Based Actions",
  "3_1_1": "Difficult Language (Simplify Content)",
  "3_2_3": "Unexpected Behavior When Navigating",
  "3_2_5": "Links Open in a New Window Without Indicating",
  "3_3_1": "No Input Error Identification (User Confusion)",
  "4_1_1": "Invalid HTML (Parsing Issues)",
  "4_1_2": "Forms & Components Not Accessible to Assistive Tech",
  "4_1_3": "Status Messages Are Not Read by Assistive Tech"
};

// Get WCAG Title
function getWcagTitle(issueCode) {
  const match = issueCode.match(/(\d+)_\d+\.(\d+)_(\d+)_(\d+)/);
  if (match) {
    const key = `${match[1]}_${match[3]}_${match[4]}`;
    return WCAG_TITLES[key] || "Accessibility Issue Detected";
  }
  return "Accessibility Issue Detected";
}

function getWcagTitleKey(issueCode) {
  const match = issueCode?.match(/(\d+)_\d+\.(\d+)_(\d+)_(\d+)/);
  return match?.[3] && match?.[4] ? `${match[1]}_${match[3]}_${match[4]}` : "Unknown";
}

// Get WCAG Level
function getWcagLevel(standard) {
  return {
    A: standard === "WCAG2A" || standard === "WCAG2AA" || standard === "WCAG2AAA",
    AA: standard === "WCAG2AA" || standard === "WCAG2AAA",
    AAA: standard === "WCAG2AAA",
  };
}

// Puppeteer Screenshot Capture with Improved Error Handling
async function captureScreenshot(url, selector) {
  if (!selector) return null;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });  

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for the element to exist in the DOM
    const elementExists = await page.evaluate((sel) => !!document.querySelector(sel), selector);

    if (!elementExists) {
      console.warn(`⚠️ Element not found: ${selector} (Skipping Screenshot)`);
      await browser.close();
      return null;
    }

    // Scroll element into view
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, selector);

    // Wait for element visibility with a longer timeout
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });

    // Capture screenshot if the element is visible
    const element = await page.$(selector);
    if (element) {
      const screenshotBuffer = await element.screenshot();
      const base64Image = screenshotBuffer.toString("base64");
      await browser.close();
      return `data:image/png;base64,${base64Image}`;
    } else {
      console.warn(`⚠️ Element found but not visible: ${selector}`);
    }
  } catch (error) {
    console.error(`❌ Screenshot Capture Failed: ${error.message}`);
  }

  await browser.close();
  return null;
}

// Function to determine impact level based on WCAG level & issue type
function getImpactLevel(issue) {
  if (issue.type === "error") return "High";
  if (issue.type === "warning") return "Medium";
  if (issue.type === "notice") return "Low";
  return "Unknown";
}

// Function to determine responsibility based on issue type
function getResponsibility(issue) {
  if (issue.code.includes("1_")) return "Design Team";
  if (issue.code.includes("2_")) return "Development Team";
  if (issue.code.includes("3_")) return "Content Team";
  if (issue.code.includes("4_")) return "Development Team";
  return "General Accessibility Compliance";
}

// Group Issues with Titles, Levels & Screenshot Capture
async function groupIssues(issues, standard, url, includeScreenshot = true) {
  let grouped = {};
  const level = getWcagLevel(standard);

  for (let issue of issues) {
    const match = issue.code.match(/Principle(\d)/);
    const principleNum = match ? match[1] : null;
    const principle = WCAG_PRINCIPLES[principleNum] || "Best Practices";
    const titleKey = getWcagTitleKey(issue.code);
    const title = getWcagTitle(issue.code);

    if (!grouped[principle]) {
      grouped[principle] = {
        errors: [],
        warnings: [],
        notices: [],
      };
    }

    const typeMapping = {
      error: "errors",
      warning: "warnings",
      notice: "notices",
    };

    if (typeMapping[issue.type]) {
      const impact = getImpactLevel(issue);
      const responsibility = getResponsibility(issue);
      const occurrences = issues.filter((i) => i.code === issue.code).length;

      const issueData = {
        title,
        titleKey,
        message: issue.message,
        code: issue.code,
        level,
        context: issue.context,
        selector: issue.selector,
        helpUrl: issue.helpUrl || `https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=1#${issue.code}`,
        impact,
        responsibility,
        occurrences,
      };

      // 🛑 **Only capture screenshots when explicitly needed**
      if (includeScreenshot) {
        issueData.screenshot = await captureScreenshot(url, issue.selector);
      }

      grouped[principle][typeMapping[issue.type]].push(issueData);
    } else {
      console.warn(`⚠️ Unknown issue type: "${issue.type}" - Skipping`, issue);
    }
  }

  return grouped;
}

// Run Pa11y Accessibility Test
async function runTest(url, standard, includeScreenshot = true) {
  try {
    const results = await pa11y(url, {
      standard: standard,
      includeWarnings: true,
      timeout: 180000,
      chromeLaunchConfig: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-software-rasterizer",
          "--headless"
        ],
      },
    });

    console.log(`🔍 Raw Pa11y Issues (${standard}):`, results.issues);

    // 🛑 **Ensure screenshots are skipped for summary**
    const groupedIssues = await groupIssues(results.issues, standard, url, includeScreenshot);

    return {
      standard: standard,
      grouped: groupedIssues,
    };
  } catch (err) {
    console.error(`❌ Pa11y Error (${standard}):`, err.message);
    return {
      standard: standard,
      error: err.message,
    };
  }
}

app.get("/api/test/summary", async (req, res) => {
  if (!req.query.url || !/^https?:\/\//.test(req.query.url)) {
    return res.status(400).json({ error: "A valid URL is required" });
  }

  const url = req.query.url;
  const standards = ["WCAG2A", "WCAG2AA", "WCAG2AAA"];

  console.log(`🚀 Testing URL (Summary): ${url}`);

  // 🛑 **Pass `false` to skip screenshots**
  const results = await Promise.all(standards.map((standard) => runTest(url, standard, false)));

  res.status(200).json(results);
});

app.get("/api/test/full", async (req, res) => {
  if (!req.query.url || !/^https?:\/\//.test(req.query.url)) {
    return res.status(400).json({ error: "A valid URL is required" });
  }

  const url = req.query.url;
  const standards = ["WCAG2A", "WCAG2AA", "WCAG2AAA"];

  console.log(`🚀 Testing URL (Full): ${url}`);

  // ✅ `true` keeps screenshot capture for full reports
  const results = await Promise.all(standards.map((standard) => runTest(url, standard, true)));

  res.status(200).json(results);
});

// Start Server
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
