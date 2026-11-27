"""Builds index.html: src/page.html with src/core.js placed inside it. Run: python build.py"""
from pathlib import Path
here = Path(__file__).parent
core = (here / "src" / "core.js").read_text(encoding="utf-8").replace('if (typeof module !== "undefined") module.exports = Core;', "")
page = (here / "src" / "page.html").read_text(encoding="utf-8")
assert page.count("/*CORE*/") == 1 and "</script" not in core
(here / "index.html").write_text(page.replace("/*CORE*/", core), encoding="utf-8")
print("index.html written")
