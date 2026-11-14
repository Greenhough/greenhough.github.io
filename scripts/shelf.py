"""
Builds the Shelf in Blender, from a script.

This file is the source of truth for the model. The .glb and its baked textures
are build artifacts. See docs/adr/0003.

    # render a preview, through the camera the site actually uses
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/shelf.py -- --view site --render build/preview.png

    # the full rebuild: three atlases, both .glb files, and the unlit check
    caffeinate -i /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/shelf.py -- --view site --width 1280 --height 720 \
        --bake build/shelf-bake.png \
        --bake-room build/room-bake.png --room-size 4096 \
        --bake-boxes build/box-bake.png \
        --boxes-manifest src/components/shelf/box-bake.json \
        --book-export public/models/book.glb \
        --export public/models/shelf.glb --show-baked build/baked-check.png
    node scripts/bake-to-webp.mjs
    node scripts/prairie.mjs        # only if the view outside has changed

The third atlas is the light on the Books at rest, and the bake reads
src/content/work/ to know which Project stands in which slot: see
docs/adr/0006. Run it again when Projects are added or reordered.

Judge the model from the --show-baked render, never from --render: see the
addendum to docs/adr/0003. A lit render goes through AgX and the atlas does
not, so a lit render will happily show you detail the atlas has already
clipped away. (--render --standard is the quick way to see a lighting change
without baking: the lit scene through the view the atlas is seen through.)
Then judge the page itself, in a browser: docs/adr/0006.

Iterate at --bake-size 768 --bake-samples 16, which takes a few minutes. The
full bake is about two hours on an M1, nearly all of it the room at 4096, and
caffeinate is there because a Mac that sleeps part way takes all night.
If one atlas is cut short, --reuse keeps the ones already written.

Dimensions come from the site: a Box is 0.2 x 1.0 x 0.82 scene units, and the
carcass is sized around six of them. Those numbers are repeated in
src/components/shelf/Box.tsx and ShelfUnit.tsx; they have to agree, so they are
named here rather than left as literals.
"""

import argparse
import glob
import json
import math
import os
import re
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
    "stem_r": 0.011,
}

# The desk, under the window. Its top lands 80mm below the window sill.
DESK = {
    "x0": -2.72,
    "x1": -0.95,
    "z0": -0.49,  # clear of the skirting
    "z1": 0.13,
    "height": 0.74,
    "top": 0.04,
    "leg": 0.05,
}

# A second, smaller lamp standing on the desk. A desk away from the floor
# lamp sits dark, and a second pool of warm light is most of what makes an
# evening room read as somewhere someone works.
DESK_LAMP = {
    "x": -2.46,
    "z": -0.31,
    "height": 0.30,
    "shade_r": 0.095,
    "shade_h": 0.125,
    "base_r": 0.072,
    "stem_r": 0.008,
}

# On the back wall, right of the carcass and above the floor lamp's shade,
# so the lamp lights it.
PINBOARD = {"x0": 1.08, "x1": 2.36, "y0": 0.36, "y1": 1.12}

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
}


# The dressing added once the room was compared against a denser one. Each is
# an object the camera can see from the Shelf view, which at 16:9 means the
# back wall and about a metre and a half of floor in front of it: the side
# walls are out of frame, so nothing is hung on them.

# A flatweave under the Shelf and the desk chair. A dark floor at dusk is a
# large empty rectangle; a rug is the cheapest thing that gives it an edge.
RUG = {"x0": -2.30, "x1": 1.30, "z0": 0.42, "z1": 2.45, "thick": 0.012}

# A low console right of the carcass, with a turntable on it and sleeves in it.
# The player is the object docs/adr/0005 plans as a way in to a song; for now
# it is dressing, but it stands where that view would look.
CONSOLE = {"x0": 1.02, "x1": 1.94, "depth": 0.40, "height": 0.52, "leg": 0.11}

# Two paintings over the console, under the pinboard: Friedrich's Wanderer
# above the Sea of Fog and Aivazovsky's Ship on Stormy Seas. The site draws
# the pictures themselves, live, because a painting baked into the room atlas
# is thirty texels tall: what is modelled here is the frame and a canvas in
# the picture's average colour, so the wall round it takes the right bounce.
# src/components/shelf/Console.tsx repeats these numbers.
PRINTS = (
    {"x": 1.25, "y": -0.235, "w": 0.30, "h": 0.40, "art": "wanderer"},
    {"x": 1.69, "y": -0.235, "w": 0.30, "h": 0.40, "art": "storm"},
)
PAINTINGS = {"wanderer": (0.27, 0.30, 0.33), "storm": (0.085, 0.125, 0.135)}

# The Board games: two boxes lying flat in the console's right bay, one on the
# other, the side with the title out. Bottom first. Which games they are, their
# real sizes and their card come from src/content/room/board-games.json; the art
# on the faces the camera sees is drawn by the site. Console.tsx repeats these
# numbers.
GAMES = {
    "front": 0.025,  # how far the stack sits back from the console's front edge
    "yaw": (0.035, -0.050),  # a little out of square, bottom box first
}

# Marcus Aurelius, on top of the carcass to the right of the plant.
BUST = {"x": 0.69, "z": 0.07, "yaw": -0.30, "height": 0.36, "uv_scale": 3.0}

# A tall plant in the back right corner, past the console.
FLOOR_PLANT = {"x": 2.42, "z": -0.10, "pot_r": 0.155, "pot_h": 0.30, "height": 1.42}

# The chair, pushed most of the way in and left a little out of square.
CHAIR = {"x": -1.92, "z": 0.36, "yaw": math.radians(14), "seat": 0.45, "back": 0.86}

# How the floor, ceiling and side walls spend their atlas. The camera lives
# near the back wall and only a phone held upright ever sees the front half of
# the room, from a long way off. So past this depth the UVs are squeezed: one
# welded island, texel density falling to a third where nothing looks closely.
SQUEEZE = {"from_z": 2.7, "by": 0.3}


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



def drop_faces(obj, away):
    """
    Delete the faces of a board that look along local `away`.

    For the side of a thing that lies against something: the underside of the
    rug, the back of the pinboard. Nothing ever sees it, and left in it takes
    as much of the atlas as the side that is seen.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    aim = Vector(away)
    doomed = [f for f in bm.faces if f.normal.dot(aim) > 0.9]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()

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
    # Painted the wall's colour and a good deal darker than trim. The window's
    # light sits six centimetres from these faces, and in gloss white they
    # baked as three strips of pure white round the glass: a lightbox frame.
    reveal_mat = flat_material("Reveal", (0.36, 0.345, 0.32), roughness=0.9)
    for name, pts, facing in jambs:
        parts.append(quad(f"Room.Reveal.{name}", pts, reveal_mat, facing))

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

    # No glazing bars. Three tall panes divided by white uprights read as a
    # cell window, which is not the association wanted. One sheet of glass,
    # and the dusk gradient does the work the bars were supposed to do.

    # A sill proud of the wall, which is the detail that stops the opening
    # reading as a cut-out.
    parts.append(
        board(
            "Room.Sill",
            (w["x1"] - w["x0"] + 0.10, 0.028, reveal + 0.035),
            (WINDOW["x"], w["y0"] - 0.014, back - reveal / 2 + 0.018),
            # Wood, not white paint, for the same reason as the reveal.
            oak_material("SillOak", base=(0.105, 0.062, 0.032), light=(0.26, 0.165, 0.085), scale=1.4),
        )
    )

    return parts


def build_lamp(name, spec, stand_on, metal, shade_mat):
    """
    A lamp: a base, a stem and a drum shade.

    The shade is emissive and otherwise ordinary: it is opaque, so it blocks
    the bulb sideways and throws the cone up and down that says "shade", and
    it glows on camera because a linen shade with a bulb in it does. This is
    the opposite arrangement to the glass, which is emissive but invisible to
    every ray except the camera's — there the light comes from a lamp behind
    it, here the light comes from inside.

    `stand_on` is the height of whatever it stands on: the floor for the
    floor lamp, the desk top for the desk lamp.
    """
    x, z, h = spec["x"], spec["z"], spec["height"]
    return [
        cylinder(f"Room.{name}.Base", spec["base_r"], 0.022, (x, stand_on + 0.011, z), metal),
        cylinder(f"Room.{name}.Stem", spec["stem_r"], h, (x, stand_on + h / 2, z), metal),
        cylinder(
            f"Room.{name}.Shade",
            spec["shade_r"],
            spec["shade_h"],
            (x, stand_on + h + spec["shade_h"] / 2, z),
            shade_mat,
            caps=False,  # open top and bottom, so the light goes both ways
        ),
    ]


def lamp_bulb_y(spec, stand_on):
    """Where the bulb sits: the middle of that lamp's shade."""
    return stand_on + spec["height"] + spec["shade_h"] / 2


def build_desk(oak):
    """
    The desk, under the window and left of the carcass.

    Under the window because that is where a desk goes, because it is the one
    stretch of wall the default camera already sees all of, and because it
    balances the floor lamp on the other side of the Shelf. Its top sits 80mm
    below the window sill, which is what makes the two read as belonging to
    the same wall rather than as two objects that happen to be near each other.
    """
    d = DESK
    top_y = FLOOR_Y + d["height"]
    width = d["x1"] - d["x0"]
    depth = d["z1"] - d["z0"]
    parts = [
        board(
            "Room.Desk.Top",
            (width, d["top"], depth),
            ((d["x0"] + d["x1"]) / 2, top_y - d["top"] / 2, (d["z0"] + d["z1"]) / 2),
            oak,
        )
    ]
    leg_h = d["height"] - d["top"]
    inset = d["leg"] / 2 + 0.055
    for i, x in enumerate((d["x0"] + inset, d["x1"] - inset)):
        for j, z in enumerate((d["z0"] + inset, d["z1"] - inset)):
            parts.append(
                board(
                    f"Room.Desk.Leg.{i}{j}",
                    (d["leg"], leg_h, d["leg"]),
                    (x, FLOOR_Y + leg_h / 2, z),
                    oak,
                )
            )
    return parts


def build_laptop(metal, key_mat, screen_mat):
    """
    The laptop, open. A 13 inch Air, at the room's own scale of a unit to a
    metre: 304mm by 215mm, which is the actual machine rather than a guess.

    It was a closed slab first, on the reasoning that an open one needs a
    screen and a dark rectangle standing up reads worse than a slab lying
    down. That was wrong in an evening room. A closed laptop is a dead object;
    an open one with a lit screen is the thing in the room that says somebody
    was here a minute ago — and the screen is a surface that can be given a job
    later, which a closed lid can never be.

    The display is emissive, so it both reads as on and throws a little cold
    light up onto the keyboard. That is the detail that sells it: at this hour
    a screen is a light source, not a picture.
    """
    top_y = FLOOR_Y + DESK["height"]
    lx, lz = -1.60, -0.17
    w, d = 0.304, 0.212
    parts = []

    deck = board("Room.Laptop.Deck", (w, 0.011, d), (lx, top_y + 0.0055, lz), metal)
    parts.append(deck)
    # The keyboard, as one darker rectangle. At about a hundred texels to the
    # unit a key is a third of a texel, so this is a tone, not a keyboard.
    parts.append(
        board(
            "Room.Laptop.Keys",
            (w - 0.052, 0.002, d * 0.56),
            (lx, top_y + 0.0115, lz - 0.022),
            key_mat,
            bevel=False,
        )
    )

    # The lid, hinged at the deck's back edge and leaning back off vertical.
    lean = math.radians(20)
    hinge_z = lz - d / 2
    lid_h = 0.206
    up = (math.cos(lean), -math.sin(lean))  # (y, z) of the lid's own up axis
    cy = top_y + 0.011 + up[0] * lid_h / 2
    cz = hinge_z + up[1] * lid_h / 2

    # Negative about Blender's X: board() maps the site's +Z (towards the
    # camera) to Blender's -Y, so a positive turn tipped the top of the lid
    # forward, over the keyboard, while its centre sat behind the hinge. The
    # live screen in Atmosphere.tsx leans back, and the two came apart.
    lid = board("Room.Laptop.Lid", (w, lid_h, 0.006), (lx, cy, cz), metal)
    lid.rotation_euler = (-lean, 0, 0)
    parts.append(lid)

    # The display, a hair proud of the lid so it never fights it for the same
    # texels. Offset along the lid's own normal rather than straight forward,
    # or it would sink into the lid at the top and lift off it at the bottom.
    face = (math.sin(lean), math.cos(lean))
    screen = board(
        "Room.Laptop.Screen",
        (w - 0.016, lid_h - 0.018, 0.002),
        (lx, cy + face[0] * 0.005, cz + face[1] * 0.005),
        screen_mat,
        bevel=False,
    )
    screen.rotation_euler = (-lean, 0, 0)
    parts.append(screen)

    return parts


def build_desk_things(metal, key_mat, screen_mat, pot_mat, leaf_mat):
    """
    What is on the desk: an open laptop. There was a plant beside it too, and
    it came off: it crowded the laptop and read as clutter from the Desk view.

    Deliberately spare. A mug, loose papers and a pen pot were all offered and
    not taken, so this is a tidy desk rather than a busy one, and filling it
    anyway would be overruling that.

    The stack of read books is not here, and nor is the sheet of paper. Both
    are lettered at runtime, because a title baked into the room atlas at this
    density would be about twenty texels tall and unreadable.
    """
    return build_laptop(metal, key_mat, screen_mat)


def build_pinboard(cork_mat, paper_mat):
    """
    The pinboard, on the back wall right of the carcass.

    docs/adr/0004 settled that it is dressing and not navigation: nothing on
    it is clickable and the site has no About page for a fourth view to point
    at. It sits above the floor lamp's shade, so the lamp lights it, and it
    balances the window and desk on the other side of the Shelf.

    The pinned papers are blank. Real artwork can go on later without moving
    anything; blank paper at this distance reads as paper, and inventing
    pictures to fill it would be inventing content.
    """
    b = PINBOARD
    z = ROOM["back"] + 0.012
    parts = [
        board(
            "Room.Pinboard",
            (b["x1"] - b["x0"], b["y1"] - b["y0"], 0.024),
            ((b["x0"] + b["x1"]) / 2, (b["y0"] + b["y1"]) / 2, z),
            cork_mat,
        )
    ]
    drop_faces(parts[0], (0, 1, 0))  # the face against the wall
    pinned = (
        (-0.36, 0.16, 0.34, 0.26, 3.5),
        (0.10, 0.19, 0.28, 0.32, -3.0),
        (-0.24, -0.19, 0.30, 0.22, -4.5),
        (0.28, -0.17, 0.34, 0.26, 2.5),
    )
    cx = (b["x0"] + b["x1"]) / 2
    cy = (b["y0"] + b["y1"]) / 2
    for i, (dx, dy, w, h, tilt) in enumerate(pinned):
        sheet = board(
            f"Room.Pinned.{i}",
            (w, h, 0.004),
            (cx + dx, cy + dy, z + 0.014),
            paper_mat,
            bevel=False,
        )
        # A slight tilt, because nothing pinned to a board is ever square.
        sheet.rotation_euler = (0, math.radians(tilt), 0)
        parts.append(sheet)
    return parts


def srgb(hex_colour):
    """A CSS hex colour as the linear RGB Blender wants."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def _math(nt, op, a=None, b=None):
    """A maths node with either sockets or constants on its two inputs."""
    node = nt.nodes.new("ShaderNodeMath")
    node.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            node.inputs[i].default_value = v
        else:
            nt.links.new(v, node.inputs[i])
    return node.outputs["Value"]


def floor_material(name="FloorBoards"):
    """
    A boarded floor, running away from the camera.

    The floor was one flat brown, and flat is what a baked room cannot afford:
    with no variation across it there is nothing for the lamp's pool to fall
    on, so the pool reads as a gradient painted on a card. Boards give it
    lines that converge on the back wall, which is most of what says "floor",
    and a tone per board, which is what says "wood".

    Run front to back rather than across, so the joints are perspective lines
    in every view the camera has.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")

    # Brick rows run along X; turned a quarter so a board's length lies along
    # Blender Y, which is the room's depth.
    turn = nt.nodes.new("ShaderNodeMapping")
    turn.inputs["Rotation"].default_value = (0, 0, math.pi / 2)
    nt.links.new(coord.outputs["Object"], turn.inputs["Vector"])

    boards = nt.nodes.new("ShaderNodeTexBrick")
    boards.offset = 0.37
    boards.offset_frequency = 2
    boards.inputs["Color1"].default_value = (0, 0, 0, 1)
    boards.inputs["Color2"].default_value = (1, 1, 1, 1)
    boards.inputs["Mortar"].default_value = (0.5, 0.5, 0.5, 1)
    boards.inputs["Scale"].default_value = 1.0
    boards.inputs["Mortar Size"].default_value = 0.0035
    boards.inputs["Mortar Smooth"].default_value = 0.6
    boards.inputs["Bias"].default_value = 0.0
    boards.inputs["Brick Width"].default_value = 1.9
    boards.inputs["Row Height"].default_value = 0.145
    nt.links.new(turn.outputs["Vector"], boards.inputs["Vector"])

    # Grain, stretched hard along the board.
    stretch = nt.nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (9.0, 0.35, 1.0)
    nt.links.new(coord.outputs["Object"], stretch.inputs["Vector"])
    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 3.2
    grain.inputs["Detail"].default_value = 7.0
    grain.inputs["Roughness"].default_value = 0.6
    nt.links.new(stretch.outputs["Vector"], grain.inputs["Vector"])

    tone = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(boards.outputs["Color"], tone.inputs["Color"])
    figure = _math(nt, "ADD", _math(nt, "MULTIPLY", grain.outputs["Fac"], 0.55),
                   _math(nt, "MULTIPLY", tone.outputs["Red"], 0.45))

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "B_SPLINE"
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (0.090, 0.058, 0.036, 1)
    ramp.color_ramp.elements[1].position = 0.80
    ramp.color_ramp.elements[1].color = (0.250, 0.170, 0.105, 1)
    nt.links.new(figure, ramp.inputs["Fac"])

    # The joints: a dark line, and a dip for the light to catch.
    joint = nt.nodes.new("ShaderNodeMix")
    joint.data_type = "RGBA"
    joint.inputs["B"].default_value = (0.022, 0.015, 0.010, 1)
    nt.links.new(boards.outputs["Fac"], joint.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], joint.inputs["A"])
    nt.links.new(joint.outputs["Result"], bsdf.inputs["Base Color"])

    rough = _math(nt, "ADD", _math(nt, "MULTIPLY", grain.outputs["Fac"], 0.22), 0.36)
    nt.links.new(rough, bsdf.inputs["Roughness"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.invert = True
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(boards.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def rug_material(name, half_x, half_z):
    """
    A flatweave: an oat field, a dark band near the edge and a rust line
    inside it. Drawn from the rug's own coordinates, so the border follows the
    edge whatever size the rug is.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.96
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])

    # Distance in from the nearest edge. board() puts depth on local Y.
    dx = _math(nt, "SUBTRACT", half_x, _math(nt, "ABSOLUTE", sep.outputs["X"]))
    dz = _math(nt, "SUBTRACT", half_z, _math(nt, "ABSOLUTE", sep.outputs["Y"]))
    edge = _math(nt, "MINIMUM", dx, dz)

    def band(lo, hi):
        return _math(nt, "MULTIPLY", _math(nt, "GREATER_THAN", edge, lo), _math(nt, "LESS_THAN", edge, hi))

    # The weave, as fine stripes across the short way.
    weft = nt.nodes.new("ShaderNodeTexWave")
    weft.bands_direction = "X"
    weft.inputs["Scale"].default_value = 60.0
    weft.inputs["Distortion"].default_value = 0.6
    nt.links.new(coord.outputs["Object"], weft.inputs["Vector"])
    fleck = nt.nodes.new("ShaderNodeTexNoise")
    fleck.inputs["Scale"].default_value = 26.0
    fleck.inputs["Detail"].default_value = 3.0
    nt.links.new(coord.outputs["Object"], fleck.inputs["Vector"])
    weave = _math(nt, "ADD", _math(nt, "MULTIPLY", weft.outputs["Fac"], 0.10),
                  _math(nt, "MULTIPLY", fleck.outputs["Fac"], 0.22))

    field = nt.nodes.new("ShaderNodeMix")
    field.data_type = "RGBA"
    field.inputs["A"].default_value = (0.300, 0.250, 0.185, 1)
    field.inputs["B"].default_value = (0.440, 0.380, 0.290, 1)
    nt.links.new(_math(nt, "MULTIPLY", weave, 3.0), field.inputs["Factor"])

    dark = nt.nodes.new("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.inputs["B"].default_value = (0.055, 0.060, 0.052, 1)
    nt.links.new(band(0.11, 0.20), dark.inputs["Factor"])
    nt.links.new(field.outputs["Result"], dark.inputs["A"])

    rust = nt.nodes.new("ShaderNodeMix")
    rust.data_type = "RGBA"
    rust.inputs["B"].default_value = (0.300, 0.095, 0.045, 1)
    nt.links.new(band(0.255, 0.285), rust.inputs["Factor"])
    nt.links.new(dark.outputs["Result"], rust.inputs["A"])
    nt.links.new(rust.outputs["Result"], bsdf.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.003
    nt.links.new(weave, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def print_material(name, art, half_w, half_h):
    """
    What is in a frame: flat shapes and nothing else.

    Abstract on purpose. A print of something is a claim about what Evan has
    on his wall, and inventing that would be inventing content, the same rule
    that keeps the pinboard blank. Shapes in the room's own colours are only
    ever shapes.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    # -1..1 across and up the sheet. board() puts height on local Z.
    u = _math(nt, "DIVIDE", sep.outputs["X"], half_w)
    v = _math(nt, "DIVIDE", sep.outputs["Z"], half_h)

    paper = (0.62, 0.57, 0.47, 1)
    rust = (0.36, 0.105, 0.045, 1)
    green = (0.030, 0.105, 0.055, 1)
    ink = (0.016, 0.014, 0.012, 1)
    ochre = (0.48, 0.30, 0.075, 1)

    def over(base, colour, mask):
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["B"].default_value = colour
        nt.links.new(mask, mix.inputs["Factor"])
        if isinstance(base, tuple):
            mix.inputs["A"].default_value = base
        else:
            nt.links.new(base, mix.inputs["A"])
        return mix.outputs["Result"]

    if art == "sun":
        # A disc over two bands of ground.
        du = _math(nt, "MULTIPLY", _math(nt, "SUBTRACT", u, 0.08), half_w / half_h)
        dv = _math(nt, "SUBTRACT", v, 0.22)
        r2 = _math(nt, "ADD", _math(nt, "MULTIPLY", du, du), _math(nt, "MULTIPLY", dv, dv))
        colour = over(paper, rust, _math(nt, "LESS_THAN", r2, 0.34**2))
        colour = over(colour, green, _math(nt, "LESS_THAN", v, -0.30))
        colour = over(colour, ink, _math(nt, "LESS_THAN", v, -0.62))
    elif art == "bands":
        # Upright bars of unequal height, standing on a line.
        colour = paper
        bars = ((-0.62, 0.22, 0.55, green), (-0.20, 0.22, 0.15, ochre),
                (0.22, 0.22, 0.70, ink), (0.62, 0.20, -0.10, rust))
        for cx, wd, top, tint in bars:
            inside = _math(nt, "MULTIPLY",
                           _math(nt, "LESS_THAN", _math(nt, "ABSOLUTE", _math(nt, "SUBTRACT", u, cx)), wd / 2 + 0.07),
                           _math(nt, "MULTIPLY", _math(nt, "LESS_THAN", v, top), _math(nt, "GREATER_THAN", v, -0.66)))
            colour = over(colour, tint, inside)
    else:
        # "fields": a horizon, wide, for the print leaning on top of the Shelf.
        colour = over(paper, ochre, _math(nt, "LESS_THAN", v, 0.10))
        colour = over(colour, green, _math(nt, "LESS_THAN", v, -0.22))
        colour = over(colour, ink, _math(nt, "LESS_THAN", v, -0.58))
        du = _math(nt, "MULTIPLY", _math(nt, "ADD", u, 0.42), half_w / half_h)
        dv = _math(nt, "SUBTRACT", v, 0.46)
        r2 = _math(nt, "ADD", _math(nt, "MULTIPLY", du, du), _math(nt, "MULTIPLY", dv, dv))
        colour = over(colour, rust, _math(nt, "LESS_THAN", r2, 0.20**2))

    nt.links.new(colour, bsdf.inputs["Base Color"])
    return mat


def build_print(name, x, y, z, w, h, art, frame_mat, mount_mat, lean=0.0):
    """
    A framed print: a moulding, a mount, and the sheet. `lean` tips it back
    about its bottom edge, for one standing on a shelf rather than hung.
    """
    depth = 0.022
    border = 0.016
    mount = 0.045
    parts = []

    def piece(tag, size, forward, mat, bevel=True):
        # Tipped about the frame's bottom edge: a point `forward` of the back
        # and at the frame's mid-height moves up and back together.
        cy = y + math.cos(lean) * h / 2 + math.sin(lean) * forward
        cz = z - math.sin(lean) * h / 2 + math.cos(lean) * forward
        obj = board(f"Room.{name}.{tag}", size, (x, cy, cz), mat, bevel=bevel)
        obj.rotation_euler = (-lean, 0, 0)
        return obj

    parts.append(piece("Frame", (w, h, depth), depth / 2, frame_mat))
    iw, ih = w - border * 2, h - border * 2
    if art in PAINTINGS:
        # An oil painting is framed to its edge, with no mount.
        parts.append(
            piece("Art", (iw, ih, 0.003), depth + 0.0015,
                  flat_material(f"Print.{name}", PAINTINGS[art], roughness=0.6), bevel=False)
        )
        return parts
    parts.append(piece("Mount", (iw, ih, 0.003), depth + 0.0015, mount_mat, bevel=False))
    aw, ah = iw - mount * 2, ih - mount * 2
    parts.append(
        piece("Art", (aw, ah, 0.002), depth + 0.004,
              print_material(f"Print.{name}", art, aw / 2, ah / 2), bevel=False)
    )
    return parts


def build_leaf(name, base, length, width, lean, turn, material):
    """
    One leaf, with its origin at the point it grows from.

    The origin matters: the site sways the big plant's leaves a degree or two,
    and a leaf has to turn about its stalk, not its middle.
    """
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1.0, subdivisions=2, location=(0, 0, 0))
    leaf = bpy.context.active_object
    leaf.name = name
    leaf.scale = (width / 2, width * 0.07, length / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    leaf.data.transform(Matrix.Translation((0, 0, length / 2)))
    leaf.location = (base[0], -base[2], base[1])
    leaf.rotation_euler = (lean, 0, turn)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
    leaf.data.materials.append(material)
    return leaf


def build_floor_plant(pot_mat, soil_mat, stem_mat, leaf_mat):
    """
    A tall plant in the corner past the console: a rubber plant, more or less,
    because broad leaves read at this distance and fine ones turn to noise.
    """
    p = FLOOR_PLANT
    x, z = p["x"], p["z"]
    parts = [
        cylinder("Room.FloorPlant.Pot", p["pot_r"], p["pot_h"], (x, FLOOR_Y + p["pot_h"] / 2, z), pot_mat),
        cylinder("Room.FloorPlant.Soil", p["pot_r"] - 0.014, 0.01, (x, FLOOR_Y + p["pot_h"] + 0.001, z), soil_mat),
    ]
    stem_h = p["height"] - p["pot_h"] - 0.12
    parts.append(
        cylinder("Room.FloorPlant.Stem", 0.011, stem_h, (x, FLOOR_Y + p["pot_h"] + stem_h / 2, z), stem_mat, segments=10)
    )
    count = 13
    for i in range(count):
        t = i / (count - 1)
        turn = i * math.radians(137.5)  # the golden angle, as a real stem does
        base_y = FLOOR_Y + p["pot_h"] + 0.16 + t * (stem_h - 0.14)
        # Lower leaves hang out wide, the top ones stand nearly upright.
        lean = math.radians(72 - 50 * t)
        length = 0.30 - 0.09 * t
        parts.append(
            build_leaf(f"Room.FloorPlant.Leaf.{i}", (x, base_y, z), length, length * 0.52, lean, turn, leaf_mat)
        )
    return parts


def build_rug():
    r = RUG
    w, d = r["x1"] - r["x0"], r["z1"] - r["z0"]
    rug = board(
        "Room.Rug",
        (w, r["thick"], d),
        ((r["x0"] + r["x1"]) / 2, FLOOR_Y + r["thick"] / 2, (r["z0"] + r["z1"]) / 2),
        rug_material("Rug", w / 2, d / 2),
        bevel=False,
    )
    drop_faces(rug, (0, 0, -1))
    return [rug]


def build_console(oak, metal, vinyl, label_mat, plinth_mat, sleeve_mats):
    """
    The console and the turntable on it.

    The record is its own object with its origin on the spindle, because the
    site turns it. Everything else here stays where it is baked.
    """
    c = CONSOLE
    w = c["x1"] - c["x0"]
    cx = (c["x0"] + c["x1"]) / 2
    z0 = ROOM["back"] + SKIRTING["depth"] + 0.01
    cz = z0 + c["depth"] / 2
    t = 0.024
    top_y = FLOOR_Y + c["height"]
    body_h = c["height"] - c["leg"]
    parts = [
        board("Room.Console.Top", (w, t, c["depth"]), (cx, top_y - t / 2, cz), oak),
        board("Room.Console.Bottom", (w - t * 2, t, c["depth"] - 0.01), (cx, FLOOR_Y + c["leg"] + t / 2, cz), oak),
        board("Room.Console.Back", (w - t * 2, body_h - t * 2, 0.008), (cx, FLOOR_Y + c["leg"] + body_h / 2, z0 + 0.008), oak, bevel=False),
    ]
    for tag, x in (("L", c["x0"] + t / 2), ("R", c["x1"] - t / 2), ("M", cx + 0.02)):
        parts.append(
            board(f"Room.Console.Side.{tag}", (t, body_h - (0 if tag != "M" else t * 2), c["depth"] - (0 if tag != "M" else 0.02)),
                  (x, FLOOR_Y + c["leg"] + body_h / 2, cz), oak, vertical=True)
        )
    for i, x in enumerate((c["x0"] + 0.06, c["x1"] - 0.06)):
        for j, z in enumerate((z0 + 0.05, z0 + c["depth"] - 0.05)):
            parts.append(cylinder(f"Room.Console.Leg.{i}{j}", 0.016, c["leg"], (x, FLOOR_Y + c["leg"] / 2, z), metal, segments=12))

    # Sleeves, standing in the left bay. Uneven on purpose: a row of records
    # is never the same height twice and never quite upright.
    inner_floor = FLOOR_Y + c["leg"] + t
    x = c["x0"] + t + 0.012
    i = 0
    sleeves = []
    while x < cx - 0.03:
        thick = 0.0045 + 0.002 * ((i * 7) % 3)
        h = 0.300 + 0.012 * ((i * 5) % 4)
        sleeve = board(
            f"Room.Sleeve.{i}",
            (thick, h, 0.31),
            (x + thick / 2, inner_floor + h / 2, cz + 0.02),
            sleeve_mats[(i * 3) % len(sleeve_mats)],
            bevel=False,
        )
        sleeve.rotation_euler = (0, math.radians(((i * 13) % 7) - 3) * 0.6, 0)
        sleeves.append(sleeve)
        x += thick + 0.0035 + 0.004 * ((i * 11) % 3)
        i += 1
    # One object: twenty flat-coloured cards bake as fast as one, and each
    # object baked separately costs seconds the cards are not worth.
    select(sleeves)
    bpy.ops.object.join()
    row = bpy.context.active_object
    row.name = "Room.Sleeves"
    parts.append(row)

    # The turntable.
    px, pz = cx - 0.16, cz - 0.01
    plinth_h = 0.045
    parts.append(board("Room.Player.Plinth", (0.44, plinth_h, 0.345), (px, top_y + plinth_h / 2, pz), plinth_mat))
    sx, sz = px - 0.045, pz
    deck = top_y + plinth_h
    parts.append(cylinder("Room.Player.Platter", 0.152, 0.012, (sx, deck + 0.006, sz), metal, segments=48))

    record = cylinder("Room.Record", 0.150, 0.003, (sx, deck + 0.0135, sz), vinyl, segments=48)
    label = cylinder("Room.Record.Label", 0.052, 0.0034, (sx, deck + 0.0135, sz), label_mat, segments=32)
    # Something off-centre on the label, or a turning record looks the same
    # as a still one.
    mark = board("Room.Record.Mark", (0.05, 0.0036, 0.011), (sx + 0.012, deck + 0.0135, sz + 0.02), vinyl, bevel=False)
    select([label, mark, record], active=record)
    bpy.ops.object.join()
    record = bpy.context.active_object
    record.name = "Room.Record"
    parts.append(record)
    parts.append(cylinder("Room.Player.Spindle", 0.004, 0.012, (sx, deck + 0.018, sz), metal, segments=10))

    # The arm: a pivot at the back right and a tube reaching in over the disc.
    ax, az = px + 0.165, pz - 0.115
    parts.append(cylinder("Room.Player.Pivot", 0.016, 0.04, (ax, deck + 0.02, az), metal, segments=16))
    tip = (sx + 0.105, sz + 0.04)
    length = math.hypot(tip[0] - ax, tip[1] - az)
    arm = board("Room.Player.Arm", (length, 0.006, 0.006), ((ax + tip[0]) / 2, deck + 0.036, (az + tip[1]) / 2), metal, bevel=False)
    arm.rotation_euler = (0, 0, math.atan2(-(tip[1] - az), tip[0] - ax))
    parts.append(arm)
    parts.append(board("Room.Player.Head", (0.016, 0.01, 0.024), (tip[0], deck + 0.03, tip[1]), plinth_mat, bevel=False))
    return parts


def read_board_games():
    """The Board games that have a box, bottom of the stack first."""
    path = os.path.join(os.path.dirname(__file__), "..", "src", "content", "room", "board-games.json")
    with open(path, encoding="utf-8") as fh:
        games = [g for g in json.load(fh) if g.get("box")]
    # Listed best first, and the best is on top.
    return sorted(games, key=lambda g: -g["rank"])


def build_board_games():
    """
    Two game boxes in the console's right bay, at their real sizes. Plain card
    in each game's own colour: the box art is drawn live on the faces the
    camera sees, for the reason the Book stack's lettering is.
    """
    c = CONSOLE
    t = 0.024
    cx = (c["x0"] + c["x1"]) / 2
    z0 = ROOM["back"] + SKIRTING["depth"] + 0.01
    bay_x = ((cx + 0.02 + t / 2) + (c["x1"] - t)) / 2
    front = z0 + c["depth"] - GAMES["front"]
    y = FLOOR_Y + c["leg"] + t
    parts = []
    for i, (game, yaw) in enumerate(zip(read_board_games(), GAMES["yaw"])):
        card = flat_material(f"Game.{i}", srgb(game["box"]["card"]), roughness=0.55)
        # The real box, in centimetres, at the room's scale of a metre to the unit.
        size = game["box"]["size"]
        w, h, d = size["wide"] / 100, size["tall"] / 100, size["deep"] / 100
        box = board(
            f"Room.Game.{i}",
            (w, h, d),
            (bay_x, y + h / 2, front - d / 2),
            card,
        )
        box.rotation_euler = (0, 0, yaw)
        parts.append(box)
        y += h
    return parts


def build_bust(marble):
    """
    Marcus Aurelius, in marble: a scan of a real bust, cut down by
    scripts/bust_prep.py to the few thousand triangles in scripts/bust.ply.

    It is given several times the room's usual share of the atlas. At a
    hundred texels to the unit his whole head would be fifteen across, and a
    portrait is the one thing in the room that has to be recognised.
    """
    b = BUST
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bust.ply")
    bpy.ops.wm.ply_import(filepath=path)
    bust = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = bust
    bust.name = "Room.Bust"
    bust.location = (b["x"], -b["z"], UNIT_HEIGHT / 2)
    bust.scale = (b["height"],) * 3
    # Turned a little, so he looks into the room rather than straight out.
    bust.rotation_euler = (0, 0, b["yaw"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    bust.data.materials.append(marble)
    bust["uv_scale"] = b["uv_scale"]
    bust["uv_tight"] = True
    return [bust]


def build_chair(wood):
    """
    A plain wooden chair at the desk. Four legs, a seat, two posts and a rail:
    the least that reads as a chair, because at this size anything finer is
    lost and anything upholstered needs light the room does not have.
    """
    c = CHAIR
    yaw = c["yaw"]
    cos, sin = math.cos(yaw), math.sin(yaw)
    half = 0.20

    def at(dx, dz):
        # Local offsets turned about the vertical. Local -Z faces the desk.
        return c["x"] + dx * cos + dz * sin, c["z"] - dx * sin + dz * cos

    def piece(name, size, dx, y, dz, vertical=False):
        px, pz = at(dx, dz)
        obj = board(f"Room.Chair.{name}", size, (px, y, pz), wood, vertical=vertical)
        e = obj.rotation_euler
        obj.rotation_euler = (e[0], e[1], yaw)
        return obj

    seat_y = FLOOR_Y + c["seat"]
    parts = [piece("Seat", (half * 2 + 0.03, 0.028, half * 2 + 0.03), 0, seat_y - 0.014, 0)]
    for i, dx in enumerate((-half + 0.01, half - 0.01)):
        # Front legs stop under the seat; back legs carry on up as the posts.
        parts.append(piece(f"Leg.F{i}", (0.034, c["seat"] - 0.028, 0.034), dx, FLOOR_Y + (c["seat"] - 0.028) / 2, -half + 0.01, vertical=True))
        parts.append(piece(f"Leg.B{i}", (0.034, c["back"], 0.034), dx, FLOOR_Y + c["back"] / 2, half - 0.01, vertical=True))
    parts.append(piece("Rail", (half * 2 - 0.02, 0.15, 0.018), 0, FLOOR_Y + c["back"] - 0.085, half - 0.01))
    parts.append(piece("Stretcher", (half * 2 - 0.02, 0.022, 0.018), 0, FLOOR_Y + 0.20, half - 0.01))
    return parts


def build_top_dressing(frame_mat, mount_mat, pot_mat, leaf_mat):
    """
    What stands on top of the carcass: a small plant. The top of a bookcase is
    the one shelf in a room that is never empty, and an empty one was reading
    as a render.

    A framed print leaned against the wall here too. The camera looks up at
    the top of the carcass from below, so its front edge cut off the bottom of
    the print and what showed was a frame with a red dot floating over the
    Shelf. It came out rather than being made taller.
    """
    top = UNIT_HEIGHT / 2
    parts = []

    # The plant, near the front edge, so the carcass does not hide its pot.
    px, pz = 0.27, 0.16
    parts.append(cylinder("Room.TopPlant.Pot", 0.07, 0.12, (px, top + 0.06, pz), pot_mat))
    for i in range(9):
        turn = i * math.radians(137.5) + 0.6
        lean_l = math.radians(34 + 18 * (i % 3))
        parts.append(
            build_leaf(f"Room.TopPlant.Leaf.{i}", (px + math.cos(turn) * 0.022, top + 0.11, pz + math.sin(turn) * 0.022),
                       0.19 + 0.03 * (i % 2), 0.07, lean_l, turn, leaf_mat)
        )
    return parts


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
    floor_mat = floor_material()
    wall_mat = flat_material("Wall", (0.70, 0.67, 0.62), roughness=0.95)
    ceil_mat = flat_material("Ceiling", (0.80, 0.79, 0.76), roughness=0.95)
    trim_mat = flat_material("Trim", (0.86, 0.85, 0.81), roughness=0.55)

    r = room_bounds()
    zs = SQUEEZE["from_z"]

    def deep(name, near, far, material, facing):
        """
        A surface running the depth of the room, as two welded faces that
        meet at SQUEEZE["from_z"]. One island, so there is no seam, but the
        far face can be given a third of the texels: see planar_uv().
        """
        obj = quad_fan(name, [near, far], material, facing)
        obj["squeeze"] = True
        # A ceiling is one soft gradient end to end and can live on half the
        # texels; everything else here is looked at.
        if name == "Room.Ceiling":
            obj["uv_scale"] = 0.5
        return obj

    parts = [
        deep(
            "Room.Floor",
            [(r["x0"], r["y0"], r["z0"]), (r["x1"], r["y0"], r["z0"]),
             (r["x1"], r["y0"], zs), (r["x0"], r["y0"], zs)],
            [(r["x0"], r["y0"], zs), (r["x1"], r["y0"], zs),
             (r["x1"], r["y0"], r["z1"]), (r["x0"], r["y0"], r["z1"])],
            floor_mat,
            (0, 1, 0),
        ),
        # A ceiling is not in docs/adr/0004's list, and is here because the
        # camera needs it: on a phone it pulls back far enough to see 3.7 units
        # above itself, which is over the top of any wall a room would have.
        # It also catches the window's light, which is the best of it.
        deep(
            "Room.Ceiling",
            [(r["x0"], r["y1"], r["z0"]), (r["x1"], r["y1"], r["z0"]),
             (r["x1"], r["y1"], zs), (r["x0"], r["y1"], zs)],
            [(r["x0"], r["y1"], zs), (r["x1"], r["y1"], zs),
             (r["x1"], r["y1"], r["z1"]), (r["x0"], r["y1"], r["z1"])],
            ceil_mat,
            (0, -1, 0),
        ),
        deep(
            "Room.Wall.L",
            [(r["x0"], r["y0"], r["z0"]), (r["x0"], r["y0"], zs),
             (r["x0"], r["y1"], zs), (r["x0"], r["y1"], r["z0"])],
            [(r["x0"], r["y0"], zs), (r["x0"], r["y0"], r["z1"]),
             (r["x0"], r["y1"], r["z1"]), (r["x0"], r["y1"], zs)],
            wall_mat,
            (1, 0, 0),
        ),
        deep(
            "Room.Wall.R",
            [(r["x1"], r["y0"], r["z0"]), (r["x1"], r["y0"], zs),
             (r["x1"], r["y1"], zs), (r["x1"], r["y1"], r["z0"])],
            [(r["x1"], r["y0"], zs), (r["x1"], r["y0"], r["z1"]),
             (r["x1"], r["y1"], r["z1"]), (r["x1"], r["y1"], zs)],
            wall_mat,
            (-1, 0, 0),
        ),
    ]

    parts += build_window(wall_mat, trim_mat)

    # The dressing, per docs/adr/0004. The desk goes under the window and the
    # pinboard on the other side of the carcass, so the back wall reads as one
    # arrangement rather than as a shelf with things scattered round it.
    lamp_metal = flat_material("LampMetal", (0.052, 0.047, 0.043), roughness=0.38)
    desk_oak = oak_material("DeskOak", scale=1.4)
    parts += build_lamp(
        "Lamp", LAMP, FLOOR_Y, lamp_metal, emission_material("LampShade", (1.0, 0.78, 0.52), 1.4)
    )
    parts += build_desk(desk_oak)
    parts += build_lamp(
        "DeskLamp",
        DESK_LAMP,
        FLOOR_Y + DESK["height"],
        lamp_metal,
        emission_material("DeskShade", (1.0, 0.80, 0.56), 1.1),
    )
    parts += build_desk_things(
        # Aluminium, not the near-black slab the closed one was. An Air is a
        # light machine and at this hour it is the one thing on the desk that
        # catches the lamp.
        flat_material("Laptop", (0.225, 0.230, 0.240), roughness=0.30),
        flat_material("LaptopKeys", (0.055, 0.057, 0.060), roughness=0.55),
        emission_material("LaptopScreen", (0.62, 0.72, 0.92), 0.55),
        flat_material("Pot", (0.155, 0.085, 0.055), roughness=0.78),
        flat_material("Leaf", (0.042, 0.098, 0.048), roughness=0.68),
    )
    parts += build_pinboard(
        flat_material("Cork", (0.20, 0.125, 0.065), roughness=0.90),
        flat_material("Pinned", (0.60, 0.58, 0.54), roughness=0.92),
    )

    # The second round of dressing: see the constants at the top of the file.
    frame_mat = flat_material("Frame", (0.030, 0.026, 0.022), roughness=0.45)
    mount_mat = flat_material("Mount", (0.78, 0.76, 0.71), roughness=0.92)
    leaf_mat = flat_material("BroadLeaf", (0.028, 0.085, 0.036), roughness=0.42)
    planter = flat_material("Planter", (0.56, 0.53, 0.48), roughness=0.62)
    parts += build_rug()
    parts += build_console(
        oak_material("ConsoleOak", scale=1.3),
        flat_material("Steel", (0.42, 0.42, 0.43), roughness=0.34),
        flat_material("Vinyl", (0.012, 0.012, 0.013), roughness=0.24),
        flat_material("RecordLabel", (0.42, 0.115, 0.05), roughness=0.7),
        flat_material("Plinth", (0.035, 0.028, 0.022), roughness=0.36),
        [
            flat_material(f"Sleeve.{i}", c, roughness=0.8)
            for i, c in enumerate(
                ((0.50, 0.44, 0.34), (0.30, 0.09, 0.05), (0.04, 0.10, 0.07), (0.08, 0.10, 0.16),
                 (0.52, 0.36, 0.10), (0.03, 0.03, 0.03), (0.40, 0.38, 0.36))
            )
        ],
    )
    parts += build_board_games()
    for spec in PRINTS:
        parts += build_print(
            f"Print.{spec['art']}", spec["x"], spec["y"] - spec["h"] / 2, ROOM["back"],
            spec["w"], spec["h"], spec["art"], frame_mat, mount_mat,
        )
    parts += build_floor_plant(
        planter,
        flat_material("Soil", (0.030, 0.022, 0.016), roughness=0.95),
        flat_material("Stalk", (0.060, 0.050, 0.030), roughness=0.7),
        leaf_mat,
    )
    parts += build_chair(oak_material("ChairOak", base=(0.070, 0.042, 0.024), light=(0.20, 0.125, 0.07), scale=1.6))
    parts += build_top_dressing(frame_mat, mount_mat, planter, leaf_mat)
    parts += build_bust(flat_material("Marble", (0.66, 0.64, 0.60), roughness=0.42))

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


def shade_glow(name, spec, stand_on, energy, colour, shade):
    """
    The light a lamp's shade lets through sideways: a soft point light at the
    bulb that the shade casts no shadow for. Everything else still does.
    """
    bpy.ops.object.light_add(
        type="POINT", location=(spec["x"], -spec["z"], lamp_bulb_y(spec, stand_on))
    )
    glow = bpy.context.active_object
    glow.name = name
    glow.data.energy = energy
    glow.data.color = colour
    # As wide as the shade, so what it throws is as soft as a glowing drum's.
    glow.data.shadow_soft_size = spec["shade_r"]

    blocker = bpy.data.objects.get(shade)
    if blocker is not None:
        # A blocker collection holding only excluded objects means "everything
        # casts shadow for this light except these".
        group = bpy.data.collections.new(f"{name}.Unblocked")
        group.objects.link(blocker)
        glow.light_linking.blocker_collection = group
        for item in group.collection_objects:
            item.light_linking.link_state = "EXCLUDE"
    return glow


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
        location=(LAMP["x"], -LAMP["z"], lamp_bulb_y(LAMP, FLOOR_Y)),
    )
    bulb = bpy.context.active_object
    bulb.name = "Bulb"
    bulb.data.energy = 72
    bulb.data.color = (1.0, 0.76, 0.50)
    bulb.data.shadow_soft_size = 0.05

    # What comes through the shade. A linen drum is not opaque: it passes a
    # soft warm light sideways, and that sideways light is what falls on the
    # Spines. Without it the Books at rest are lit by bounce alone and the
    # Shelf, which is the point of the room, is the darkest thing in it. That
    # did not show while the Books were lit live, because the site gave them a
    # key light of their own from this side; baked, they get what the room
    # actually has, so the room has to actually have it.
    #
    # A second light at the bulb, which the shade does not block. The bulb
    # itself still is blocked, so the cones up and down that say "shade" stay.
    shade_glow("ShadeGlow", LAMP, FLOOR_Y, energy=28, colour=(1.0, 0.80, 0.56), shade="Room.Lamp.Shade")

    # The desk lamp. Much smaller than the floor lamp and much closer to what
    # it lights, so it needs a fraction of the energy to make a pool of the
    # same strength.
    bpy.ops.object.light_add(
        type="POINT",
        location=(DESK_LAMP["x"], -DESK_LAMP["z"], lamp_bulb_y(DESK_LAMP, FLOOR_Y + DESK["height"])),
    )
    desk_bulb = bpy.context.active_object
    desk_bulb.name = "DeskBulb"
    # Down from 20. The lamp stands a third of a metre from the left wall and
    # at 20, and then at 12, it burned a white hole in it, which the atlas
    # cannot roll off. Judged from the Desk view in the browser, where the
    # wall beside it is a quarter of the frame.
    desk_bulb.data.energy = 8
    desk_bulb.data.color = (1.0, 0.78, 0.54)
    desk_bulb.data.shadow_soft_size = 0.035
    shade_glow(
        "DeskShadeGlow", DESK_LAMP, FLOOR_Y + DESK["height"], energy=2.4, colour=(1.0, 0.82, 0.60),
        shade="Room.DeskLamp.Shade",
    )

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
    # The Console view, as Scene.tsx composes it, and a close look at what
    # stands on top of the carcass.
    "console": ((0.9, -1.65, -0.40), (1.5, 0.30, -0.68), {"fov": 42}),
    "top": ((0.50, -1.25, 1.42), (0.64, -0.10, 1.40), {"fov": 42}),
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


def use_gpu():
    """
    Render and bake on the graphics card where there is one.

    Opt in, with --gpu. Cycles defaults to the CPU, and the room atlas at 4096
    is most of an hour there, so this was written expecting Metal to be the
    answer. On the M1 it was written on it is not: seven GPU cores rendered a
    preview four times slower than eight CPU ones. A machine with a real
    graphics card will see it the other way round, which is why it stays.
    """
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            found = [d for d in prefs.devices if d.type == kind]
            if found:
                for d in prefs.devices:
                    d.use = d.type == kind
                bpy.context.scene.cycles.device = "GPU"
                print(f"[shelf] Cycles on {kind}: {', '.join(d.name for d in found)}")
                return True
    except Exception as err:  # no Cycles add-on, or a build without GPU support
        print(f"[shelf] no GPU for Cycles ({err}); using the CPU")
    return False


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

    # Surfaces that run the depth of the room spend fewer texels past
    # SQUEEZE["from_z"], where only a phone pulled right back ever looks. The
    # mesh has an edge exactly there, so the map is linear on each face and
    # still continuous across the join: one island, two densities, no seam.
    squeeze = bool(obj.get("squeeze"))
    edge = -SQUEEZE["from_z"]  # Blender Y is the site's -Z

    def place(co, axis):
        value = co[axis]
        if squeeze and axis == 1 and value < edge:
            value = edge + (value - edge) * SQUEEZE["by"]
        return value

    scale = obj.get("uv_scale", 1.0)
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = (place(co, axes[0]) * scale, place(co, axes[1]) * scale)


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


def shelf_pack_uvs(parts, gap=0.015):
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
    atlas too (bake_combined uses 0.5%). At 1.5% the islands sit about 31
    texels apart at 2048 against a 10 texel margin, so nothing bleeds.

    Both numbers came down when the dressing landed: 35 islands at the old 3%
    gap spread the room over 25 units of atlas, about 82 texels to the unit,
    and a sheet of paper pinned to the board was nine texels across and read
    as a pebble. A 10 texel margin is still three mip levels deep, which is
    all it has to be for a texture drawn at roughly its own size.
    """
    items = [[obj, *island_bounds(obj)] for obj in parts]
    items.sort(key=lambda i: -i[4])  # tallest first

    def attempt(side):
        padding = gap * side
        placed = []
        x = y = row_h = 0.0
        for obj, u0, v0, w, h in items:
            if x + w + padding > side and x > 0:
                x = 0.0
                y += row_h + padding
                row_h = 0.0
            if y + h + padding > side:
                return None
            placed.append((obj, u0, v0, x + padding / 2, y + padding / 2))
            x += w + padding
            row_h = max(row_h, h)
        return placed

    # Grow until it fits, then narrow back down. Growing alone overshoots by
    # up to the growth step, and every wasted percent of the side is texel
    # density the room does not get: the atlas is one fixed image however
    # little of it the islands use.
    side = math.sqrt(sum(w * h for _, _, _, w, h in items)) * 1.1
    while attempt(side) is None:
        side *= 1.15
    lo, hi = side / 1.15, side
    for _ in range(14):
        mid = (lo + hi) / 2
        if attempt(mid) is None:
            lo = mid
        else:
            hi = mid
    side = hi
    placed = attempt(side)

    for obj, u0, v0, px, py in placed:
        uv = obj.data.uv_layers.active
        for d in uv.data:
            d.uv = ((d.uv[0] - u0 + px) / side, (d.uv[1] - v0 + py) / side)
    print(f"[shelf] packed {len(placed)} islands into {side:.2f} units of atlas")


def unwrap_all(parts, margin=0.004, planar=False, gap=0.015):
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

    # One object at a time. Unwrapped together, smart_project scatters each
    # object's islands across the 0-1 square all of them share, so an object's
    # bounding box is the whole square however small the object is. That was
    # harmless with three lamp cylinders and ruinous with a hundred leaves,
    # sleeves and chair legs: every one of them claimed a twelve-unit cell and
    # the room fell to seven texels to the unit. On its own, an object's
    # islands are packed against each other and its box is about its own size.
    for obj in curved:
        select([obj])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        # A scanned surface breaks into hundreds of small islands. Left at the
        # usual spacing, the gaps between them are wider than the bake's
        # margin fills, and the unbaked black in them bleeds into every edge
        # once the texture is drawn small: dark seams across a face. So an
        # object that asks for it is cut into fewer islands, set close.
        tight = bool(obj.get("uv_tight"))
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(80 if tight else 66),
            island_margin=0.005 if tight else 0.03,
        )
        bpy.ops.object.mode_set(mode="OBJECT")
        # Then onto the same world-unit scale as the flat panels, so the
        # packer treats everything alike and the texel density comes out even.
        to_world_scale(obj)
        # Unless it asks for more than its share, as the bust does.
        extra = obj.get("uv_scale", 1.0)
        if extra != 1.0:
            for d in obj.data.uv_layers.active.data:
                d.uv = (d.uv[0] * extra, d.uv[1] * extra)

    shelf_pack_uvs(parts, gap=gap)


def bake_combined(parts, path, size=2048, samples=64, margin=None, name="ShelfBake", reuse=False):
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
        margin = max(4, round(size * 0.005))

    # --reuse: take the atlas already on disk instead of baking it again. For
    # when a bake was cut short part way, or only the Books' light needs
    # redoing. It trusts that the unwrap is the same as the run that made the
    # file, which it is for as long as the script has not changed in between.
    if reuse and os.path.exists(path):
        print(f"[shelf] reusing {path}")
        return bpy.data.images.load(path)

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



# --------------------------------------------------------------------------
# the Books at rest, per docs/adr/0006
# --------------------------------------------------------------------------

# Top to bottom, as src/lib/shelf.ts stacks them.
SECTION_ORDER = ("Built for Myself", "Built for Work")

# Mirrors src/components/shelf/readBooks.ts and BookStack.tsx: bottom of the
# stack first, each in its dust jacket's ground. Each book is shaped to its
# cover, whose proportions come from src/content/room/books.json.
READ_BOOKS = (
    ("good-to-great", "#e5242a"),
    ("deep-work", "#f0c419"),
    ("gap-selling", "#d81f30"),
    ("atomic-habits", "#ede7e1"),
)
STACK = {"x": -2.08, "z": -0.16, "length": 0.42, "thickness": 0.046}


def read_book_aspects():
    """Each book on the desk's cover, width over height, by id."""
    path = os.path.join(os.path.dirname(__file__), "..", "src", "content", "room", "books.json")
    with open(path, encoding="utf-8") as fh:
        return {b["id"]: b["cover"]["width"] / b["cover"]["height"] for b in json.load(fh)}

# The second UV set every Book carries, and what the baked light is stored at.
LIGHT_UV = "Light"
# Light is stored at a quarter strength, so the top of a book right under the
# desk lamp still fits in eight bits; the site multiplies it back.
BOX_GAIN = 4.0


def read_projects():
    """
    Which Project stands in which slot, read from the content collection the
    same way src/lib/shelf.ts reads it: by Theme, newest first.

    The bake needs this because a Book at rest is lit by where it stands and
    by what stands next to it. A Project added after the last bake is simply
    not in the result, and the site lights that one live until the next.
    """
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "content", "work")
    entries = []
    for path in sorted(glob.glob(os.path.join(root, "*.md"))):
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        front = re.match(r"---\n(.*?)\n---", text, re.S)
        if not front:
            continue

        def field(key):
            found = re.search(rf'^{key}:\s*"?([^"\n]+?)"?\s*$', front.group(1), re.M)
            return found.group(1).strip() if found else None

        entries.append({"slug": field("slug"), "theme": field("theme"), "date": field("date") or ""})

    layout = []
    themes = [t for t in SECTION_ORDER if any(e["theme"] == t for e in entries)]
    for section, theme in enumerate(themes):
        run = sorted((e for e in entries if e["theme"] == theme), key=lambda e: e["date"], reverse=True)
        for slot, entry in enumerate(run[:SLOTS]):
            layout.append({"slug": entry["slug"], "theme": theme, "section": section, "slot": slot})
    return layout


def section_floor_y(index):
    """Matches sectionFloorY() in ShelfUnit.tsx."""
    return UNIT_HEIGHT / 2 - SHELF["plank"] - (index + 1) * SHELF["opening_height"] - index * SHELF["plank"]


def slot_x(index):
    """Matches slotX() in ShelfUnit.tsx."""
    return -SHELF["inner_width"] / 2 + SLOT / 2 + index * SLOT


def build_book_template():
    """
    The Book, finished: modifiers applied, and a second UV set unwrapped
    across all of it.

    The first set is the printing, 0-1 on the Cover and the Spine, and several
    faces share it. Light cannot share: every face needs its own place in the
    map. So the whole Book is unwrapped again into one square, and that square
    becomes one tile of the baked light per Book.

    Modifiers are applied first so the unwrap sees the chamfers. Unwrapped
    before, the bevel would stretch each 3.5mm strip between two islands and
    sample light from somewhere else entirely.
    """
    parts = build_book()
    for obj in parts:
        select([obj])
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        obj.data.uv_layers[0].active_render = True
        light = obj.data.uv_layers.new(name=LIGHT_UV)
        obj.data.uv_layers.active = light

    select(parts)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    # A wide margin: tiles sit edge to edge in the atlas, and this is the only
    # thing keeping one Book's light out of the next one's.
    bpy.ops.uv.pack_islands(margin=0.035, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    for obj in parts:
        obj.data.uv_layers.active = obj.data.uv_layers[0]
    bpy.context.view_layer.update()
    return parts


def theme_cloth(theme, slug):
    """Near enough the cloth covers.ts paints, for what it bounces."""
    base = "#14110C" if theme == "Built for Work" else "#1E7A4D"
    ink = srgb("#14110C")
    return tuple(a + (b - a) * 0.23 for a, b in zip(srgb(base), ink))


def place_books(template, layout):
    """
    Stand a copy of the Book in every slot a Project occupies, and lay the
    four read books on the desk.

    They are here to be lit, and to throw shadow and colour on the carcass and
    the desk while those bake. None of them is exported: the site has its own
    Book and only wants the light.

    Returns the objects and, for each Book, the tile of the atlas its light
    is in.
    """
    to_blender = Matrix.Rotation(math.pi / 2, 4, "X")  # site (x, y, z) -> (x, -z, y)
    to_site = to_blender.inverted()

    count = len(layout) + len(READ_BOOKS)
    grid = max(2, math.ceil(math.sqrt(count)))
    objs = []
    manifest = {"gain": BOX_GAIN, "grid": grid, "boxes": [], "stack": []}

    def tile_for(index):
        col, row = index % grid, index // grid
        # In glTF's UV space, where V runs down: see docs/adr/0006.
        return col, row, [col / grid, (grid - 1 - row) / grid, 1 / grid]

    def instance(tag, site_matrix, colour, index):
        world = to_blender @ site_matrix @ to_site
        cloth = cloth_material(f"Cloth.{tag}", colour=colour)
        col, row, tile = tile_for(index)
        for part in template:
            dup = part.copy()
            dup.data = part.data.copy()
            dup.name = f"Box.{tag}.{part.name}"
            bpy.context.collection.objects.link(dup)
            dup.matrix_world = world @ part.matrix_world
            for i, mat in enumerate(dup.data.materials):
                if mat.name.split(".")[0] in ("BookCloth", "BookCover", "BookSpine"):
                    dup.data.materials[i] = cloth
            uv = dup.data.uv_layers[LIGHT_UV]
            for d in uv.data:
                d.uv = ((col + d.uv[0]) / grid, (row + d.uv[1]) / grid)
            objs.append(dup)
        return tile

    index = 0
    for entry in layout:
        at = Matrix.Translation(
            (slot_x(entry["slot"]), section_floor_y(entry["section"]) + BOX["height"] / 2, 0)
        )
        tile = instance(f"{entry['section']}.{entry['slot']}", at, theme_cloth(entry["theme"], entry["slug"]), index)
        manifest["boxes"].append(
            {"slug": entry["slug"], "section": entry["section"], "slot": entry["slot"], "tile": tile}
        )
        index += 1

    desk_top = FLOOR_Y + DESK["height"]
    # Front cover up and head to the left, as BookStack.tsx lays them. The
    # printed face of the board is the cover's proportions; the widest book
    # sets where the spines line up.
    aspects = read_book_aspects()
    cover_span = BOX["width"] - SPINE_ROUND - GROOVE
    depth_scale = {book: STACK["length"] * aspects[book] / cover_span for book, _ in READ_BOOKS}
    deepest = max(BOX["width"] * d for d in depth_scale.values())
    on_side = Matrix.Rotation(math.pi / 2, 4, "Z")
    for i, (book, colour) in enumerate(READ_BOOKS):
        scale = Matrix.Diagonal(
            (STACK["thickness"] / BOX["thickness"], STACK["length"] / BOX["height"], depth_scale[book], 1)
        )
        yaw = (((i * 37) % 11) - 5) * 0.012
        set_back = (deepest - BOX["width"] * depth_scale[book]) / 2
        at = (
            Matrix.Translation((STACK["x"], desk_top + STACK["thickness"] * (i + 0.5), STACK["z"] + set_back))
            @ Matrix.Rotation(yaw, 4, "Y")
            @ on_side
            @ scale
        )
        manifest["stack"].append(instance(f"Stack.{i}", at, srgb(colour), index))
        index += 1

    bpy.context.view_layer.update()
    return objs, manifest


def bake_box_light(objs, path, grid, size=2048, samples=64):
    """
    Bake the light falling on every Book at rest, without its colour.

    Not COMBINED, which is what the room gets. A Book's colour is printed in
    the browser, per Project, so what is stored here is only how much light
    reaches each point of it: the site multiplies that by the printing. The
    same light map serves whatever is printed on the Book, which is the thing
    a combined bake could not do.
    """
    image = bpy.data.images.new("BoxLight", width=size, height=size, alpha=False, float_buffer=True)
    seen = set()
    for obj in objs:
        for slot in obj.material_slots:
            mat = slot.material
            if mat.name in seen:
                continue
            seen.add(mat.name)
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = image
            tex.select = True
            mat.node_tree.nodes.active = tex

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    bake = scene.render.bake
    bake.use_selected_to_active = False
    bake.use_clear = True
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False
    # Under the 3.5% the template's islands were packed with, per tile.
    margin = max(2, round(size / grid * 0.012))
    bake.margin = margin

    select(objs)
    print(f"[shelf] baking light on {len(objs)} Book parts to {size}x{size} at {samples} samples ...")
    bpy.ops.object.bake(
        type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer=LIGHT_UV, margin=margin, use_clear=True
    )

    import numpy as np

    raw = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(raw)
    light = raw.reshape(-1, 4)[:, :3] / BOX_GAIN
    lit = light.max(axis=1) > 0
    clipped = float((light[lit].max(axis=1) > 1).mean()) if lit.any() else 0.0
    print(f"[shelf] Book light: {clipped:.2%} of lit texels over the top of the range")
    light = np.clip(light, 0, 1)

    # Smooth it. Cycles denoises a combined bake and not this one, and at any
    # sample count worth waiting for the result is speckled: every texel a
    # slightly different brightness from the one beside it, which on a Spine
    # reads as glitter. Light on a Book is a slow gradient with no detail in
    # it, so a few texels of blur costs nothing true. Only lit texels are
    # averaged, and each by how many lit neighbours it had, so an island's
    # edge is not dragged towards the black between islands.
    def box(a, r):
        pad = np.pad(a, ((r + 1, r), (r + 1, r), (0, 0)), mode="edge")
        c = pad.cumsum(axis=0).cumsum(axis=1)
        n = 2 * r + 1
        return c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]

    grid = light.reshape(size, size, 3).astype(np.float64)
    mask = lit.reshape(size, size, 1).astype(np.float64)
    for _ in range(3):
        weight = box(mask, 2)
        grid = np.where(mask > 0, box(grid * mask, 2) / np.maximum(weight, 1e-9), grid)
    light = grid.reshape(-1, 3).astype(np.float32)

    encoded = np.where(light <= 0.0031308, light * 12.92, 1.055 * np.power(light, 1 / 2.4) - 0.055)

    out = bpy.data.images.new("BoxLightOut", width=size, height=size, alpha=False)
    pixels = np.ones((size * size, 4), dtype=np.float32)
    pixels[:, :3] = encoded
    out.pixels.foreach_set(pixels.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    print(f"[shelf] wrote {path}")
    return out


def show_baked_books(objs, image):
    """
    The Books as the site will draw them at rest: their own colour times the
    baked light, and nothing else. The other half of show_baked().
    """
    made = {}
    for obj in objs:
        for i, mat in enumerate(obj.data.materials):
            if mat.name not in made:
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                colour = tuple(bsdf.inputs["Base Color"].default_value) if bsdf else (0.5, 0.5, 0.5, 1)
                shown = bpy.data.materials.new(f"Shown.{mat.name}")
                shown.use_nodes = True
                nt = shown.node_tree
                nt.nodes.clear()
                out = nt.nodes.new("ShaderNodeOutputMaterial")
                emit = nt.nodes.new("ShaderNodeEmission")
                emit.inputs["Strength"].default_value = BOX_GAIN
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = LIGHT_UV
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = image
                tint = nt.nodes.new("ShaderNodeMix")
                tint.data_type = "RGBA"
                tint.blend_type = "MULTIPLY"
                tint.inputs["Factor"].default_value = 1.0
                tint.inputs["B"].default_value = colour
                nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
                nt.links.new(tex.outputs["Color"], tint.inputs["A"])
                nt.links.new(tint.outputs["Result"], emit.inputs["Color"])
                nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
                made[mat.name] = shown
            obj.data.materials[i] = made[mat.name]


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
    ap.add_argument("--room-size", type=int, help="the room atlas, if not --bake-size")
    ap.add_argument("--bake-boxes", help="bake the light on the Books at rest to this PNG")
    ap.add_argument("--box-size", type=int, default=2048)
    ap.add_argument("--box-samples", type=int, help="samples for the Books' light, if not --bake-samples")
    ap.add_argument("--boxes-manifest", help="where to write which Book is in which tile")
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
    ap.add_argument("--reuse", action="store_true", help="keep any atlas already on disk: see bake_combined()")
    ap.add_argument("--gpu", action="store_true", help="bake on the graphics card: see use_gpu()")
    ap.add_argument(
        "--standard",
        action="store_true",
        help="render --render through the Standard view, as the atlas will be seen, not AgX",
    )
    args = ap.parse_args(argv)

    clear_scene()
    if args.gpu:
        use_gpu()

    if args.cloth_bake:
        bake_cloth_normal(args.cloth_bake, size=args.cloth_size, threads=args.cloth_threads)
        return

    baking = bool(args.bake or args.show_baked or args.export or args.bake_boxes)

    if args.book_export and not (baking or args.render):
        export_glb(build_book_template(), args.book_export, materials="EXPORT")
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

    # The Books, standing where the Projects stand. Built from the same
    # template the site's own book.glb is exported from, in the same run, so
    # the second UV set the light is stored at cannot drift between the two.
    template = build_book_template()
    if args.book_export:
        export_glb(template, args.book_export, materials="EXPORT")
    books, manifest = place_books(template, read_projects())
    select(template)
    bpy.ops.object.delete(use_global=False)

    setup_evening()
    setup_camera(args.view)
    setup_render(width=args.width, height=args.height, samples=args.samples)

    print(f"[shelf] carcass {OUTER_WIDTH:.3f} x {UNIT_HEIGHT:.3f} x {SHELF['depth']:.3f}")

    if args.render:
        if args.standard:
            standard_view()
        bpy.context.scene.render.filepath = args.render
        bpy.ops.render.render(write_still=True)
        print(f"[shelf] wrote {args.render}")

    if baking:
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
            reuse=args.reuse,
        )

        # The glass is seen by the camera only, and the site draws what is
        # outside the window itself, so it takes no part in the bake or the
        # export. It stays in the scene for the previews.
        fixed = [obj for obj in room if obj.name != "Room.Glass"]
        # A tighter gap than the default, and a margin to match. A hundred
        # islands at 1.5% of the side each was a quarter of the atlas spent on
        # the space between them; at 4096 the 0.2% margin is still eight
        # texels, three mip levels, which is all a margin is for.
        room_size = args.room_size or args.bake_size
        unwrap_all(fixed, margin=0.01, planar=True, gap=0.006)
        room_img = bake_combined(
            fixed,
            args.bake_room or "/tmp/room-bake.png",
            size=room_size,
            samples=args.bake_samples,
            margin=max(3, round(room_size * 0.002)),
            name="RoomBake",
            reuse=args.reuse,
        )

        box_img = None
        if args.bake_boxes:
            box_img = bake_box_light(
                books, args.bake_boxes, manifest["grid"], size=args.box_size,
                samples=args.box_samples or args.bake_samples,
            )
            manifest_path = args.boxes_manifest or os.path.splitext(args.bake_boxes)[0] + ".json"
            with open(manifest_path, "w", encoding="utf-8") as fh:
                json.dump(manifest, fh, indent=2)
                fh.write("\n")
            print(f"[shelf] wrote {manifest_path}")

        carcass = join_carcass(parts)
        carcass.name = "Carcass"

        if args.export:
            export_glb([carcass, *fixed], args.export)

        if args.show_baked:
            show_baked(carcass, carcass_img)
            for obj in fixed:
                show_baked(obj, room_img)
            if box_img is not None:
                show_baked_books(books, box_img)
            standard_view()
            bpy.context.scene.render.filepath = args.show_baked
            bpy.ops.render.render(write_still=True)
            print(f"[shelf] wrote {args.show_baked}")


if __name__ == "__main__":
    main()
