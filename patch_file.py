import os

FILE_PATH = "/Users/konniet/Downloads/visualizatiezonwering/edge-functions/simple_edit_v2_1 color.ts"

def read_b64(path):
    with open(path, 'r') as f:
        return f.read().strip()

try:
    ref5 = read_b64('/tmp/ref5.b64')
    ref4 = read_b64('/tmp/ref4.b64')
    ref2 = read_b64('/tmp/ref2.b64')
    sketch = read_b64('/tmp/sketch.b64')
except Exception as e:
    print(f"Error reading base64 files: {e}")
    exit(1)

# Insert constants
constants = f"""
export const UITVAL_REF_5_BASE64 = "{ref5}";
export const UITVAL_REF_4_BASE64 = "{ref4}";
export const UITVAL_REF_2_BASE64 = "{ref2}";
export const UITVAL_SKETCH_BASE64 = "{sketch}";
"""

with open(FILE_PATH, 'r') as f:
    content = f.read()

# Insert after STRUCT_REF_3_BASE64
insert_point = content.find('export const STRUCT_REF_3_BASE64 = "')
if insert_point == -1:
    print("Error: Could not find STRUCT_REF_3_BASE64")
    exit(1)

# Find the end of that line/declaration. It ends with ";
end_of_struct_ref = content.find('";', insert_point) + 2
content = content[:end_of_struct_ref] + "\n" + constants + content[end_of_struct_ref:]

# Replace the file reading logic
start_marker = "// Reference Image Selection Logic"
# We need to be careful with the start marker, searching from the beginning might find comments or similar text.
# But it seems unique enough in the context.
start_idx = content.find(start_marker)

# The end marker should be where the block ends.
# Original code has:
# ...
#      // Add any extra references passed from frontend (Image 7+)
#      if (Array.isArray(extra_reference_images)) {

end_marker = "// Add any extra references passed from frontend (Image 7+)"
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Error: Could not find replacement block. Start: {start_idx}, End: {end_idx}")
    exit(1)

# Verify we are inside the 'uitvalscherm' block if possible, but the markers cover it.
# The start marker is just before "if (awningType === 'uitvalscherm') {"

new_block = """// Reference Image Selection Logic
    if (awningType === 'uitvalscherm') {
      // Image 3: uitvalscherm_reference_5.jpg
      console.log('[INFO] Added uitvalscherm_reference_5.jpg (Embedded)');
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: UITVAL_REF_5_BASE64 } });

      // Image 4: uitvalscherm_reference_4.jpg (Primary)
      console.log('[INFO] Added uitvalscherm_reference_4.jpg (Embedded)');
      qaReferenceBase64 = UITVAL_REF_4_BASE64;
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: UITVAL_REF_4_BASE64 } });

      // Image 5: UItvalscherm_reference_2.jpeg
      console.log('[INFO] Added UItvalscherm_reference_2.jpeg (Embedded)');
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: UITVAL_REF_2_BASE64 } });

      // Image 6: uitvalscherm_sketch.png
      console.log('[INFO] Added uitvalscherm_sketch.png (Embedded)');
      parts.push({ inlineData: { mimeType: 'image/png', data: UITVAL_SKETCH_BASE64 } });

      """

content = content[:start_idx] + new_block + content[end_idx:]

with open(FILE_PATH, 'w') as f:
    f.write(content)

print("Successfully patched file.")
