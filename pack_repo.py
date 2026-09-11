import os, zipfile, sys

root = r'C:/Users/Administrator/WorkBuddy/2026-08-07-10-09-09'
skip_dirs = {'.git', '.workbuddy', 'node_modules', '__pycache__'}
out = r'C:/Users/Administrator/WorkBuddy/2026-08-07-10-09-09/repo_source.zip'
n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in skip_dirs]
        if any(part in skip_dirs for part in dp.replace('\\', '/').split('/')):
            continue
        for f in fn:
            if '_test' in dp and f.lower().endswith(('.png', '.jpg')):
                continue
            fp = os.path.join(dp, f)
            rel = os.path.relpath(fp, root)
            z.write(fp, rel)
            n += 1
print('files packed:', n)
print('size MB:', round(os.path.getsize(out) / 1024 / 1024, 1))
