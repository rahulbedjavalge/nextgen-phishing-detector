#!/usr/bin/env node
// Simple CLI to score a raw email or text file
import fs from 'fs';

const file = process.argv[2];
if (!file) {
  console.error("Usage: phishscan <file>");
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8');

const suspicious = [
  "verify your account","urgent","update your password","confirm your identity",
  "security alert","reset your password","unusual activity","login immediately",
  "suspend","account closed","click below","wire transfer","gift card","invoice attached"
];
let wordHits = 0;
for (const w of suspicious) {
  const re = new RegExp(w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
  if (re.test(text)) wordHits += 1;
}
const exclamations = (text.match(/!/g) || []).length;
const allCapsWords = (text.match(/\b[A-Z]{6,}\b/g) || []).length;

const weights = { bias: -1.2, wordHits: 0.5, exclamations: 0.05, allCapsWords: 0.08 };
const linear = weights.bias + weights.wordHits * wordHits + weights.exclamations * exclamations + weights.allCapsWords * allCapsWords;
const prob = 1 / (1 + Math.exp(-linear));

console.log("Phishing risk:", Math.round(prob * 100) + "%");
