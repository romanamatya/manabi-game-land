#!/usr/bin/env python3
"""Package reviewed Site dist as an isolated, public GitHub Pages preview."""
import argparse, pathlib, shutil, re, json, hashlib, subprocess
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True,help='Reviewed Site dist directory');args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parents[1];source=pathlib.Path(args.source).resolve();target=repo/'preview'
if not (source/'index.html').is_file() or not re.search(r'preview\s*:\s*true',(source/'environment.js').read_text()):raise SystemExit('確認用のdist（preview:true）だけを指定してください。')
# Only the generated preview subtree may be replaced; never touch production files.
if target.exists():shutil.rmtree(target)
shutil.copytree(source,target,ignore=shutil.ignore_patterns('admin*','.openai','.*','qa-*'))
(target/'environment.js').write_text("window.MANABI_ENV = Object.freeze({preview:true,publicPreview:true});\n")
p=target/'environment-runtime.js';s=p.read_text().replace("'manabi_preview_test:'","'manabi_public_preview_test:'").replace("'manabi_preview:'","'manabi_public_preview:'");p.write_text(s)
# No admin demo, privileged source or cloud access is published under preview/.
(target/'admin.html').write_text('''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理者機能｜確認用</title><link rel="stylesheet" href="shop.css"></head><body><main><h1>管理者機能</h1><p>公開確認用サイトでは管理者機能を利用できません。</p><p>管理者画面は既存のGoogle認証と管理者権限確認を使用します。</p><p><a href="../admin.html">管理者ログインへ</a></p><p><a href="index.html">確認用サイトへ戻る</a></p></main></body></html>''')
csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; worker-src 'none'"
for p in target.rglob('*.html'):
 s=p.read_text();guard='<meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="robots" content="noindex,nofollow">'
 if '<head>' in s:s=s.replace('<head>','<head>'+guard,1)
 else:s=re.sub(r'(<html[^>]*>)',r'\1<head>'+guard+'</head>',s,count=1)
 p.write_text(s)
try:commit=subprocess.check_output(['git','-C',str(source.parent),'rev-parse','HEAD'],text=True).strip()
except subprocess.CalledProcessError:commit=None
manifest={'source_commit':commit,'mode':'public-preview','cloud_writes':False,'storage_prefix':'manabi_public_preview:','files':{str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(target.rglob('*')) if p.is_file()}}
(target/'version.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Prepared {len(manifest["files"])} preview files from {commit}')
