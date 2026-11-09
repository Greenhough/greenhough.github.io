"""
Builds the Shelf in Blender, from a script.

This file is the source of truth for the model. The .glb and its baked textures
are build artifacts. See docs/adr/0003.

    # render a preview, through the camera the site actually uses
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/shelf.py -- --view site --render build/preview.png

    # the full rebuild: both atlases, the .glb, and the unlit check
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/shelf.py -- --view site --width 1280 --height 720 \
        --bake build/shelf-bake.png --bake-room build/room-bake.png \
        --export public/models/shelf.glb --show-baked build/baked-check.png
    node scripts/bake-to-webp.mjs

Judge the look from the --show-baked render, never from --render: see the
addendum to docs/adr/0003. A lit render goes through AgX and the atlas does
not, so a lit render will happily show you detail the atlas has already
clipped away. Iterate at --bake-size 768 --bake-samples 24, which takes about
a minute; the full 2048 bake takes about half an hour.

Dimensions come from the site: a Box is 0.2 x 1.0 x 0.82 scene units, and the
carcass is sized around six of them. Those numbers are repeated in
src/components/shelf/Box.tsx and ShelfUnit.tsx; they have to agree, so they are
named here rather than left as literals.
"""

import argparse
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------
# dimensions, matching src/components/shelf/
# --------------------------------------------------------------------------

BOX = {"thickness": 0.2, "height": 1.0, "width": 0.82}
SLOT = BOX["thickness"] + 0.055
SLOTS = 6
SECTIONS = 2

SHELF = {
    "inner_width": SLOTS * SLOT,
    "opening_height": BOX["height"] + 0.16,
    "depth": BOX["width"] + 0.1,
    "plank": 0.045,
    "side": 0.055,
    "back": 0.03,
    "plinth": 0.07,
}

UNIT_HEIGHT = SECTIONS * (SHELF["opening_height"] + SHELF["plank"]) + SHELF["plank"]
OUTER_WIDTH = SHELF["inner_width"] + SHELF["side"] * 2
FLOOR_Y = -UNIT_HEIGHT / 2 - SHELF["plinth"]

# A planed arris, not a rounded one: small, and sharp enough to catch a line of
# light along every edge.
BEVEL_WIDTH = 0.0035

# --------------------------------------------------------------------------
# the room, per docs/adr/0004
# --------------------------------------------------------------------------

# The depth is set by the camera, not by taste. src/components/shelf/Shelf.tsx
# puts the camera 4.4 units back at a 42 degree lens, and Scene.tsx pulls it
# back up to 2.2x on a phone held upright: 9.68 units. The room has to be deep
# enough that the camera's cone still passes through the open fourth side at
# that distance, or a phone sees the floor and ceiling end in mid-air. At 7.4
# deep the cone is 0.99 x 2.15 where it crosses the opening, inside 5.6 x 3.0.
#
# Shrinking the room means pulling back less and widening the lens instead,
# which belongs with the camera views rather than here.
ROOM = {
    "width": 5.6,
    "depth": 7.4,
    "height": 3.0,
    "back": -0.52,  # the wall sits just clear of the carcass's back panel
}

# Chamfered softwood, the depth real skirting is. Its job is to be the reason
# the floor stops, which is what docs/adr/0004 closed the room for.
SKIRTING = {"height": 0.105, "depth": 0.020}

# A floor lamp, camera-right of the carcass. Daylight did not need one; an
# evening does, and not as dressing: with only a dusk window the room goes
# nearly black and the Shelf disappears. It stands opposite the window so the
# warm lamp and the cool sky bracket the carcass from either side, which is
# most of why an evening interior reads as one.
LAMP = {
    "x": 1.62,
    "z": 0.72,  # a little in front of the carcass, so it rakes the Covers
    "height": 1.30,  # floor to the underside of the shade
    "shade_r": 0.17,
    "shade_h": 0.24,
    "base_r": 0.15,
}

# In the back wall, left of the carcass, because that is the only wall the
# default camera sees all of: at 4.4 units back the left wall is in frame for
# a 0.8 unit strip and no window would fit in it. Sized and placed so its
# right jamb clears the carcass by 0.18.
WINDOW = {
    "x": -1.70,
    "width": 1.40,
    "sill": 0.82,
    "height": 1.58,
    "reveal": 0.14,  # how far the opening is recessed, so it has jambs
    "bars": 2,  # glazing bars, giving three tall panes
}


# --------------------------------------------------------------------------
# scene helpers
# --------------------------------------------------------------------------


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def board(name, size, location, material, bevel=True, vertical=False):
    """
    A rectangular board. Blender is Z-up; the site's Y-up is converted here.

    Every board is modelled with its length along local X and then rotated into
    place, never re-proportioned. The material keys off object coordinates: it
    stretches the grain along local X and treats faces pointing along local X
    as end grain. If an upright were simply built tall, its length would lie on
    local Y and both of those would be wrong on it.

    The rotation is deliberately not applied, because applying it would turn
    local space with the object and undo exactly what it is for.
    """
    # site (x, y, z) -> blender (x, -z, y). The depth axis flips: three.js looks
    # down -Z, Blender's camera looks down +Y, so "behind the shelf" inverts.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(location[0], -location[2], location[1]))
    obj = bpy.context.active_object
    obj.name = name
    # site (x, y, z) -> blender (x, z, y). primitive_cube_add(size=1) is already
    # a unit cube, so the scale IS the edge length, not half of it.
    if vertical:
        # length -> local X, depth -> local Y, thickness -> local Z, then stood up
        obj.scale = (size[1], size[2], size[0])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.rotation_euler = (0, math.radians(90), 0)
    else:
        obj.scale = (size[0], size[2], size[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    if bevel:
        mod = obj.modifiers.new(name="Bevel", type="BEVEL")
        mod.width = BEVEL_WIDTH
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        # harden_normals needs custom split normals to behave and speckles
        # at the corners without them.
        mod.harden_normals = False

    # Smooth only across the bevel, keeping the faces flat. (use_auto_smooth was
    # removed in 4.1; this operator replaces it.)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))

    obj.data.materials.append(material)
    return obj


def quad(name, corners, material, facing):
    """
    One flat, single-sided face from four site-space corners.

    The room is built from these rather than from board(): a wall is seen from
    one side only, so giving it six faces spends atlas on five that are never
    drawn. Single-sided also means the room simply is not there from outside,
    which is what lets the fourth side stay open.

    `facing` is the site-space direction the face should look. The winding is
    corrected to match it, so corners can be listed in whatever order reads
    clearly at the call site.
    """
    pts = [Vector(c) for c in corners]
    # Newell is overkill for a quad but costs nothing and does not care which
    # three corners happen to be collinear.
    normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
    if normal.dot(Vector(facing)) < 0:
        pts.reverse()

    mesh = bpy.data.meshes.new(name)
    # site (x, y, z) -> blender (x, -z, y), the same conversion board() makes.
    mesh.from_pydata([(p.x, -p.z, p.y) for p in pts], [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def quad_fan(name, faces, material, facing):
    """
    Several coplanar quads as ONE mesh, welded wherever they share a corner.

    This exists for the back wall. Four separate quads around a window opening
    bake as four islands with four margins and three joins that do not line up
    to the texel; welded into one mesh they unwrap as one connected island and
    the joins stop existing. Vertices are merged by position, so the caller
    only has to list each face's corners and get the shared ones exactly equal.
    """
    index = {}
    verts = []
    polys = []
    for corners in faces:
        pts = [Vector(c) for c in corners]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if normal.dot(Vector(facing)) < 0:
            pts.reverse()
        poly = []
        for pt in pts:
            key = (round(pt.x, 6), round(pt.y, 6), round(pt.z, 6))
            if key not in index:
                index[key] = len(verts)
                verts.append((pt.x, -pt.z, pt.y))  # site -> blender
            poly.append(index[key])
        polys.append(tuple(poly))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], polys)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def cylinder(name, radius, height, centre, material, caps=True, segments=40):
    """A vertical cylinder. Blender is Z-up, so upright needs no rotation."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=height,
        vertices=segments,
        location=(centre[0], -centre[2], centre[1]),
        end_fill_type="NGON" if caps else "NOTHING",
    )
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    obj.data.materials.append(material)
    return obj


# --------------------------------------------------------------------------
# materials
# --------------------------------------------------------------------------


def oak_material(name="Oak", base=(0.148, 0.082, 0.036), light=(0.400, 0.262, 0.130), scale=1.0):
    """
    Procedural oak.

    Everything is combined as a single greyscale figure and run through one
    colour ramp at the end. Mixing colours node-by-node is where this kind of
    material usually turns to mud, and float mixing avoids the ambiguous socket
    names on ShaderNodeMix as a bonus.

    Four things make it read as oak rather than as brown:

    - grain stretched hard along the board's length
    - broad tonal drift, so a board is not even end to end
    - ray fleck: the pale irregular flecks across the grain that are the
      giveaway for oak specifically
    - end grain on the board ends, blended in by face normal, because a board
      end showing face grain is wrong in a way the eye catches without naming
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    coord = nt.nodes.new("ShaderNodeTexCoord")

    # Each board is cut from a different part of the log: offset every object's
    # texture by its own random value so no two are identical.
    info = nt.nodes.new("ShaderNodeObjectInfo")
    jitter = nt.nodes.new("ShaderNodeMath")
    jitter.operation = "MULTIPLY"
    jitter.inputs[1].default_value = 23.0
    nt.links.new(info.outputs["Random"], jitter.inputs[0])
    offset = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(jitter.outputs["Value"], offset.inputs["X"])
    nt.links.new(jitter.outputs["Value"], offset.inputs["Y"])

    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale * 0.30, scale * 6.0, scale * 6.0)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(offset.outputs["Vector"], mapping.inputs["Location"])

    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 5.5
    grain.inputs["Detail"].default_value = 8.0
    grain.inputs["Roughness"].default_value = 0.62
    nt.links.new(mapping.outputs["Vector"], grain.inputs["Vector"])

    broad = nt.nodes.new("ShaderNodeTexNoise")
    broad.inputs["Scale"].default_value = 1.1
    broad.inputs["Detail"].default_value = 2.0
    nt.links.new(mapping.outputs["Vector"], broad.inputs["Vector"])

    figure = nt.nodes.new("ShaderNodeMix")
    figure.data_type = "FLOAT"
    figure.inputs["Factor"].default_value = 0.35
    nt.links.new(grain.outputs["Fac"], figure.inputs["A"])
    nt.links.new(broad.outputs["Fac"], figure.inputs["B"])

    # Ray fleck: short pale slashes lying across the grain, so sampled on a
    # mapping stretched the other way.
    fleck_map = nt.nodes.new("ShaderNodeMapping")
    fleck_map.inputs["Scale"].default_value = (scale * 5.0, scale * 0.5, scale * 2.5)
    nt.links.new(coord.outputs["Object"], fleck_map.inputs["Vector"])
    nt.links.new(offset.outputs["Vector"], fleck_map.inputs["Location"])

    fleck = nt.nodes.new("ShaderNodeTexNoise")
    fleck.inputs["Scale"].default_value = 6.5
    fleck.inputs["Detail"].default_value = 2.0
    nt.links.new(fleck_map.outputs["Vector"], fleck.inputs["Vector"])

    fleck_cut = nt.nodes.new("ShaderNodeValToRGB")
    fleck_cut.color_ramp.elements[0].position = 0.56
    fleck_cut.color_ramp.elements[0].color = (0, 0, 0, 1)
    fleck_cut.color_ramp.elements[1].position = 0.80
    fleck_cut.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(fleck.outputs["Fac"], fleck_cut.inputs["Fac"])

    fleck_amount = nt.nodes.new("ShaderNodeMath")
    fleck_amount.operation = "MULTIPLY"
    fleck_amount.inputs[1].default_value = 0.16
    nt.links.new(fleck_cut.outputs["Color"], fleck_amount.inputs[0])

    long_grain = nt.nodes.new("ShaderNodeMath")
    long_grain.operation = "ADD"
    nt.links.new(figure.outputs["Result"], long_grain.inputs[0])
    nt.links.new(fleck_amount.outputs["Value"], long_grain.inputs[1])

    # End grain: cut across the fibres, so a tight non-stretched texture.
    end_grain = nt.nodes.new("ShaderNodeTexNoise")
    end_grain.inputs["Scale"].default_value = 14.0
    end_grain.inputs["Detail"].default_value = 6.0
    nt.links.new(coord.outputs["Object"], end_grain.inputs["Vector"])

    # A face is an end if its normal points along the board's length (local X).
    # Geometry normals are world space, so convert first.
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    to_object = nt.nodes.new("ShaderNodeVectorTransform")
    to_object.vector_type = "NORMAL"
    to_object.convert_from = "WORLD"
    to_object.convert_to = "OBJECT"
    nt.links.new(geom.outputs["Normal"], to_object.inputs["Vector"])

    axis = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(to_object.outputs["Vector"], axis.inputs["Vector"])
    end_mask = nt.nodes.new("ShaderNodeMath")
    end_mask.operation = "ABSOLUTE"
    nt.links.new(axis.outputs["X"], end_mask.inputs[0])
    sharpen = nt.nodes.new("ShaderNodeMath")
    sharpen.operation = "POWER"
    sharpen.inputs[1].default_value = 4.0
    nt.links.new(end_mask.outputs["Value"], sharpen.inputs[0])

    surface = nt.nodes.new("ShaderNodeMix")
    surface.data_type = "FLOAT"
    nt.links.new(sharpen.outputs["Value"], surface.inputs["Factor"])
    nt.links.new(long_grain.outputs["Value"], surface.inputs["A"])
    nt.links.new(end_grain.outputs["Fac"], surface.inputs["B"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "B_SPLINE"
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (*base, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(surface.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # A satin finish: open pores sit duller than the planed surface between
    # them, which is what makes light travel across a board.
    pores = nt.nodes.new("ShaderNodeTexNoise")
    pores.inputs["Scale"].default_value = 90.0
    pores.inputs["Detail"].default_value = 2.0
    nt.links.new(mapping.outputs["Vector"], pores.inputs["Vector"])

    rough_mix = nt.nodes.new("ShaderNodeMix")
    rough_mix.data_type = "FLOAT"
    rough_mix.inputs["A"].default_value = 0.30
    rough_mix.inputs["B"].default_value = 0.58
    nt.links.new(pores.outputs["Fac"], rough_mix.inputs["Factor"])
    nt.links.new(rough_mix.outputs["Result"], bsdf.inputs["Roughness"])

    # Relief. This is the part that was impossible in the canvas version.
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.26
    bump.inputs["Distance"].default_value = 0.004
    nt.links.new(surface.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def flat_material(name, colour, roughness=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


# --------------------------------------------------------------------------
# the build
# --------------------------------------------------------------------------


def build_carcass():
    oak = oak_material("Oak")
    oak_dark = oak_material("OakDark", base=(0.105, 0.062, 0.032), light=(0.20, 0.125, 0.065))

    parts = []

    for i in range(SECTIONS + 1):
        y = UNIT_HEIGHT / 2 - SHELF["plank"] / 2 - i * (SHELF["opening_height"] + SHELF["plank"])
        parts.append(
            board(
                f"Shelf.{i}",
                (SHELF["inner_width"], SHELF["plank"], SHELF["depth"]),
                (0, y, 0),
                oak,
            )
        )

    for side in (-1, 1):
        parts.append(
            board(
                f"Upright.{'L' if side < 0 else 'R'}",
                (SHELF["side"], UNIT_HEIGHT, SHELF["depth"]),
                (side * (SHELF["inner_width"] / 2 + SHELF["side"] / 2), 0, 0),
                oak,
                vertical=True,
            )
        )

    parts.append(
        board(
            "BackPanel",
            (OUTER_WIDTH, UNIT_HEIGHT, SHELF["back"]),
            (0, 0, -SHELF["depth"] / 2 - SHELF["back"] / 2),
            oak_dark,
            bevel=False,
        )
    )

    parts.append(
        board(
            "Plinth",
            (OUTER_WIDTH - 0.03, SHELF["plinth"], SHELF["depth"] - 0.05),
            (0, -UNIT_HEIGHT / 2 - SHELF["plinth"] / 2, -0.012),
            oak_dark,
        )
    )

    return parts


def emission_material(name, colour, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*colour, 1)
    emit.inputs["Strength"].default_value = strength
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def sky_material(name, low, high, strength):
    """
    Emission with a vertical gradient, for what is behind the glass.

    The daylit window failed mostly because it was one flat value: a surface
    with no variation across it reads as a lit panel, not as a distance. A
    gradient is the cheapest thing that says there is a sky out there, and at
    dusk it is also the true shape of one — deeper overhead, warmer down
    towards where the sun went.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = strength

    # Object coordinates rather than UVs: the glass is unwrapped with
    # everything else into a shared atlas, so its UVs are wherever the packer
    # put them. Its own Z is the one axis that still means "up".
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    # The glass spans the window's height about its own origin; map that to 0-1.
    scale = nt.nodes.new("ShaderNodeMapRange")
    scale.inputs["From Min"].default_value = FLOOR_Y + WINDOW["sill"]
    scale.inputs["From Max"].default_value = FLOOR_Y + WINDOW["sill"] + WINDOW["height"]

    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*high, 1)

    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], scale.inputs["Value"])
    nt.links.new(scale.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def room_bounds():
    """The six numbers everything in the room is placed against."""
    return {
        "x0": -ROOM["width"] / 2,
        "x1": ROOM["width"] / 2,
        "y0": FLOOR_Y,
        "y1": FLOOR_Y + ROOM["height"],
        "z0": ROOM["back"],
        "z1": ROOM["back"] + ROOM["depth"],
    }


def window_bounds():
    w = WINDOW["width"] / 2
    return {
        "x0": WINDOW["x"] - w,
        "x1": WINDOW["x"] + w,
        "y0": FLOOR_Y + WINDOW["sill"],
        "y1": FLOOR_Y + WINDOW["sill"] + WINDOW["height"],
        "z": ROOM["back"] - WINDOW["reveal"],  # the glass plane, set back
    }


def build_window(wall_mat, trim_mat):
    """
    The opening, its reveal and its glass.

    docs/adr/0004 calls the window the single object that does most for the
    room, on the grounds that the daylight in the scene was otherwise
    unexplained. So it is a real opening with jambs and a sill rather than a
    bright rectangle painted on a wall: the recess is what makes it read as a
    hole in something thick.
    """
    r = room_bounds()
    w = window_bounds()
    back, reveal = ROOM["back"], WINDOW["reveal"]
    parts = []

    # The back wall: one mesh, four faces, welded at the edges around the
    # opening.
    #
    # It was four separate objects, which is simpler and was wrong. Separate
    # objects get separate UV islands, each with its own bake margin, and the
    # three joins between them never line up to the texel — so the wall
    # carried faint vertical seams. Daylight blew that wall out and hid them;
    # evening lights it with a soft gradient and shows every one. Welded, the
    # four faces unwrap as a single connected island and there is nothing to
    # misalign.
    parts.append(
        quad_fan(
            "Room.Wall.Back",
            [
                # bottom strip, full width, below the opening
                [(r["x0"], r["y0"], back), (r["x1"], r["y0"], back),
                 (r["x1"], w["y0"], back), (r["x0"], w["y0"], back)],
                # left pier, between sill and head
                [(r["x0"], w["y0"], back), (w["x0"], w["y0"], back),
                 (w["x0"], w["y1"], back), (r["x0"], w["y1"], back)],
                # right pier
                [(w["x1"], w["y0"], back), (r["x1"], w["y0"], back),
                 (r["x1"], w["y1"], back), (w["x1"], w["y1"], back)],
                # top strip, full width, above the opening
                [(r["x0"], w["y1"], back), (r["x1"], w["y1"], back),
                 (r["x1"], r["y1"], back), (r["x0"], r["y1"], back)],
            ],
            wall_mat,
            (0, 0, 1),
        )
    )

    # The reveal: the four faces of the wall's own thickness, seen because the
    # glass is set back from the room side of the wall.
    # No face along the bottom of the opening: the sill board below is already
    # that surface, and a quad laid on top of it is coincident geometry. It
    # baked as a hard black bar under the glass, which is what coincident
    # surfaces look like when the darker one wins.
    jambs = (
        ("Head", [(w["x0"], w["y1"], back), (w["x1"], w["y1"], back),
                  (w["x1"], w["y1"], w["z"]), (w["x0"], w["y1"], w["z"])], (0, -1, 0)),
        ("Jamb.L", [(w["x0"], w["y0"], back), (w["x0"], w["y1"], back),
                    (w["x0"], w["y1"], w["z"]), (w["x0"], w["y0"], w["z"])], (1, 0, 0)),
        ("Jamb.R", [(w["x1"], w["y0"], back), (w["x1"], w["y1"], back),
                    (w["x1"], w["y1"], w["z"]), (w["x1"], w["y0"], w["z"])], (-1, 0, 0)),
    )
    for name, pts, facing in jambs:
        parts.append(quad(f"Room.Reveal.{name}", pts, trim_mat, facing))

    # The glass. Emissive, and set not to cast shadow, so the light coming
    # through is an area light outside while this is only what the eye sees.
    # One surface doing both jobs means choosing between a window that looks
    # right and a window that lights right.
    pad = 0.012  # tucked under the reveal, so no seam shows at the corners
    glass = quad(
        "Room.Glass",
        [
            (w["x0"] - pad, w["y0"] - pad, w["z"]),
            (w["x1"] + pad, w["y0"] - pad, w["z"]),
            (w["x1"] + pad, w["y1"] + pad, w["z"]),
            (w["x0"] - pad, w["y1"] + pad, w["z"]),
        ],
        # Dusk: deep blue overhead falling to a warm band at the bottom, where
        # the sun has just gone. Bright enough to be the brightest thing in
        # frame and no brighter — the atlas clips at 1.0 with nothing to roll
        # it back, and a clipped window is the flat panel this replaced.
        sky_material("Dusk", low=(0.52, 0.34, 0.26), high=(0.055, 0.085, 0.18), strength=1.0),
        (0, 0, 1),
    )
    # Seen by the camera and by nothing else. Without this the glass is a
    # second light source sitting in front of the first, and the room washes
    # out: the area light outside does the lighting, this only looks bright.
    glass.visible_shadow = False
    glass.visible_diffuse = False
    glass.visible_glossy = False
    glass.visible_transmission = False
    parts.append(glass)

    # Glazing bars, standing in the opening. Three tall panes rather than one
    # sheet: the bars are what give the bright rectangle a scale.
    for i in range(1, WINDOW["bars"] + 1):
        x = w["x0"] + (w["x1"] - w["x0"]) * i / (WINDOW["bars"] + 1)
        parts.append(
            board(
                f"Room.Bar.{i}",
                (0.026, w["y1"] - w["y0"], 0.028),
                (x, (w["y0"] + w["y1"]) / 2, w["z"] + 0.02),
                trim_mat,
            )
        )

    # A sill proud of the wall, which is the detail that stops the opening
    # reading as a cut-out.
    parts.append(
        board(
            "Room.Sill",
            (w["x1"] - w["x0"] + 0.10, 0.028, reveal + 0.035),
            (WINDOW["x"], w["y0"] - 0.014, back - reveal / 2 + 0.018),
            trim_mat,
        )
    )

    return parts


def build_lamp():
    """
    The floor lamp. A visible one, because an unexplained pool of light is the
    exact fault the window was put in to fix, and at this hour the lamp is
    doing most of the lighting.

    The shade is emissive and otherwise ordinary: it is opaque, so it blocks
    the bulb sideways and throws the cone up and down that says "shade", and
    it glows on camera because a linen shade with a bulb in it does. This is
    the opposite arrangement to the glass, which is emissive but invisible to
    every ray except the camera's — there the light comes from a lamp behind
    it, here the light comes from inside.
    """
    metal = flat_material("LampMetal", (0.052, 0.047, 0.043), roughness=0.38)
    shade = emission_material("LampShade", (1.0, 0.78, 0.52), 1.4)
    x, z, h = LAMP["x"], LAMP["z"], LAMP["height"]
    return [
        cylinder("Room.Lamp.Base", LAMP["base_r"], 0.022, (x, FLOOR_Y + 0.011, z), metal),
        cylinder("Room.Lamp.Stem", 0.011, h, (x, FLOOR_Y + h / 2, z), metal),
        cylinder(
            "Room.Lamp.Shade",
            LAMP["shade_r"],
            LAMP["shade_h"],
            (x, FLOOR_Y + h + LAMP["shade_h"] / 2, z),
            shade,
            caps=False,  # open top and bottom, so the light goes both ways
        ),
    ]


def build_room():
    """
    A closed room: floor, ceiling, three walls, a skirting board, a window and
    a lamp.

    docs/adr/0004 replaced the old floor-and-wall backdrop, whose far edges
    faded to the page colour. The fade worked only because the camera looked
    one way, and it was a per-view trick waiting to happen once the camera
    started visiting places. Now the floor stops because the room stops.

    The fourth side, towards the camera, stays open. Every surface is a
    single-sided quad, so from outside the room is not there at all and the
    open side costs nothing to leave open.
    """
    # Darker than the open backdrop was. A closed room bounces: four more
    # surfaces throw light back at each other, and an albedo that read as warm
    # oak floor in the open goes to paper white in here.
    floor_mat = flat_material("Floor", (0.17, 0.12, 0.08), roughness=0.70)
    wall_mat = flat_material("Wall", (0.70, 0.67, 0.62), roughness=0.95)
    ceil_mat = flat_material("Ceiling", (0.80, 0.79, 0.76), roughness=0.95)
    trim_mat = flat_material("Trim", (0.86, 0.85, 0.81), roughness=0.55)

    r = room_bounds()
    parts = [
        quad(
            "Room.Floor",
            [(r["x0"], r["y0"], r["z0"]), (r["x1"], r["y0"], r["z0"]),
             (r["x1"], r["y0"], r["z1"]), (r["x0"], r["y0"], r["z1"])],
            floor_mat,
            (0, 1, 0),
        ),
        # A ceiling is not in docs/adr/0004's list, and is here because the
        # camera needs it: on a phone it pulls back far enough to see 3.7 units
        # above itself, which is over the top of any wall a room would have.
        # It also catches the window's light, which is the best of it.
        quad(
            "Room.Ceiling",
            [(r["x0"], r["y1"], r["z0"]), (r["x1"], r["y1"], r["z0"]),
             (r["x1"], r["y1"], r["z1"]), (r["x0"], r["y1"], r["z1"])],
            ceil_mat,
            (0, -1, 0),
        ),
        quad(
            "Room.Wall.L",
            [(r["x0"], r["y0"], r["z0"]), (r["x0"], r["y0"], r["z1"]),
             (r["x0"], r["y1"], r["z1"]), (r["x0"], r["y1"], r["z0"])],
            wall_mat,
            (1, 0, 0),
        ),
        quad(
            "Room.Wall.R",
            [(r["x1"], r["y0"], r["z0"]), (r["x1"], r["y0"], r["z1"]),
             (r["x1"], r["y1"], r["z1"]), (r["x1"], r["y1"], r["z0"])],
            wall_mat,
            (-1, 0, 0),
        ),
    ]

    parts += build_window(wall_mat, trim_mat)
    parts += build_lamp()

    # Skirting. Chamfered by board()'s bevel, which is the whole reason it is a
    # board rather than another quad: the chamfer catches a line of light along
    # the base of every wall, and that line is what the eye reads as a corner.
    h, d = SKIRTING["height"], SKIRTING["depth"]
    y = r["y0"] + h / 2
    parts.append(
        board("Room.Skirting.B", (ROOM["width"], h, d), (0, y, r["z0"] + d / 2), trim_mat)
    )
    for side, x in (("L", r["x0"]), ("R", r["x1"])):
        parts.append(
            board(
                f"Room.Skirting.{side}",
                (d, h, ROOM["depth"]),
                (x - math.copysign(d / 2, x), y, (r["z0"] + r["z1"]) / 2),
                trim_mat,
            )
        )

    return parts


def setup_evening():
    """
    Dusk through the window, a bulb in the lamp, and almost nothing else.

    Three sources where daylight had three, but the balance is inverted. The
    window was the key and is now the cool fill, dim and blue; the lamp is the
    key and is warm; the world barely registers, because at this hour the only
    thing outside the open fourth side is more evening.

    That inversion is the whole point of going to evening. Daylight lit every
    surface at once and flattened the room; two small sources of opposite
    colour, well apart, leave most of it in shadow and model what is left.
    """
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.07, 0.11, 0.24, 1)
    # Nearly nothing. The fourth side is a hole the full width of the room, so
    # anything here is flat frontal fill — and that is what washed the daylit
    # room out. At this hour it has no excuse at all.
    bg.inputs["Strength"].default_value = 0.035

    w = window_bounds()
    # A few centimetres behind the glass, for the same two reasons as before:
    # further out and every shadow ray has to thread the opening, flush with
    # the glass and nothing lights the reveal.
    bpy.ops.object.light_add(
        type="AREA",
        location=(WINDOW["x"], -(w["z"] - 0.06), (w["y0"] + w["y1"]) / 2),
    )
    sky = bpy.context.active_object
    sky.name = "Dusk"
    sky.data.shape = "RECTANGLE"
    sky.data.size = WINDOW["width"]
    sky.data.size_y = WINDOW["height"]
    sky.data.energy = 42
    sky.data.color = (0.34, 0.50, 1.0)
    direction = Vector((0, -1.0, -0.22)).normalized()
    sky.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    # The bulb, inside the shade. A point light rather than an area one: the
    # shade is what shapes this, and it already does, being opaque.
    bpy.ops.object.light_add(
        type="POINT",
        location=(LAMP["x"], -LAMP["z"], FLOOR_Y + LAMP["height"] + LAMP["shade_h"] / 2),
    )
    bulb = bpy.context.active_object
    bulb.name = "Bulb"
    bulb.data.energy = 72
    bulb.data.color = (1.0, 0.76, 0.50)
    bulb.data.shadow_soft_size = 0.05

    # A very low, very warm lift off the floor, so the undersides of the
    # shelves are dark rather than dead. Smaller than daylight's by a long way.
    bpy.ops.object.light_add(type="AREA", location=(0.9, -1.1, FLOOR_Y + 0.3))
    bounce = bpy.context.active_object
    bounce.name = "Bounce"
    bounce.data.size = 2.4
    bounce.data.energy = 5
    bounce.data.color = (1.0, 0.82, 0.62)
    bounce.rotation_euler = (math.radians(-70), 0, math.radians(20))


# Blender location, aim, and either a lens in mm or a vertical field of view.
SHELF_VIEWS = {
    # A three-quarter view for looking at the model itself.
    "three-quarter": ((1.15, -5.3, 0.55), (0, 0, -0.12), {"lens": 50}),
    # What the site's own camera sees: src/components/shelf/Shelf.tsx puts it
    # at site (0, 0, 4.4) with a 42 degree vertical field of view. Checking the
    # room against this is the only way to know whether a wall is in frame.
    "site": ((0.0, -4.4, 0.0), (0, 0, 0), {"fov": 42}),
    # The same camera at the pull-back Scene.tsx uses on a phone held upright,
    # 2.2x, which puts it outside the open fourth side looking in. This is the
    # view ROOM["depth"] was chosen for; render it narrow, 420x900 or so.
    "phone": ((0.0, -9.68, 0.0), (0, 0, 0), {"fov": 42}),
}


def setup_camera(view="three-quarter"):
    location, target, lens = SHELF_VIEWS[view]
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = "Camera"
    if "fov" in lens:
        # The site states its field of view vertically; Blender measures across
        # whichever sensor dimension is larger unless it is told otherwise.
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(lens["fov"])
    else:
        cam.data.lens = lens["lens"]
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def setup_render(width=1000, height=760, samples=160):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"


def standard_view():
    """
    Turn the view transform off for a render of the baked result.

    A bake writes the raw combined values and ignores the view transform, so
    the atlas is what the browser receives: it draws those values straight,
    with no tone mapping anywhere. Rendering the baked scene through AgX
    therefore shows something the site will never display — and it hides the
    one failure that matters, which is clipping, because AgX rolls values over
    1.0 gently back into range while the atlas has already lost them.

    The window was invisible in the baked room for exactly this reason: the
    wall around it had clipped to flat white and AgX was concealing it.
    """
    bpy.context.scene.view_settings.view_transform = "Standard"
    bpy.context.scene.view_settings.look = "None"


def select(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def join_carcass(parts):
    """
    One object for export. Done AFTER baking, never before: join applies each
    object's transform into the merged mesh, and the oak material reads object
    coordinates. Joining first collapses the uprights' local space into the
    carcass's, and their grain and end-grain masks go wrong again.
    """
    select(parts)
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = "Carcass"
    return joined


def flat_normal(obj):
    """The shared normal of a flat object, or None if its faces disagree."""
    polys = obj.data.polygons
    if not polys:
        return None
    n = polys[0].normal.copy()
    if any(p.normal.dot(n) < 0.999 for p in polys):
        return None
    return n


def planar_uv(obj, normal):
    """
    Map a flat object straight onto the plane it faces, in world units.

    World units rather than 0-1 so every island in the room shares one scale:
    a 7.4 unit wall gets 7.4 units of UV and a 0.14 unit reveal gets 0.14, so
    texel density comes out even without anything having to rescale them
    afterwards.

    This exists because the packer kept cutting the back wall. Its four faces
    are welded at twelve shared vertices, and smart_project, cube_project and a
    hand-written contiguous map all ended up as four islands once
    pack_islands had run — so the shared edges landed on four different texel
    grids, and every join baked as a thin dark line across the wall. Daylight
    blew that wall out and hid it; evening lights it with a soft gradient and
    shows it. It measured 23 levels deep at 2048 and did not shrink with
    resolution, because it is a mismatch, not a sampling rate.
    """
    axes = sorted(range(3), key=lambda i: abs(normal[i]))[:2]
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (co[axes[0]], co[axes[1]])


def uv_area(obj):
    """The area an object's islands cover in UV space, by the shoelace rule."""
    uv = obj.data.uv_layers.active
    total = 0.0
    for poly in obj.data.polygons:
        pts = [uv.data[li].uv for li in poly.loop_indices]
        acc = 0.0
        for i, (x1, y1) in enumerate(pts):
            x2, y2 = pts[(i + 1) % len(pts)]
            acc += x1 * y2 - x2 * y1
        total += abs(acc) / 2
    return total


def to_world_scale(obj):
    """
    Rescale an object's UVs so one UV unit is one world unit, matching what
    planar_uv() writes for the flat panels.

    Needed because smart_project normalises whatever it is given into 0-1, and
    with several objects in one edit it normalises them *together* — so an
    object's island size says nothing about its real size. Multiplying by the
    object's own largest dimension looked like it would fix that and does not:
    it left the lamp's shade at a tenth of its proper size, a dozen texels
    across, and the shade baked as a grey smudge. The ratio of real area to UV
    area is the only thing that actually knows the scale.
    """
    area = sum(poly.area for poly in obj.data.polygons)
    mapped = uv_area(obj)
    if mapped <= 0 or area <= 0:
        return
    scale = math.sqrt(area / mapped)
    uv = obj.data.uv_layers.active
    for d in uv.data:
        d.uv = (d.uv[0] * scale, d.uv[1] * scale)


def island_bounds(obj):
    uv = obj.data.uv_layers.active
    us = [d.uv[0] for d in uv.data]
    vs = [d.uv[1] for d in uv.data]
    return min(us), min(vs), max(us) - min(us), max(vs) - min(vs)


def shelf_pack_uvs(parts, gap=0.03):
    """
    Lay every part's island out by hand, in place of bpy.ops.uv.pack_islands.

    The operator is the reason the back wall seamed: it took a mesh whose UVs
    were contiguous across its internal edges and handed back four islands on
    four texel grids. Nothing here splits anything — each object's island is
    translated as one piece into a cell, so whatever was contiguous stays
    contiguous.

    A shelf packer: tallest first, filling rows left to right, growing the
    square until everything fits. Not the tightest packing there is, but the
    room is two dozen rectangles and the atlas is not the constraint.
    `gap` is a fraction of the finished atlas, not a distance, because the
    thing it has to clear is the bake margin — and that is a fraction of the
    atlas too (bake_combined uses 1.2%). At 3% the islands sit about 61 texels
    apart at 2048 against a 24 texel margin, so nothing bleeds. Spending a
    fifth of the atlas on gaps is the cheap side of that trade: the bands it
    prevents are not subtle.
    """
    items = [[obj, *island_bounds(obj)] for obj in parts]
    items.sort(key=lambda i: -i[4])  # tallest first

    area = sum(w * h for _, _, _, w, h in items)
    side = math.sqrt(area) * 1.2
    while True:
        padding = gap * side
        placed = []
        x = y = row_h = 0.0
        for obj, u0, v0, w, h in items:
            if x + w + padding > side and x > 0:
                x = 0.0
                y += row_h + padding
                row_h = 0.0
            if y + h + padding > side:
                placed = None
                break
            placed.append((obj, u0, v0, x + padding / 2, y + padding / 2))
            x += w + padding
            row_h = max(row_h, h)
        if placed is not None:
            break
        side *= 1.1

    for obj, u0, v0, px, py in placed:
        uv = obj.data.uv_layers.active
        for d in uv.data:
            d.uv = ((d.uv[0] - u0 + px) / side, (d.uv[1] - v0 + py) / side)
    print(f"[shelf] packed {len(placed)} islands into {side:.2f} units of atlas")


def unwrap_all(parts, margin=0.004, planar=False):
    """
    Unwrap every part into one shared UV space, ready for a single atlas.

    `planar` is for the room, and does the whole job by hand: a planar map per
    flat panel, then shelf_pack_uvs. Its surfaces are flat axis-aligned
    panels, which map perfectly and pack simply, and the operators were
    splitting them — see planar_uv(). Anything in the room that is not flat,
    which is only the lamp's cylinders, still gets smart_project first; the
    shade is one flat emissive colour and the stem is 11mm of dark metal, so
    neither minds a crude projection.

    The carcass is boards at many orientations and wants the operators for all
    of it.
    """
    if not planar:
        select(parts)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
        # smart_project packs each object into 0-1 on its own, so across
        # several objects the islands land on top of each other and bake over
        # one another. Repacking everything together is what makes a shared
        # atlas actually shared. average_islands_scale first, so a 45mm board
        # edge does not get the same texel budget as a whole shelf face.
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(margin=0.02, rotate=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        return

    curved = []
    for obj in parts:
        normal = flat_normal(obj)
        if normal is None:
            curved.append(obj)
        else:
            if not obj.data.uv_layers:
                obj.data.uv_layers.new(name="UVMap")
            planar_uv(obj, normal)

    if curved:
        select(curved)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
        bpy.ops.object.mode_set(mode="OBJECT")
        # smart_project leaves them in a shared 0-1; put them on the same
        # world-unit scale as the flat panels so the packer treats everything
        # alike and the texel density comes out even.
        for obj in curved:
            to_world_scale(obj)

    shelf_pack_uvs(parts)


def bake_combined(parts, path, size=2048, samples=64, margin=None, name="ShelfBake"):
    """
    Bake the lit result into one texture.

    COMBINED means the image carries direct light, bounced light and the
    occlusion in the corners. The browser then draws it unlit and gets the
    Cycles result for the cost of one texture lookup. This is the whole bet in
    ADR 0003, and the reason the Shelf can look rendered without being rendered.
    """
    # The margin has to stay inside the gap pack_islands left, or each island
    # bleeds into its neighbours and the atlas grows hard rectangular bands.
    # A fixed pixel count cannot do that at two different atlas sizes: 24px is
    # 1.2% of 2048 and a safe fit under the 2% packing margin, but 3.1% of 768
    # and well over it. Previews baked small were showing seams the real bake
    # does not have, which makes the fast loop worse than useless.
    if margin is None:
        margin = max(4, round(size * 0.012))

    image = bpy.data.images.new(name, width=size, height=size)

    # Every material in play needs the target image as its active node, or the
    # bake has nowhere to land for the faces using it. Materials are shared
    # between boards, so track which ones are already done.
    seen = set()
    for obj in parts:
        for slot in obj.material_slots:
            mat = slot.material
            if mat.name in seen:
                continue
            seen.add(mat.name)
            nt = mat.node_tree
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = image
            tex.select = True
            nt.nodes.active = tex

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.bake.margin = margin
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.use_clear = True

    # All boards bake at once into the one shared image, each still in its own
    # local space.
    select(parts)

    print(f"[shelf] baking {len(parts)} boards to {size}x{size} at {samples} samples ...")
    bpy.ops.object.bake(type="COMBINED")

    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    print(f"[shelf] wrote {path}")
    return image


def show_baked(obj, image):
    """
    Swap the object to an unlit material showing only the baked image, which is
    what the browser will draw. Rendering this is the honest test: if it does
    not match the lit render, the bake has not captured the look.

    Only honest with the view transform set to Standard — see standard_view().
    """
    mat = bpy.data.materials.new("Baked")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])

    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export_glb(objs, path, materials="NONE"):
    """
    Export geometry and UVs only. The baked atlas is loaded separately by the
    site and applied as an unlit material there, which keeps it a WebP (84KB)
    rather than whatever the glTF exporter would embed (PNG, 2MB).

    materials="EXPORT" is needed whenever the site has to address faces
    separately at runtime: glTF splits a mesh into one primitive per material
    slot, and stripping the materials merges them back into one. The Box needs
    that split so its Cover and Spine can be printed per-Project.

    No Draco: the carcass is seven boxes, so the geometry is already trivial,
    and drei's Draco loader reaches for a CDN-hosted decoder by default. Not
    worth an external dependency to save a few KB.

    Blender (x, y, z) exports as glTF (x, z, -y). Boards were placed with
    blender y = -site z, so the model arrives in the site's own coordinates
    with no correction needed at the other end.
    """
    select(objs)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials=materials,
        export_normals=True,
        export_texcoords=True,
        export_yup=True,
    )
    print(f"[shelf] wrote {path}")



# --------------------------------------------------------------------------
# printing a Book
# --------------------------------------------------------------------------

def face_materials_and_uvs(obj, cover_slot=None, inner_slot=None, outward=1, total_h=1.0):
    """
    Give a board's two large faces their own material slots and a clean 0-1 UV
    square, so the browser can drop a per-Project Cover straight onto one of
    them and a pastedown onto the other.

    Done before the bevel modifier is applied at export, while the mesh is
    still six flat faces. The bevel then interpolates these UVs, which insets
    the printed area by the chamfer. That is correct: printing on a bound board
    stops at the turn-in.

    Axes, after board()'s conversion: the large faces are the ones on local X,
    and `outward` says which way this board faces, +1 for the front board and
    -1 for the back. The Spine is not done here: it is a curved shell, and
    build_spine_shell wraps its UVs round the arc itself.
    """
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    uv_layer = bm.loops.layers.uv.verify()

    for face in bm.faces:
        n = face.normal
        if inner_slot is not None and n.x * outward < -0.9:
            # The face that looks in at the pages is a pastedown: paper, not
            # cloth and certainly not the Cover printed a second time.
            face.material_index = inner_slot
            continue
        if cover_slot is None or n.x * outward < 0.9:
            continue
        face.material_index = cover_slot
        # The Cover reads across local Y (the board's length) and up local Z.
        across, up = 1, 2
        flip = n.x < 0

        coords = [l.vert.co for l in face.loops]
        lo_a = min(c[across] for c in coords)
        hi_a = max(c[across] for c in coords)
        span_a = (hi_a - lo_a) or 1.0

        for loop in face.loops:
            co = loop.vert.co
            u = (co[across] - lo_a) / span_a
            v = (co[up] + total_h / 2) / total_h
            if flip:
                u = 1.0 - u
            # glTF samples with the origin at the top left.
            loop[uv_layer].uv = (u, 1.0 - v)

    bm.to_mesh(mesh)
    bm.free()



# --------------------------------------------------------------------------
# the Book
# --------------------------------------------------------------------------

# A clothbound hardback. The two things a slab cannot fake are the page block
# and the square: the boards stand proud of the pages at head, tail and
# fore-edge, and that overhang is what the eye reads as "book".
BOARD_T = 0.013
SQUARE = 0.024
SPINE_T = 0.016
BOOK_BEVEL = 0.0035

# A hardback's back is rounded, not flat, and that is most of why a flat strip
# reads as a brick with a label on it. Rounding gives the spine a highlight that
# travels as the camera moves, and it brings three more real features with it:
# the French groove where the board hinges, the hollow between the rounded back
# and the page block, and headbands closing the hollow at head and tail.
SPINE_ROUND = 0.030  # how far the back bulges out past the joints
FORE_ROUND = 0.022  # the fore-edge is concave by rather less, pages compress
GROOVE = 0.005  # the channel the board hinges in
HOLLOW = 0.009  # air between the back and the page block
HEADBAND_T = 0.009
HEADBAND_H = 0.008


def arc_geometry(half_x, y_flat, depth):
    """
    The circle through (-half_x, y_flat), (0, y_flat - depth), (half_x, y_flat).

    Returns its radius, its centre's y, and the half-angle it spans. Everything
    curved on the Book is described this way: a chord across the thickness and a
    depth it bulges by, which is how a binder would describe it.
    """
    r = (half_x**2 + depth**2) / (2 * depth)
    return r, y_flat - depth + r, math.asin(min(1.0, half_x / r))


def arc_points(radius, centre_y, span, n):
    """n+1 points along an arc, left to right, bulging towards -Y."""
    return [
        (radius * math.sin(th), centre_y - radius * math.cos(th))
        for th in (-span + 2 * span * i / n for i in range(n + 1))
    ]


def extrude_profile(name, profile, z0, z1, material):
    """
    Turn a closed 2D profile in the XY plane into a solid between two heights.

    Blender has no primitive for "curved shell", so the Book's spine, headbands
    and page block are all built this way: describe the cross-section once, then
    give it a height. Normals are recalculated rather than reasoned about, so
    the winding order of the profile does not matter.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    low = [bm.verts.new((x, y, z0)) for x, y in profile]
    high = [bm.verts.new((x, y, z1)) for x, y in profile]
    m = len(profile)
    sides = [
        bm.faces.new((low[i], low[(i + 1) % m], high[(i + 1) % m], high[i]))
        for i in range(m)
    ]
    bm.faces.new(low)
    bm.faces.new(high)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    obj.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(25))
    return obj, sides


def build_spine_shell(material, spine_material):
    """
    The rounded back: a curved shell of cloth arcing over the thickness of the
    Book, with the printed face given its own material slot and wrapped UVs so
    the browser can paint the title round the curve.
    """
    half = BOX["thickness"] / 2
    flat = -(BOX["width"] / 2 - SPINE_ROUND)  # Blender -Y is out of the Shelf
    r_out, centre_y, span = arc_geometry(half, flat, SPINE_ROUND)
    r_in = r_out - SPINE_T
    segments = 16

    outer = arc_points(r_out, centre_y, span, segments)
    inner = arc_points(r_in, centre_y, span, segments)
    profile = outer + list(reversed(inner))

    h = BOX["height"]
    obj, _ = extrude_profile("Book.Spine", profile, -h / 2, h / 2, material)
    obj.data.materials.append(spine_material)

    # The printed face is every face whose verts sit on the outer radius.
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()

    for face in bm.faces:
        on_outer = all(
            abs(Vector((v.co.x, v.co.y - centre_y)).length - r_out) < 1e-5
            for v in face.verts
        )
        if not on_outer or len(face.verts) != 4:
            continue
        face.material_index = 1
        for loop in face.loops:
            co = loop.vert.co
            # Across the printed face is the angle round the arc, so the title
            # is painted on a flat strip and wrapped, exactly like a real one.
            th = math.atan2(co.x, centre_y - co.y)
            u = (th + span) / (2 * span)
            v = (co.z + h / 2) / h
            # glTF samples with the origin at the top left.
            loop[uv_layer].uv = (u, 1.0 - v)

    bm.to_mesh(mesh)
    bm.free()

    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = BOOK_BEVEL
    mod.segments = 2
    mod.limit_method = "ANGLE"
    # Well above the angle between two arc segments, so the curve is left alone
    # and only the joints and the head and tail get an arris.
    mod.angle_limit = math.radians(40)
    mod.harden_normals = False
    return obj


def build_headbands(material):
    """
    The little striped bands at head and tail, closing the hollow between the
    rounded back and the page block. Two strips of thread, visible only from
    above, and the kind of detail the eye reads without naming.
    """
    half = BOX["thickness"] / 2 - BOARD_T
    flat = -(BOX["width"] / 2 - SPINE_ROUND)
    r_out, centre_y, _ = arc_geometry(BOX["thickness"] / 2, flat, SPINE_ROUND)
    r_out -= SPINE_T + 0.0005
    span = math.asin(min(1.0, half / r_out))

    outer = arc_points(r_out, centre_y, span, 12)
    inner = arc_points(r_out - HEADBAND_T, centre_y, span, 12)
    # Sits on the page block rather than beside it, which is where a binder
    # glues one: it is meant to be seen from above and nowhere else.
    profile = outer + list(reversed(inner))

    top = BOX["height"] / 2 - SQUARE - HEADBAND_H * 0.4
    bands = []
    for name, z0 in (("Book.HeadbandHead", top), ("Book.HeadbandTail", -top - HEADBAND_H)):
        obj, _ = extrude_profile(name, profile, z0, z0 + HEADBAND_H, material)
        bands.append(obj)
    return bands


def build_page_block(material):
    """
    The pages. Rounded at the back to follow the spine and hollow at the
    fore-edge, because backing a book bends the whole block: every leaf shifts a
    little against the next, so the two long edges curve the same way.
    """
    half = BOX["thickness"] / 2 - BOARD_T
    w = BOX["width"]

    back_apex = -(w / 2 - SPINE_T - HOLLOW)
    r_b, cy_b, span_b = arc_geometry(half, back_apex + SPINE_ROUND, SPINE_ROUND)
    fore_flat = w / 2 - SQUARE
    r_f, cy_f, span_f = arc_geometry(half, fore_flat, FORE_ROUND)

    profile = arc_points(r_b, cy_b, span_b, 14) + list(
        reversed(arc_points(r_f, cy_f, span_f, 14))
    )

    top = BOX["height"] / 2 - SQUARE
    obj, _ = extrude_profile("Book.Pages", profile, -top, top, material)
    return obj


def cloth_material(name="Cloth", colour=(0.085, 0.115, 0.105)):
    """Book cloth: matte, slightly textured, no shine at all."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.88

    weave = nt.nodes.new("ShaderNodeTexNoise")
    weave.inputs["Scale"].default_value = 420.0
    weave.inputs["Detail"].default_value = 1.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.0008
    nt.links.new(weave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def paper_material(name="Pages"):
    """The page block: cream, with the fine striation of stacked leaves."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.86, 0.82, 0.71, 1)
    bsdf.inputs["Roughness"].default_value = 0.94

    # Leaves stack along the book's thickness, which is local X.
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (260.0, 1.0, 1.0)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    leaves = nt.nodes.new("ShaderNodeTexWave")
    leaves.wave_type = "BANDS"
    leaves.bands_direction = "X"
    leaves.inputs["Scale"].default_value = 1.0
    leaves.inputs["Distortion"].default_value = 1.2
    nt.links.new(mapping.outputs["Vector"], leaves.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.30
    bump.inputs["Distance"].default_value = 0.0006
    nt.links.new(leaves.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def build_book():
    """
    One hardback, which every Project reuses. Slots in a fixed order, because
    the site assigns the painted textures by material name: cloth, Cover, Spine,
    pages.

    No lid and no seam. A board game box has neither of the things that make a
    book read as a book, and the seam across a third of the face was wrong even
    for a box.

    The back is rounded, which is what a hardback is. Rounding brings the rest
    with it: a groove for the board to hinge in, a hollow behind the back, a
    headband closing the hollow, and a page block curved to match at the back
    and hollowed at the fore-edge.
    """
    cloth = cloth_material("BookCloth")
    cover = cloth_material("BookCover", colour=(0.55, 0.52, 0.48))
    spine = cloth_material("BookSpine", colour=(0.55, 0.52, 0.48))
    pages = paper_material("BookPages")
    thread = flat_material("BookHeadband", (0.38, 0.11, 0.09), roughness=0.9)
    pastedown = flat_material("BookPastedown", (0.74, 0.70, 0.60), roughness=0.94)

    t, h, w = BOX["thickness"], BOX["height"], BOX["width"]

    # Along the shelf-facing axis, from the front: the rounded back, the groove,
    # then the boards, with the page block inset behind them.
    joint_z = w / 2 - SPINE_ROUND
    board_len = w - SPINE_ROUND - GROOVE
    board_z = -(SPINE_ROUND + GROOVE) / 2

    parts = []

    # Front board carries the Cover; the back board is plain cloth.
    for sign, name, carries_cover in ((1, "Book.FrontBoard", True), (-1, "Book.BackBoard", False)):
        obj = board(
            name,
            (BOARD_T, h, board_len),
            (sign * (t / 2 - BOARD_T / 2), 0, board_z),
            cloth,
        )
        obj.data.materials.append(cover)
        obj.data.materials.append(pastedown)
        face_materials_and_uvs(
            obj,
            cover_slot=1 if carries_cover else None,
            inner_slot=2,
            outward=sign,
            total_h=h,
        )
        if carries_cover:
            # Put the origin on the hinge, in the groove, so the site can swing
            # the front board open by rotating it. Rotating a board about its
            # own centre is not a book opening, it is a board spinning.
            hinge_y = -(joint_z - GROOVE)
            shift = hinge_y - obj.location.y
            obj.data.transform(Matrix.Translation((0, -shift, 0)))
            obj.location.y += shift
        for mod in obj.modifiers:
            if mod.type == "BEVEL":
                mod.width = BOOK_BEVEL
        parts.append(obj)

    parts.append(build_spine_shell(cloth, spine))
    parts.extend(build_headbands(thread))
    parts.append(build_page_block(pages))

    return parts


# Views to judge a Book from. The three-quarter shows the Cover and the curve
# of the back at once; "head" looks down on the top, where the square, the
# hollow and the headband live; "spine" is what the Shelf actually shows.
BOOK_VIEWS = {
    "three-quarter": ((1.35, -2.35, 0.92), 55),
    "head": ((0.85, -1.25, 1.55), 50),
    "spine": ((0.14, -2.20, 0.16), 45),
}


def bake_cloth_normal(path, size=512, threads=44):
    """
    Bake a tiling normal map of book cloth.

    The reason the painted Spine looks like paint is that it is perfectly
    smooth. Real book cloth is a visible weave, and what gives it away is not
    its colour but the way light crawls across the threads as the camera moves.
    A colour texture cannot do that; a normal map can, and one small tiling map
    serves every Book on the Shelf.

    The weave is two sine waves crossed, built from explicit maths nodes rather
    than Blender's wave texture, because the number of periods across the image
    has to be a whole number or the tile shows a seam.
    """
    bpy.ops.mesh.primitive_plane_add(size=1)
    plane = bpy.context.active_object
    plane.name = "ClothSwatch"

    # Exact 0-1 UVs, so one bake is one whole number of threads each way.
    bm = bmesh.new()
    bm.from_mesh(plane.data)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co.x + 0.5, co.y + 0.5)
    bm.to_mesh(plane.data)
    bm.free()

    mat = bpy.data.materials.new("ClothWeave")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    split = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["UV"], split.inputs["Vector"])

    ridges = []
    for axis in ("X", "Y"):
        scale = nt.nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = 2 * math.pi * threads
        nt.links.new(split.outputs[axis], scale.inputs[0])
        sine = nt.nodes.new("ShaderNodeMath")
        sine.operation = "SINE"
        nt.links.new(scale.outputs["Value"], sine.inputs[0])
        ridges.append(sine)

    # Over and under: at any point the thread nearer the surface wins.
    weave = nt.nodes.new("ShaderNodeMath")
    weave.operation = "MAXIMUM"
    nt.links.new(ridges[0].outputs["Value"], weave.inputs[0])
    nt.links.new(ridges[1].outputs["Value"], weave.inputs[1])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 1.1 / threads / 6
    nt.links.new(weave.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    plane.data.materials.append(mat)

    img = bpy.data.images.new("ClothNormal", size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    # No margin: the UVs fill the image, and a margin would bleed over the seam.
    bpy.ops.object.bake(type="NORMAL", margin=0)

    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"[cloth] wrote {path} ({threads} threads, tiling)")
    return img


def setup_box_camera(centre_z=0.0, view="three-quarter"):
    """Put the camera somewhere a Book can be judged from."""
    (x, y, z), lens = BOOK_VIEWS[view]
    bpy.ops.object.camera_add(location=(x, y, centre_z + z))
    cam = bpy.context.active_object
    cam.name = "BoxCamera"
    cam.data.lens = lens
    target = Vector((0, 0, centre_z))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", help="write a preview PNG here")
    ap.add_argument("--bake", help="bake the carcass to this PNG")
    ap.add_argument("--bake-size", type=int, default=2048)
    ap.add_argument("--bake-samples", type=int, default=96)
    ap.add_argument("--show-baked", help="render the baked texture unlit, to this PNG")
    ap.add_argument("--export", help="write the .glb here")
    ap.add_argument("--bake-room", help="bake the room to this PNG")
    ap.add_argument("--book-render", help="render one Book on its own, to this PNG")
    ap.add_argument("--book-view", default="three-quarter", choices=sorted(BOOK_VIEWS))
    ap.add_argument("--cloth-bake", help="bake the tiling cloth normal map here")
    ap.add_argument("--cloth-size", type=int, default=256)
    ap.add_argument("--cloth-threads", type=int, default=22)
    ap.add_argument("--book-export", help="write the Book .glb here")
    ap.add_argument("--view", default="three-quarter", choices=sorted(SHELF_VIEWS))
    ap.add_argument("--width", type=int, default=1000)
    ap.add_argument("--height", type=int, default=760)
    ap.add_argument("--samples", type=int, default=160)
    args = ap.parse_args(argv)

    clear_scene()

    if args.cloth_bake:
        bake_cloth_normal(args.cloth_bake, size=args.cloth_size, threads=args.cloth_threads)
        return

    if args.book_export:
        export_glb(build_book(), args.book_export, materials="EXPORT")
        return

    if args.book_render:
        bk = build_book()
        drop = FLOOR_Y + BOX["height"] / 2
        for obj in bk:
            obj.location.z += drop
        build_room()
        setup_evening()
        setup_box_camera(centre_z=drop, view=args.book_view)
        setup_render(samples=args.samples)
        bpy.context.scene.render.filepath = args.book_render
        bpy.ops.render.render(write_still=True)
        print(f"[book] wrote {args.book_render}")
        return

    parts = build_carcass()
    room = build_room()
    setup_evening()
    setup_camera(args.view)
    setup_render(width=args.width, height=args.height, samples=args.samples)

    print(f"[shelf] carcass {OUTER_WIDTH:.3f} x {UNIT_HEIGHT:.3f} x {SHELF['depth']:.3f}")

    if args.render:
        bpy.context.scene.render.filepath = args.render
        bpy.ops.render.render(write_still=True)
        print(f"[shelf] wrote {args.render}")

    if args.bake or args.show_baked or args.export:
        # Two atlases, not one. A floor is mostly empty and a carcass is mostly
        # edges; sharing a map means the shadow on the floor and the grain on a
        # board edge compete for the same texels and both lose.
        unwrap_all(parts)
        carcass_img = bake_combined(
            parts,
            args.bake or "/tmp/shelf-bake.png",
            size=args.bake_size,
            samples=args.bake_samples,
            name="CarcassBake",
        )

        unwrap_all(room, margin=0.01, planar=True)
        room_img = bake_combined(
            room,
            args.bake_room or "/tmp/room-bake.png",
            size=args.bake_size,
            samples=args.bake_samples,
            name="RoomBake",
        )

        carcass = join_carcass(parts)
        carcass.name = "Carcass"

        if args.export:
            export_glb([carcass, *room], args.export)

        if args.show_baked:
            show_baked(carcass, carcass_img)
            for obj in room:
                show_baked(obj, room_img)
            standard_view()
            bpy.context.scene.render.filepath = args.show_baked
            bpy.ops.render.render(write_still=True)
            print(f"[shelf] wrote {args.show_baked}")


if __name__ == "__main__":
    main()
