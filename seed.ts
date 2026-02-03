/**
 * Seed Script for Deep Agents Virtual Filesystem
 *
 * This script loads seed data into the storage backends:
 * - S3: Company documentation from ./s3/
 * - SQLite: User profiles and conversation history as proper relational data
 *
 * Run with: bun run seed
 */

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { S3Backend } from "./backends/s3-backend";
import { SQLiteBackend } from "./backends/sqlite-backend";

// Configuration from environment
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT || !S3_BUCKET) {
  console.error(
    "Error: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_ENDPOINT, and AWS_S3_BUCKET are required"
  );
  process.exit(1);
}

// ============================================================================
// User Data (will be stored in proper database tables)
// ============================================================================

const USERS = [
  {
    slug: "sarah-chen",
    name: "Sarah Chen",
    email: "sarah.chen@techstartup.example.com",
    role: "Engineering Manager",
    company: "TechStartup Inc",
    industry: "SaaS",
    team_size: 12,
    interests: ["automation", "code quality", "CI/CD"],
    current_tools: ["GitHub", "GitHub Actions", "Jest"],
    budget: "mid-range",
    decision_timeline: "Q1 2025",
    requirements: null,
    conversations: [
      {
        date: "2024-01-15",
        title: "Initial Contact",
        notes: [
          "User asked about integration options with GitHub Actions",
          "Interested in DeepCode for code review automation",
          "Team of 12 engineers, mostly Python and TypeScript",
          "Current pain point: PR reviews taking too long",
        ],
      },
      {
        date: "2024-01-20",
        title: "Follow-up Demo",
        notes: [
          "Completed DeepCode trial demo",
          "Very positive feedback on accuracy of suggestions",
          "Questions about Team pricing tier",
          'Concern: "Will it slow down our CI pipeline?"',
        ],
      },
      {
        date: "2024-01-28",
        title: "Technical Discussion",
        notes: [
          "Deep dive on GitHub Actions integration",
          "Confirmed: adds ~30 seconds to pipeline",
          "Discussed custom rule configuration",
          "Requested documentation on API access",
        ],
      },
      {
        date: "2024-02-05",
        title: "Pricing Discussion",
        notes: [
          "Compared Starter vs Team plans",
          "Team plan better fit for 12 users",
          "Asked about annual billing discount (20%)",
          "Next step: Get approval from finance",
        ],
      },
    ],
  },
  {
    slug: "marcus-johnson",
    name: "Marcus Johnson",
    email: "mjohnson@cityhospital.example.org",
    role: "Chief Technology Officer",
    company: "City General Hospital",
    industry: "Healthcare",
    team_size: 45,
    interests: ["HIPAA compliance", "patient data security", "interoperability"],
    current_tools: ["Epic EHR", "legacy systems"],
    budget: "enterprise",
    decision_timeline: "Q2 2025",
    requirements: ["HIPAA", "SOC2", "on-premise option"],
    conversations: [
      {
        date: "2024-02-01",
        title: "Discovery Call",
        notes: [
          "Hospital looking to modernize patient scheduling",
          "Current system is 15 years old, constant issues",
          "Critical requirement: HIPAA compliance",
          "Budget approved for Q2 implementation",
        ],
      },
      {
        date: "2024-02-10",
        title: "Security Deep-Dive",
        notes: [
          "Reviewed all compliance certifications",
          "Discussed BAA requirements - we can provide",
          "Questions about data residency (must stay in US)",
          "Requested SOC 2 Type II report",
        ],
      },
      {
        date: "2024-02-15",
        title: "Technical Requirements",
        notes: [
          "Integration with Epic EHR essential",
          "Need HL7 FHIR support",
          "Asked about on-premise vs cloud options",
          "Concerned about training staff (200+ users)",
        ],
      },
      {
        date: "2024-02-22",
        title: "Stakeholder Meeting",
        notes: [
          "Presented to hospital IT committee",
          "Positive reception on security posture",
          "Asked for customer references (provided 3)",
          "Timeline: Decision by end of March",
        ],
      },
    ],
  },
  {
    slug: "elena-rodriguez",
    name: "Elena Rodriguez",
    email: "elena.r@sustainableco.example.com",
    role: "Sustainability Director",
    company: "SustainableCo Manufacturing",
    industry: "Manufacturing",
    team_size: 8,
    interests: ["carbon tracking", "ESG reporting", "supply chain sustainability"],
    current_tools: ["Excel spreadsheets", "manual reporting"],
    budget: "growth-stage",
    decision_timeline: "immediate",
    requirements: ["SEC compliance", "EU taxonomy alignment"],
    conversations: [
      {
        date: "2024-01-25",
        title: "Inbound Lead",
        notes: [
          "Found us through sustainability conference",
          "Company under pressure for ESG reporting",
          "Currently tracking carbon manually in spreadsheets",
          "Needs solution before Q1 SEC filing deadline",
        ],
      },
      {
        date: "2024-01-30",
        title: "Urgent Demo Request",
        notes: [
          "Fast-tracked demo due to deadline pressure",
          "Very impressed with automated calculations",
          "Supply chain tracking is key differentiator",
          'Asked: "Can we import our existing data?"',
        ],
      },
      {
        date: "2024-02-02",
        title: "Data Migration Discussion",
        notes: [
          "Yes, we support CSV/Excel import",
          "Offered 2-week implementation timeline",
          "Discussed Sustainability Suite bundle",
          "Price concern: requested non-profit style discount",
        ],
      },
      {
        date: "2024-02-05",
        title: "Decision Pending",
        notes: [
          "Proposal sent with 15% first-year discount",
          "Waiting on CEO approval",
          "Competitor also in consideration (manual tool)",
          "Our advantage: automation + SEC compliance templates",
        ],
      },
    ],
  },
  {
    slug: "david-kim",
    name: "David Kim",
    email: "dkim@westcoast.example.edu",
    role: "Director of Online Learning",
    company: "West Coast Community College",
    industry: "Education",
    team_size: 25,
    interests: ["student engagement", "assessment automation", "accessibility"],
    current_tools: ["Canvas LMS", "Zoom"],
    budget: "education-discount",
    decision_timeline: "before Fall semester",
    requirements: ["ADA compliance", "LTI integration", "FERPA"],
    conversations: [
      {
        date: "2024-02-08",
        title: "Initial Inquiry",
        notes: [
          "Community college with 15,000 students",
          "Looking to enhance online course offerings",
          "Current LMS (Canvas) lacks AI grading",
          "Interested in AssessAI for essay grading",
        ],
      },
      {
        date: "2024-02-12",
        title: "Pilot Program Discussion",
        notes: [
          "Proposed pilot with English department",
          "500 students, 3 instructors",
          "Need LTI integration with Canvas",
          "Asked about accessibility compliance (critical)",
        ],
      },
      {
        date: "2024-02-18",
        title: "Accessibility Review",
        notes: [
          "Confirmed WCAG 2.1 AA compliance",
          "Screen reader compatible",
          "Keyboard navigation fully supported",
          "Provided accessibility audit report",
        ],
      },
      {
        date: "2024-02-25",
        title: "Budget Discussion",
        notes: [
          "Community college discount: 30% off",
          "Pilot pricing: $2/student for Advanced tier",
          "If successful, expand to full campus Fall 2025",
          "Need decision before spring break",
        ],
      },
    ],
  },
  {
    slug: "priya-sharma",
    name: "Priya Sharma",
    email: "priya@fintech-innovations.example.com",
    role: "VP of Engineering",
    company: "FinTech Innovations",
    industry: "Financial Services",
    team_size: 60,
    interests: ["security", "compliance", "code quality", "audit trails"],
    current_tools: ["GitLab", "SonarQube", "Jenkins"],
    budget: "enterprise",
    decision_timeline: "Q1 2025",
    requirements: ["SOC2", "PCI-DSS", "on-premise deployment"],
    conversations: [
      {
        date: "2024-01-18",
        title: "Security Assessment",
        notes: [
          "FinTech company, heavy regulatory requirements",
          "Current tools: GitLab + SonarQube",
          "Looking for AI-powered code review",
          "Must have: on-premise deployment option",
        ],
      },
      {
        date: "2024-01-25",
        title: "Compliance Deep-Dive",
        notes: [
          "PCI-DSS compliance is non-negotiable",
          "Reviewed our security architecture",
          "Discussed air-gapped deployment option",
          "Requested penetration test results",
        ],
      },
      {
        date: "2024-02-01",
        title: "POC Planning",
        notes: [
          "Agreed to 30-day proof of concept",
          "Will test with 10 engineers first",
          "Focus: false positive rate in security findings",
          "Success criteria defined in writing",
        ],
      },
      {
        date: "2024-02-15",
        title: "POC Results Review",
        notes: [
          "Very positive results: 85% accuracy",
          "Team loves the GitLab integration",
          "Only concern: some TypeScript false positives",
          "Discussed custom rule tuning options",
        ],
      },
      {
        date: "2024-02-20",
        title: "Enterprise Negotiation",
        notes: [
          "Moving forward with Enterprise plan",
          "60 seats needed",
          "Requested multi-year discount",
          "Legal reviewing our MSA",
        ],
      },
    ],
  },
];

// ============================================================================
// Seed Functions
// ============================================================================

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Seed S3 with company documentation
 */
async function seedS3() {
  console.log("\n☁️  Seeding S3 with company documentation...\n");

  const s3Backend = new S3Backend({
    bucket: S3_BUCKET!,
    prefix: "docs",
    endpoint: S3_ENDPOINT!,
    forcePathStyle: false,
    clientConfig: {
      region: "us-west-2",
      credentials: {
        accessKeyId: S3_ACCESS_KEY!,
        secretAccessKey: S3_SECRET_KEY!,
      },
    },
  });

  const s3Dir = "./s3";
  let successCount = 0;
  let errorCount = 0;

  try {
    const files = getAllFiles(s3Dir);

    for (const filePath of files) {
      const relativePath = "/" + relative(s3Dir, filePath);
      const content = await Bun.file(filePath).text();

      // Delete first to allow re-seeding
      await s3Backend.delete(relativePath);
      const result = await s3Backend.write(relativePath, content);

      if (result.error) {
        console.log(`  ❌ ${relativePath}: ${result.error}`);
        errorCount++;
      } else {
        console.log(`  ✅ ${relativePath}`);
        successCount++;
      }
    }
  } catch (error: any) {
    console.error(`  Error reading s3 directory: ${error.message}`);
  }

  console.log(`\n  Total: ${successCount} succeeded, ${errorCount} failed`);
}

/**
 * Seed SQLite with user data (proper relational database)
 */
function seedSQLite() {
  console.log("\n🗃️  Seeding SQLite database...\n");

  // Ensure data directory exists
  Bun.write("./data/.gitkeep", "");

  const db = new SQLiteBackend({ dbPath: "./data/memories.db" });

  // Clear existing data for clean re-seed
  db.clear();

  let userCount = 0;
  let convCount = 0;

  for (const userData of USERS) {
    // Insert user
    db.upsertUser({
      slug: userData.slug,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      company: userData.company,
      industry: userData.industry,
      team_size: userData.team_size,
      interests: JSON.stringify(userData.interests),
      current_tools: JSON.stringify(userData.current_tools),
      budget: userData.budget,
      decision_timeline: userData.decision_timeline,
      requirements: userData.requirements ? JSON.stringify(userData.requirements) : null,
    });
    console.log(`  👤 User: ${userData.name}`);
    userCount++;

    // Insert conversations
    for (const conv of userData.conversations) {
      db.addConversation(userData.slug, conv);
      convCount++;
    }
    console.log(`     └─ ${userData.conversations.length} conversations`);
  }

  db.close();
  console.log(`\n  Total: ${userCount} users, ${convCount} conversations`);
}

/**
 * Main seed function
 */
async function main() {
  console.log("🌱 Deep Agents Seed Script");
  console.log("=".repeat(50));

  // Seed S3
  await seedS3();

  // Seed SQLite
  seedSQLite();

  console.log("\n" + "=".repeat(50));
  console.log("✅ Seeding complete!\n");

  // Show what the virtual filesystem looks like
  console.log("Virtual filesystem structure:");
  console.log("  /docs/                    (S3)");
  console.log("    ├── acme-corp/");
  console.log("    ├── nexus-health/");
  console.log("    ├── greenleaf-analytics/");
  console.log("    └── edutech-pro/");
  console.log("  /memories/                (SQLite → Virtual Files)");
  console.log("    ├── users/");
  console.log("    │   ├── sarah-chen.json");
  console.log("    │   ├── marcus-johnson.json");
  console.log("    │   └── ...");
  console.log("    └── history/");
  console.log("        ├── sarah-chen.md");
  console.log("        ├── marcus-johnson.md");
  console.log("        └── ...\n");

  console.log("Run the agent with: bun run start");
}

main().catch(console.error);
