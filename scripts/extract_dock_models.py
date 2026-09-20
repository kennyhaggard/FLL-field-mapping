"""Extract shared model images and exact placements from the six Inkscape layouts.

Run: python3 scripts/extract_dock_models.py | apply_patch
The source SVGs are never changed. Output is a patch for generated assets only.
"""
import itertools
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SVG = "{http://www.w3.org/2000/svg}"
XLINK = "{http://www.w3.org/1999/xlink}"
ET.register_namespace("", SVG[1:-1])
MODEL_IDS = {"m15": "solar-house", "m13": "image1-92", "m14": "seeds"}
NAMES = {"house": "m15", "keystone": "m13", "seeds": "m14"}
layouts = {}
source = None
for permutation in itertools.permutations(NAMES):
    filename = "field_" + "_".join(permutation) + ".svg"
    root = ET.parse(ROOT / filename).getroot()
    assert root.get("viewBox") == "0 0 226.281 128.981", filename
    if source is None:
        source = root
    layer = root.find(".//*[@id='layer1']")
    assert layer is not None and len(layer) == 3, filename
    key = "_".join(NAMES[name] for name in permutation)
    layouts[key] = {}
    for model, ident in MODEL_IDS.items():
        node = layer.find(f".//*[@id='{ident}']")
        original = source.find(f".//*[@id='{ident}']")
        assert node is not None and original is not None, (filename, ident)
        for attr in ["width", "height", "href", XLINK + "href"]:
            assert node.get(attr) == original.get(attr), (filename, ident, attr)
        layouts[key][model] = {attr: node.get(attr, "") for attr in ["x", "y", "transform"]}

asset = ET.Element(SVG + "svg", {"viewBox": source.get("viewBox")})
defs = ET.SubElement(asset, SVG + "defs")

def image_copy(node, ident):
    # Keep only rendering attributes; discard editor paths/metadata.
    attrs = {k: node.get(k) for k in ["width", "height", "preserveAspectRatio"] if node.get(k)}
    attrs.update(id=ident, x="0", y="0", href=node.get("href") or node.get(XLINK + "href"))
    assert attrs["href"].startswith("data:image/png;base64,")
    return ET.Element(SVG + "image", attrs)

for model, ident in MODEL_IDS.items():
    defs.append(image_copy(source.find(f".//*[@id='{ident}']"), model))
dock_ids = ["image1-47", "image1-47-8", "image1-47-8-9"]
defs.append(image_copy(source.find(f".//*[@id='{dock_ids[0]}']"), "dock-base"))
docks = ET.SubElement(asset, SVG + "g", {"id": "fixed-docks"})
for ident in dock_ids:
    node = source.find(f".//*[@id='{ident}']")
    ET.SubElement(docks, SVG + "use", {"href": "#dock-base", **{k: node.get(k) for k in ["x", "y", "transform"]}})

outputs = {
    "assets/dock-models.svg": ET.tostring(asset, encoding="unicode") + "\n",
    "js/domain/dock_placements.js": "// Generated from the six field_*.svg layouts by scripts/extract_dock_models.py.\n"
        + "// Keys follow City (bottom), Farm (middle), Mine (top).\n"
        + "export const DOCK_PLACEMENTS = " + json.dumps(layouts, indent=2) + ";\n",
}
print("*** Begin Patch")
for name, content in outputs.items():
    path = ROOT / name
    if path.exists():
        old = path.read_text()
        if old == content:
            continue
        print(f"*** Update File: {path}\n@@")
        print("\n".join("-" + line for line in old.splitlines()))
        print("\n".join("+" + line for line in content.splitlines()))
    else:
        print(f"*** Add File: {path}")
        print("\n".join("+" + line for line in content.splitlines()))
print("*** End Patch")
