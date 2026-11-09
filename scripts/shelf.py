"""
Builds the Shelf in Blender, from a script.

This file is the source of truth for the model. The .glb and its baked textures
are build artifacts. See docs/adr/0003.

    # render a preview
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/shelf.py -- --render build/shelf-preview.png

Dimensions come from the site: a Box is 0.2 x 1.0 x 0.82 scene units, and the
carcass is sized around six of them. Those numbers are repeated in
src/components/shelf/Box.tsx and ShelfUnit.tsx; they have to agree, so they are
named here rather than left as literals.
"""

import argparse
import math
import sys

import bpy
from mathutils import Vector

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


def build_room():
    """
    Floor and wall, sized for what the camera sees rather than stretching to
    the horizon. A 24m plane baked into an atlas spends nearly all its texels
    on emptiness; 8m gives the shadow somewhere to land at a density that holds
    up. The site fades the far edges to the page colour with fog.
    """
    floor_mat = flat_material("Floor", (0.52, 0.46, 0.38), roughness=0.75)
    wall_mat = flat_material("Wall", (0.78, 0.75, 0.70), roughness=0.95)

    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 1.2, FLOOR_Y))
    floor = bpy.context.active_object
    floor.name = "Room.Floor"
    floor.data.materials.append(floor_mat)

    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, SHELF["depth"] / 2 + 0.06, FLOOR_Y + 3.2))
    wall = bpy.context.active_object
    wall.name = "Room.Wall"
    wall.rotation_euler = (math.radians(90), 0, 0)
    wall.scale = (1.0, 0.8, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    wall.data.materials.append(wall_mat)

    return [floor, wall]


def setup_daylight():
    """One strong soft key standing in for a window, plus sky fill."""
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.58, 0.66, 0.78, 1)
    bg.inputs["Strength"].default_value = 0.65

    # The window: a large area light to camera-left, which gives the long soft
    # shadows that say "room" rather than "studio".
    bpy.ops.object.light_add(type="AREA", location=(-2.6, -2.2, 1.6))
    key = bpy.context.active_object
    key.name = "Window"
    key.data.shape = "RECTANGLE"
    key.data.size = 1.9
    key.data.size_y = 1.5
    key.data.energy = 520
    key.data.color = (1.0, 0.96, 0.9)
    direction = Vector((0.4, 1.0, -0.25)).normalized()
    key.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    # A low warm bounce off the floor, so the undersides are not dead.
    bpy.ops.object.light_add(type="AREA", location=(1.4, -1.6, FLOOR_Y + 0.35))
    bounce = bpy.context.active_object
    bounce.name = "Bounce"
    bounce.data.size = 3.0
    bounce.data.energy = 40
    bounce.data.color = (1.0, 0.88, 0.74)
    bounce.rotation_euler = (math.radians(-70), 0, math.radians(20))


def setup_camera():
    bpy.ops.object.camera_add(location=(1.15, -5.3, 0.55))
    cam = bpy.context.active_object
    cam.name = "Camera"
    cam.data.lens = 50
    target = Vector((0, 0, -0.12))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
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


def unwrap_all(parts, margin=0.004):
    """Unwrap every board in one multi-object edit, so the islands of all of
    them are packed into a single shared UV space ready for one atlas."""
    select(parts)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)

    # smart_project packs each object into 0-1 on its own, so across several
    # objects the islands land on top of each other and bake over one another.
    # Repacking everything together is what makes a shared atlas actually
    # shared. average_islands_scale first, so a 45mm board edge does not get
    # the same texel budget as a whole shelf face.
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=0.02, rotate=True)

    bpy.ops.object.mode_set(mode="OBJECT")


def bake_combined(parts, path, size=2048, samples=64, margin=24, name="ShelfBake"):
    """
    Bake the lit result into one texture.

    COMBINED means the image carries direct light, bounced light and the
    occlusion in the corners. The browser then draws it unlit and gets the
    Cycles result for the cost of one texture lookup. This is the whole bet in
    ADR 0003, and the reason the Shelf can look rendered without being rendered.
    """
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


def export_glb(objs, path):
    """
    Export geometry and UVs only. The baked atlas is loaded separately by the
    site and applied as an unlit material there, which keeps it a WebP (84KB)
    rather than whatever the glTF exporter would embed (PNG, 2MB).

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
        export_materials="NONE",
        export_normals=True,
        export_texcoords=True,
        export_yup=True,
    )
    print(f"[shelf] wrote {path}")



# --------------------------------------------------------------------------
# the Box
# --------------------------------------------------------------------------

# A board game box is a tray with a lid over it. The lid is a little larger all
# round, which is what gives the seam you can see across every real box, and
# what stops it reading as a solid brick.
LID_FRACTION = 0.34
LID_OVERSIZE = 0.006
BOX_BEVEL = 0.009


def card_material(name, colour=(0.62, 0.58, 0.52)):
    """Printed board, slightly soft. Not paper, not plastic."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.68
    return mat


def build_box():
    """
    One Box, which every Project reuses. ADR 0001 ruled out modelled Boxes
    because a hand-authored one means opening Blender to add a Project. One
    scripted box that every Project is printed onto does not have that problem:
    the Cover and Spine are still painted per-Project in the browser.

    Modelled standing as it sits on the Shelf, lid upward, so the lift in
    Box.tsx still reads as taking the lid off.
    """
    card = card_material("BoxCard")

    lid_h = BOX["height"] * LID_FRACTION
    base_h = BOX["height"] - lid_h

    base = board(
        "Box.Base",
        (BOX["thickness"], base_h, BOX["width"]),
        (0, -BOX["height"] / 2 + base_h / 2, 0),
        card,
    )

    lid = board(
        "Box.Lid",
        (
            BOX["thickness"] + LID_OVERSIZE,
            lid_h,
            BOX["width"] + LID_OVERSIZE,
        ),
        (0, BOX["height"] / 2 - lid_h / 2, 0),
        card,
    )

    for obj in (base, lid):
        for mod in obj.modifiers:
            if mod.type == "BEVEL":
                # Softer than the carcass: printed board rolls over at an edge
                # rather than taking a planed arris.
                mod.width = BOX_BEVEL
                mod.segments = 3

    return [base, lid]


def setup_box_camera(centre_z=0.0):
    """Three-quarter view, far enough back to see the whole box."""
    bpy.ops.object.camera_add(location=(1.05, -2.9, centre_z + 0.32))
    cam = bpy.context.active_object
    cam.name = "BoxCamera"
    cam.data.lens = 55
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
    ap.add_argument("--bake-samples", type=int, default=64)
    ap.add_argument("--show-baked", help="render the baked texture unlit, to this PNG")
    ap.add_argument("--export", help="write the .glb here")
    ap.add_argument("--bake-room", help="bake the room to this PNG")
    ap.add_argument("--box-render", help="render one Box on its own, to this PNG")
    ap.add_argument("--samples", type=int, default=160)
    args = ap.parse_args(argv)

    clear_scene()

    if args.box_render:
        box = build_box()
        # Stand it on the floor rather than leaving it in mid-air, so it has a
        # contact shadow to be judged by.
        drop = FLOOR_Y + BOX["height"] / 2
        for obj in box:
            obj.location.z += drop
        build_room()
        setup_daylight()
        setup_box_camera(centre_z=drop)
        setup_render(samples=args.samples)
        bpy.context.scene.render.filepath = args.box_render
        bpy.ops.render.render(write_still=True)
        print(f"[box] wrote {args.box_render}")
        return

    parts = build_carcass()
    room = build_room()
    setup_daylight()
    setup_camera()
    setup_render(samples=args.samples)

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

        unwrap_all(room, margin=0.01)
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
            bpy.context.scene.render.filepath = args.show_baked
            bpy.ops.render.render(write_still=True)
            print(f"[shelf] wrote {args.show_baked}")


if __name__ == "__main__":
    main()
