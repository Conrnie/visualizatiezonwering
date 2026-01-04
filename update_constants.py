import re
import os

file_path = "/Users/konniet/Downloads/visualizatiezonwering/edge-functions/simple_edit_v2_1 color.ts"

def read_file_clean(path):
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return f.read().replace('\n', '').replace('\r', '').strip()

ref4 = read_file_clean('/tmp/ref4_new.b64')
ref5 = read_file_clean('/tmp/ref5_new.b64')
sketch = read_file_clean('/tmp/sketch_new.b64')
ref2 = read_file_clean('/tmp/ref_new_new.b64') # uitvalscherm_new.jpg

with open(file_path, 'r') as f:
    content = f.read()

def replace_const(name, value, content):
    if not value:
        print(f"Skipping {name} (no value)")
        return content
    # Look for export const NAME = "...";
    # We match "..." lazily or greedily? Value can be huge.
    # We'll match up to the closing quote.
    # Warning: if the file uses single quotes, this regex expects double quotes as per my previous patch.
    # The previous patch used double quotes.
    pattern = r'(export const ' + name + r' = ")([^"]+)(")'
    
    # Check if pattern exists
    if not re.search(pattern, content):
        print(f"Pattern not found for {name}")
        return content
        
    return re.sub(pattern, r'\g<1>' + value + r'\g<3>', content)

content = replace_const('UITVAL_REF_4_BASE64', ref4, content)
content = replace_const('UITVAL_REF_5_BASE64', ref5, content)
content = replace_const('UITVAL_SKETCH_BASE64', sketch, content)
content = replace_const('UITVAL_REF_2_BASE64', ref2, content)

with open(file_path, 'w') as f:
    f.write(content)

print("Updated constants in file.")
