
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
    const data = await Deno.readFile(file.path);
    // Convert to base64 manually to avoid stack overflow with spread operator on large arrays
    // Use a chunked approach for large files
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    const b64 = btoa(binary);
    content += `  { mime: "${file.mime}", data: "${b64}" },\n`;
    console.log(`Processed ${file.path}`);
  } catch (e) {
    console.error(`Error reading ${file.path}:`, e);
  }
}

content += "];\n";

await Deno.writeTextFile("/Users/konniet/Downloads/visualizatiezonwering/edge-functions/uitval_references.ts", content);
console.log("uitval_references.ts generated successfully");
