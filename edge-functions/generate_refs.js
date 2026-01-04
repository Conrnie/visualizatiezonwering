
const fs = require('fs');
const path = require('path');

const files = [
  { path: "/Users/konniet/Downloads/reference_uitvalscherm_6.jpg", mime: "image/jpeg" },
  { path: "/Users/konniet/Downloads/reference_uitvalscherm_7.jpg", mime: "image/jpeg" },
  { path: "/Users/konniet/Downloads/Uitvalscherm_reference_1.webp", mime: "image/webp" },
  { path: "/Users/konniet/Downloads/UItvalscherm_reference_2.jpeg", mime: "image/jpeg" },
  { path: "/Users/konniet/Downloads/uitvalscherm_reference_4.jpg", mime: "image/jpeg" },
  { path: "/Users/konniet/Downloads/uitvalscherm_reference_5.jpg", mime: "image/jpeg" }
];

let content = "export const UITVAL_REFS = [\n";

for (const file of files) {
  try {
    const data = fs.readFileSync(file.path);
    const b64 = data.toString('base64');
    content += `  { mime: "${file.mime}", data: "${b64}" },\n`;
    console.log(`Processed ${file.path}`);
  } catch (e) {
    console.error(`Error reading ${file.path}:`, e);
  }
}

content += "];\n";

fs.writeFileSync("/Users/konniet/Downloads/visualizatiezonwering/edge-functions/uitval_references.ts", content);
console.log("uitval_references.ts generated successfully");
