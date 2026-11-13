"""
Turns a scan of the Marcus Aurelius bust into the small mesh scripts/shelf.py
places on top of the Shelf.

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/bust_prep.py -- <scan.stl> [triangles]

The scan is half a million triangles and 24MB, which is a 3D print, not a web
page. This cuts it to a few thousand, stands it on the origin one unit tall,
and writes scripts/bust.ply. That file is committed; the scan is not.

Run it again only if the scan changes. shelf.py reads bust.ply on every build.
"""
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
source = argv[0]
triangles = int(argv[1]) if len(argv) > 1 else 6000

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.wm.stl_import(filepath=source)
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj

mod = obj.modifiers.new("Decimate", "DECIMATE")
mod.ratio = triangles / max(1, len(obj.data.polygons))
bpy.ops.object.modifier_apply(modifier=mod.name)

# Stand it on the origin, centred, one unit tall. The scan is already Z-up
# and faces -Y, which is towards the camera once shelf.py has placed it.
xs = [v.co for v in obj.data.vertices]
lo = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
hi = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
scale = 1.0 / (hi.z - lo.z)
for v in obj.data.vertices:
    v.co = Vector(((v.co.x - (lo.x + hi.x) / 2) * scale, (v.co.y - (lo.y + hi.y) / 2) * scale, (v.co.z - lo.z) * scale))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bust.ply")
bpy.ops.wm.ply_export(filepath=out, export_selected_objects=True, export_normals=False, export_uv=False, export_colors="NONE", ascii_format=False)
print(f"[bust] {len(obj.data.polygons)} triangles, {((hi.x-lo.x)*scale):.3f} wide, {((hi.y-lo.y)*scale):.3f} deep -> {out}")
