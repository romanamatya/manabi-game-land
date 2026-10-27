#!/usr/bin/env python3
"""Compatibility entry point: generate preview from the single shared source."""
import pathlib, subprocess, sys
if len(sys.argv)>1:
    raise SystemExit('旧distのコピーは廃止しました。shared-src/siteを編集し、引数なしで実行してください。')
root=pathlib.Path(__file__).resolve().parents[1]
subprocess.run(['node',str(root/'tools/build-site.mjs'),'preview'],cwd=root,check=True)
