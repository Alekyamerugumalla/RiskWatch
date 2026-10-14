import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSV dataset location: server/data/malicious_phish.csv
const datasetPath = path.resolve(
  __dirname,
  "../data/malicious_phish.csv"
);

const urlDatabase = new Map();

function normalizeUrl(value) {
  try {
    let input = String(value).trim();

    if (!input) return null;

    if (!/^https?:\/\//i.test(input)) {
      input = "https://" + input;
    }

    const parsed = new URL(input);

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const pathname = parsed.pathname.replace(/\/+$/, "");

    return hostname + pathname + parsed.search;
  } catch {
    return null;
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const character = line[i];

    if (character === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function addDatasetEntry(url, type) {
  const normalized = normalizeUrl(url);
  const label = String(type || "").trim().toLowerCase();

  if (!normalized || !label) return;

  // If a URL has conflicting labels, retain all labels.
  if (!urlDatabase.has(normalized)) {
    urlDatabase.set(normalized, new Set());
  }

  urlDatabase.get(normalized).add(label);
}

async function loadDataset() {
  if (!fs.existsSync(datasetPath)) {
    console.error("RiskWatch URL dataset not found:", datasetPath);
    return;
  }

  const input = fs.createReadStream(datasetPath, {
    encoding: "utf8"
  });

  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity
  });

  let isHeader = true;
  let loadedCount = 0;

  for await (const line of lines) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    if (!line.trim()) continue;

    const columns = parseCsvLine(line);
    const url = columns[0];
    const type = columns[1];

    if (url && type) {
      addDatasetEntry(url, type);
      loadedCount++;
    }
  }

  console.log(
    `RiskWatch URL dataset loaded: ${loadedCount} rows`
  );
}

// Load the CSV once when this module is imported.
const datasetReady = loadDataset();

export async function checkUrl(inputUrl) {
  await datasetReady;

  const normalized = normalizeUrl(inputUrl);

  if (!normalized) {
    return {
      status: "invalid",
      label: "unknown",
      message: "Please enter a valid URL."
    };
  }

  const labels = urlDatabase.get(normalized);

  if (!labels || labels.size === 0) {
    return {
      status: "not_found",
      label: "unknown",
      message:
        "This URL was not found in the dataset. This does not mean it is safe."
    };
  }

  const allLabels = [...labels];

  // If labels conflict, avoid declaring the URL safe.
  const dangerousLabels = allLabels.filter(
    label => label !== "benign"
  );

  if (dangerousLabels.length > 0) {
    return {
      status: "found",
      label: dangerousLabels[0],
      labels: allLabels,
      message: "The dataset contains a potentially malicious classification."
    };
  }

  return {
    status: "found",
    label: "benign",
    labels: allLabels,
    message:
      "The dataset classifies this URL as benign. This is not a guarantee of safety."
  };
}