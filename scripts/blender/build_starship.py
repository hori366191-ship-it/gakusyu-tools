"""Build the educational Starship comparison model with Blender 5.3.

This is an original educational approximation, not real CAD.  Blender uses Z-up;
the glTF exporter converts the scene to Y-up, so Ship starts at Y=71 in Three.js
and the nose reaches Y=121.  No external textures or add-ons are required.

Run from the repository root:
    blender --background --python scripts/blender/build_starship.py

Outputs:
    その他/frontier-atlas-blender/models/starship-blender.blend
    その他/frontier-atlas-blender/models/starship-blender.glb
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

BODY_RADIUS = 4.5
BOOSTER_HEIGHT = 71.0
SHIP_HEIGHT = 50.0
SHIP_BASE = BOOSTER_HEIGHT
TOTAL_HEIGHT = BOOSTER_HEIGHT + SHIP_HEIGHT
TAU = math.tau
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "その他" / "frontier-atlas-blender" / "models"
BLEND_PATH = OUTPUT_DIR / "starship-blender.blend"
GLB_PATH = OUTPUT_DIR / "starship-blender.glb"
COLLECTION_NAME = "Starship_Comparison"

# Mirrors その他/frontier-atlas/starship-model-spec.mjs.
FLAP_LAYOUT = {
    "aft": {
        "height": 6.4,
        "extension": 1.86,
        "thickness": 0.17,
        "y": 9.3,
        "mount_radius": BODY_RADIUS + 0.02,
        "hinge_tilt": 0.0,
        "leeward_offset": 0.0,
        "angles": (0.0, 180.0),
        "bevel": 0.03,
    },
    "forward": {
        "height": 2.5,
        "extension": 1.22,
        "thickness": 0.10,
        "y": 23.2,
        "mount_radius": BODY_RADIUS - 0.12,
        "hinge_tilt": -0.24,
        "leeward_offset": -0.38,
        "angles": (20.0, 160.0),
        "bevel": 0.018,
    },
}


def linear_color(hex_color: str) -> tuple[float, float, float, float]:
    value = hex_color.lstrip("#")
    srgb = [int(value[index:index + 2], 16) / 255.0 for index in (0, 2, 4)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in srgb]
    return (*linear, 1.0)


def make_material(name: str, hex_color: str, metallic: float, roughness: float, double_sided: bool = False):
    material = bpy.data.materials.new(name)
    material.diffuse_color = linear_color(hex_color)
    material.use_backface_culling = not double_sided
    # Blender 5.3 creates a node tree for new materials; use_nodes is deprecated.
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        raise RuntimeError(f"Principled BSDF is unavailable for material: {name}")
    shader.inputs["Base Color"].default_value = linear_color(hex_color)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["IOR"].default_value = 1.45
    material["educational_pbr"] = True
    return material


class MeshBuilder:
    """Small UV-preserving mesh accumulator used for merged repeated parts."""

    def __init__(self, material, smooth: bool = False):
        self.material = material
        self.smooth = smooth
        self.vertices: list[tuple[float, float, float]] = []
        self.uvs: list[tuple[float, float]] = []
        self.faces: list[list[int]] = []

    def vertex(self, position, uv=(0.0, 0.0)) -> int:
        index = len(self.vertices)
        self.vertices.append(tuple(position))
        self.uvs.append(tuple(uv))
        return index

    def face(self, indices: list[int]) -> None:
        self.faces.append(indices)

    def add_lathe(self, profile, center=(0.0, 0.0, 0.0), segments=24, flip=False):
        """Revolve a top-to-bottom (radius, z-offset) profile around local Z."""
        rings = []
        for row, (radius, z_offset) in enumerate(profile):
            ring = []
            v = row / max(1, len(profile) - 1)
            for column in range(segments + 1):
                angle = column / segments * TAU
                u = column / segments
                ring.append(self.vertex((center[0] + radius * math.cos(angle), center[1] + radius * math.sin(angle), center[2] + z_offset), (u, v)))
            rings.append(ring)
        for row in range(len(profile) - 1):
            for column in range(segments):
                a = rings[row][column]
                b = rings[row][column + 1]
                c = rings[row + 1][column + 1]
                d = rings[row + 1][column]
                self.face([a, b, c, d] if flip else [a, d, c, b])

    def add_torus(self, major_radius, minor_radius, center=(0.0, 0.0, 0.0), major_segments=24, minor_segments=6):
        grid = []
        for major in range(major_segments + 1):
            u = major / major_segments
            angle = u * TAU
            row = []
            for minor in range(minor_segments + 1):
                v = minor / minor_segments
                tube = v * TAU
                radial = major_radius + minor_radius * math.cos(tube)
                row.append(self.vertex((center[0] + radial * math.cos(angle), center[1] + radial * math.sin(angle), center[2] + minor_radius * math.sin(tube)), (u, v)))
            grid.append(row)
        for major in range(major_segments):
            for minor in range(minor_segments):
                self.face([grid[major][minor], grid[major + 1][minor], grid[major + 1][minor + 1], grid[major][minor + 1]])

    def add_disc(self, radius, center=(0.0, 0.0, 0.0), segments=24, normal_down=False):
        center_index = self.vertex(center, (0.5, 0.5))
        ring = []
        for column in range(segments + 1):
            angle = column / segments * TAU
            x = math.cos(angle) * 0.5 + 0.5
            y = math.sin(angle) * 0.5 + 0.5
            ring.append(self.vertex((center[0] + radius * math.cos(angle), center[1] + radius * math.sin(angle), center[2]), (x, y)))
        for column in range(segments):
            face = [center_index, ring[column], ring[column + 1]]
            self.face(list(reversed(face)) if normal_down else face)

    def add_oriented_box(self, center, size, quaternion=None):
        rotation = quaternion.to_matrix() if quaternion is not None else Matrix.Identity(3)
        half = [value * 0.5 for value in size]
        corners = [
            (-half[0], -half[1], -half[2]), (half[0], -half[1], -half[2]),
            (half[0], half[1], -half[2]), (-half[0], half[1], -half[2]),
            (-half[0], -half[1], half[2]), (half[0], -half[1], half[2]),
            (half[0], half[1], half[2]), (-half[0], half[1], half[2]),
        ]
        transformed = [rotation @ Vector(corner) + Vector(center) for corner in corners]
        face_indices = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        face_uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for indices in face_indices:
            face = [self.vertex(transformed[index], face_uvs[corner]) for corner, index in enumerate(indices)]
            self.face(face)

    def add_extruded_polygon_xz(self, points, thickness):
        count = len(points)
        min_x = min(point[0] for point in points)
        max_x = max(point[0] for point in points)
        min_z = min(point[1] for point in points)
        max_z = max(point[1] for point in points)
        width = max(max_x - min_x, 0.001)
        height = max(max_z - min_z, 0.001)
        front = []
        back = []
        for x, z in points:
            uv = ((x - min_x) / width, (z - min_z) / height)
            front.append(self.vertex((x, -thickness * 0.5, z), uv))
            back.append(self.vertex((x, thickness * 0.5, z), uv))
        self.face(front)
        self.face(list(reversed(back)))
        for index in range(count):
            following = (index + 1) % count
            self.face([front[index], back[index], back[following], front[following]])

    def create(self, name, parent=None):
        mesh = bpy.data.meshes.new(f"{name}_Mesh")
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update(calc_edges=True)
        mesh.validate()
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for polygon in mesh.polygons:
            polygon.use_smooth = self.smooth
            for loop_index in polygon.loop_indices:
                vertex_index = mesh.loops[loop_index].vertex_index
                uv_layer.data[loop_index].uv = self.uvs[vertex_index]
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.parent = parent
        obj.data.materials.append(self.material)
        return obj


collection = None
materials = {}


def link_object(obj, parent=None):
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def empty(name, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.7
    return obj


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def add_bevel(obj, width=0.02, segments=1):
    modifier = obj.modifiers.new("Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(28)
    return modifier


def smooth_cylinder_sides(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = abs(polygon.normal.z) < 0.92


def cylinder(name, radius, depth, z, material, parent, vertices=64, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0.0, 0.0, z))
    obj = bpy.context.object
    obj.name = name
    link_object(obj, parent)
    obj.data.materials.append(material)
    smooth_cylinder_sides(obj)
    if bevel:
        add_bevel(obj, bevel, 1)
    return obj


def cone(name, radius_bottom, radius_top, depth, z, material, parent, vertices=64, bevel=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius_bottom, radius2=radius_top, depth=depth, location=(0.0, 0.0, z))
    obj = bpy.context.object
    obj.name = name
    link_object(obj, parent)
    obj.data.materials.append(material)
    smooth_cylinder_sides(obj)
    if bevel:
        add_bevel(obj, bevel, 1)
    return obj


def y_cylinder(name, radius, depth, location, material, parent, vertices=16, bevel=0.0):
    obj = cylinder(name, radius, depth, 0.0, material, parent, vertices=vertices, bevel=bevel)
    obj.location = location
    obj.rotation_euler.x = math.pi * 0.5
    return obj


def merged_rings(name, rings, parent, material):
    builder = MeshBuilder(material, smooth=True)
    for radius, z, thickness in rings:
        builder.add_torus(radius, thickness, (0.0, 0.0, z), major_segments=48, minor_segments=5)
    return builder.create(name, parent)


def beam_between(builder, start, end, thickness=0.1):
    a = Vector((start[0], 0.0, start[1]))
    b = Vector((end[0], 0.0, end[1]))
    direction = b - a
    length = direction.length
    if length <= 0.00001:
        return
    quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    builder.add_oriented_box((a + b) * 0.5, (thickness, 0.14, length), quaternion)


def make_grid_fin(index, angle_degrees, booster):
    root = empty(f"GridFin_{index}", booster)
    angle = math.radians(angle_degrees)
    root.location = (4.4 * math.cos(angle), 4.4 * math.sin(angle), 61.5)
    root.rotation_euler.z = angle
    root["angle_degrees"] = angle_degrees

    builder = MeshBuilder(materials["dark"])
    outline = [(0.0, -0.85), (2.35, -1.18), (2.62, -0.55), (2.38, 0.55), (0.0, 0.85)]
    for point_index, start in enumerate(outline):
        beam_between(builder, start, outline[(point_index + 1) % len(outline)], 0.13)
    for index_inner in range(1, 6):
        t = index_inner / 6
        x = 2.5 * t
        beam_between(builder, (x, -0.85 - 0.33 * t), (x, 0.85 - 0.3 * t), 0.065)
    for y in (-0.42, 0.05, 0.48):
        beam_between(builder, (0.12, y), (2.32, y - 0.12), 0.065)
    lattice = builder.create(f"GridFin_{index}_Lattice", root)
    add_bevel(lattice, 0.018, 1)
    hinge = y_cylinder(f"GridFin_{index}_Hinge", 0.14, 1.65, (0.06, 0.0, 0.0), materials["dark"], root, vertices=12, bevel=0.015)
    hinge["part"] = "grid-fin-hinge"
    return root


def flap_points(layout):
    height = layout["height"]
    extension = layout["extension"]
    points = [(0.0, -height * 0.5)]
    if layout["angles"] == FLAP_LAYOUT["aft"]["angles"]:
        end = (extension * 0.82, height * 0.34)
        control = (extension * 1.04, 0.0)
        start = (extension * 0.82, -height * 0.34)
    else:
        end = (extension * 0.78, height * 0.3)
        control = (extension * 1.04, -height * 0.08)
        start = (extension * 0.68, -height * 0.4)
    for step in range(1, 9):
        t = step / 8
        inverse = 1.0 - t
        points.append((inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0], inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1]))
    points.append((0.0, height * 0.5))
    return points


def make_flap(kind, suffix, angle_degrees, ship):
    layout = FLAP_LAYOUT[kind]
    name = f"{'Forward' if kind == 'forward' else 'Aft'}Flap_{suffix}"
    angle = math.radians(angle_degrees)
    radial = Vector((math.cos(angle), math.sin(angle), 0.0))
    tangent = Vector((-math.sin(angle), math.cos(angle), 0.0))
    # Three.js local -Z maps to Blender +Y after the Z-up -> Y-up export.
    tangent_offset = -layout["leeward_offset"]
    location = radial * layout["mount_radius"] + tangent * tangent_offset
    location.z = layout["y"]
    root = empty(name, ship, location)
    root.rotation_euler.z = angle
    root["kind"] = kind
    root["angle_degrees"] = angle_degrees

    axis = empty(f"{name}_Axis", root)
    axis.rotation_euler.y = -layout["hinge_tilt"]
    axis["hinge_tilt_degrees"] = math.degrees(-layout["hinge_tilt"])

    panel_builder = MeshBuilder(materials["black"])
    panel_builder.add_extruded_polygon_xz(flap_points(layout), layout["thickness"])
    panel = panel_builder.create(f"{name}_Panel", axis)
    add_bevel(panel, layout["bevel"], 1)
    panel["part"] = f"{kind}-flap"

    hinge = y_cylinder(f"{name}_Hinge", 0.11, layout["height"] * 0.72, (0.02, 0.0, 0.0), materials["ring"], axis, vertices=10, bevel=0.012)
    reinforcement_builder = MeshBuilder(materials["ring"])
    reinforcement_builder.add_oriented_box((0.2, 0.0, 0.0), (0.42, layout["thickness"] + 0.12, layout["height"] * 0.52))
    reinforcement = reinforcement_builder.create(f"{name}_Reinforcement", axis)
    add_bevel(reinforcement, 0.025, 1)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.3, location=(0.18, 0.0, 0.0))
    aerocover = bpy.context.object
    aerocover.name = f"{name}_Aerocover"
    link_object(aerocover, axis)
    aerocover.scale = (1.45, 0.72, layout["height"] * 0.36)
    aerocover.data.materials.append(materials["ring"])
    for polygon in aerocover.data.polygons:
        polygon.use_smooth = True
    return root


def engine_specs_booster():
    specs = []
    for index in range(20):
        angle = index / 20 * TAU
        specs.append((math.sin(angle) * 3.43, -math.cos(angle) * 3.43, 0.61, 2.45, "outer"))
    specs.append((0.0, 0.0, 0.73, 2.65, "center"))
    for radius, count in ((1.42, 6), (2.58, 6)):
        for index in range(count):
            angle = index / count * TAU + math.pi / 6
            specs.append((math.sin(angle) * radius, -math.cos(angle) * radius, 0.73, 2.65, "inner"))
    return specs


def engine_specs_ship():
    specs = []
    for index in range(3):
        angle = index / 3 * TAU
        specs.append((math.sin(angle) * 2.72, -math.cos(angle) * 2.72, 1.08, 3.12, "vacuum"))
    for index in range(3):
        angle = index / 3 * TAU + math.pi / 3
        specs.append((math.sin(angle) * 1.35, -math.cos(angle) * 1.35, 0.66, 2.4, "sea-level"))
    return specs


def make_engines(name, deck_z, specs, parent):
    root = empty(name, parent, (0.0, 0.0, deck_z))
    root["engine_count"] = len(specs)
    outer = MeshBuilder(materials["dark"], smooth=True)
    inner = MeshBuilder(materials["interior"], smooth=True)
    rims = MeshBuilder(materials["ring"], smooth=True)
    mounts = MeshBuilder(materials["ring"], smooth=True)
    throats = MeshBuilder(materials["interior"])
    normalized_profile = ((0.25, 0.0), (0.29, -0.07), (0.34, -0.25), (0.46, -0.52), (0.62, -0.76), (0.82, -0.92), (1.0, -1.0))
    for x, y, radius, length, engine_type in specs:
        center = (x, y, 0.0)
        profile = [(radius * factor, length * z) for factor, z in normalized_profile]
        inner_profile = [(radius * factor * 0.88, length * z * 0.96 - 0.035) for factor, z in normalized_profile]
        outer.add_lathe(profile, center, segments=20)
        inner.add_lathe(inner_profile, center, segments=20, flip=True)
        rims.add_torus(radius * 0.98, 0.045, (x, y, -length), major_segments=20, minor_segments=5)
        mounts.add_torus(radius * 0.34, 0.055, (x, y, -0.12), major_segments=16, minor_segments=5)
        throats.add_disc(radius * 0.7, (x, y, -length + 0.035), segments=20, normal_down=True)
    outer.create(f"{name}_Bells", root)
    inner.create(f"{name}_Interiors", root)
    rims.create(f"{name}_Rims", root)
    mounts.create(f"{name}_Mounts", root)
    throats.create(f"{name}_Throats", root)
    return root


def hex_tile_prototype(material):
    # Beveled hex prism: 84 triangles before any renderer triangulation.
    builder = MeshBuilder(material)
    radius = 0.355
    inner_radius = 0.326
    half_height = 0.0275
    bevel = 0.020
    rings = []
    for row, (ring_radius, z) in enumerate(((inner_radius, -half_height), (radius, -half_height + bevel), (radius, half_height - bevel), (inner_radius, half_height))):
        ring = []
        for column in range(6):
            angle = column / 6 * TAU
            ring.append(builder.vertex((ring_radius * math.cos(angle), ring_radius * math.sin(angle), z), (column / 6, row / 3)))
        rings.append(ring)
    for row in range(3):
        for column in range(6):
            following = (column + 1) % 6
            builder.face([rings[row][column], rings[row][following], rings[row + 1][following], rings[row + 1][column]])
    for row, normal_up in ((0, False), (3, True)):
        center = builder.vertex((0.0, 0.0, -half_height if row == 0 else half_height), (0.5, 0.5))
        cap = []
        for column in range(6):
            angle = column / 6 * TAU
            cap.append(builder.vertex((inner_radius * math.cos(angle), inner_radius * math.sin(angle), -half_height if row == 0 else half_height), (math.cos(angle) * 0.5 + 0.5, math.sin(angle) * 0.5 + 0.5)))
        for column in range(6):
            face = [center, cap[column], cap[(column + 1) % 6]]
            builder.face(face if normal_up else list(reversed(face)))
    return builder.create("HexTile_Source")


def make_tiles(ship):
    prototype = hex_tile_prototype(materials["black"])
    tiles = []
    tile_count = 0

    def add_tile(position, normal):
        nonlocal tile_count
        obj = bpy.data.objects.new(f"HexTile_{tile_count:04d}", prototype.data)
        collection.objects.link(obj)
        rotation = Vector(normal).normalized().to_track_quat("Z", "Y")
        obj.matrix_world = Matrix.Translation(Vector(position)) @ rotation.to_matrix().to_4x4()
        tiles.append(obj)
        tile_count += 1

    # Windward is Three.js +Z, which is Blender -Y before export.
    for row in range(31):
        y = 4.25 + row * 0.89
        columns = 40
        for column in range(columns):
            angle = (column + (row % 2) * 0.5) / columns * TAU
            if math.cos(angle) < 0.0:
                continue
            add_tile((math.sin(angle) * 4.555, -math.cos(angle) * 4.555, y), (math.sin(angle), -math.cos(angle), 0.0))

    for row in range(11):
        y = 38.7 + row * 1.02
        t = (y - 32.0) / 18.0
        radius = BODY_RADIUS * (1.0 - t) ** 0.72 + 0.04
        derivative = -BODY_RADIUS * 0.72 / 18.0 * (1.0 - t) ** -0.28
        columns = max(5, round(TAU * radius / 0.72))
        for column in range(columns):
            angle = (column + (row % 2) * 0.5) / columns * TAU
            if math.cos(angle) < 0.0:
                continue
            position = (math.sin(angle) * radius, -math.cos(angle) * radius, y)
            normal = (math.sin(angle), -math.cos(angle), -derivative)
            add_tile(position, normal)

    # Real linked instances are merged once, yielding one lightweight glTF mesh.
    bpy.ops.object.select_all(action="DESELECT")
    for tile in tiles:
        tile.select_set(True)
    bpy.context.view_layer.objects.active = tiles[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.data.transform(merged.matrix_basis)
    merged.matrix_basis = Matrix.Identity(4)
    merged.name = "Tiles_Windward"
    merged.parent = ship
    merged.location = (0.0, 0.0, 0.0)
    merged["tile_count"] = tile_count
    merged["coverage"] = "windward-hemisphere"
    merged["merged_instances"] = True
    bpy.data.objects.remove(prototype, do_unlink=True)
    return merged


def make_hotstage(ship):
    root = empty("HotStageRing", ship)
    root["part"] = "hot-stage-interface"
    cylinder("HotStageRing_Barrel", 4.56, 1.4, 1.05, materials["dark"], root, vertices=64, bevel=0.025)
    merged_rings("HotStageRing_Rims", ((4.59, 0.34, 0.075), (4.59, 1.77, 0.075)), root, materials["ring"])
    vents = MeshBuilder(materials["black"])
    for index in range(28):
        angle = index / 28 * TAU
        position = (math.sin(angle) * 4.59, -math.cos(angle) * 4.59, 1.06)
        vents.add_oriented_box(position, (0.52, 0.14, 0.58), Quaternion((0.0, 0.0, 1.0), angle))
    vent_mesh = vents.create("HotStageRing_Vents", root)
    add_bevel(vent_mesh, 0.018, 1)
    return root


def make_booster(materials_by_name):
    booster = empty("Booster")
    booster["stage"] = "Super Heavy"
    booster["height_m"] = BOOSTER_HEIGHT
    booster["radius_m"] = BODY_RADIUS
    cylinder("Booster_Barrel", BODY_RADIUS, 60.0, 38.0, materials_by_name["steel"], booster, vertices=64, bevel=0.018)
    cone("Booster_EngineSkirt", 4.24, BODY_RADIUS, 5.2, 5.55, materials_by_name["steel"], booster, vertices=64, bevel=0.025)
    cylinder("Booster_TopInterface", 4.42, 2.3, 69.6, materials_by_name["dark"], booster, vertices=64, bevel=0.02)
    cylinder("Booster_EngineDeck", 4.12, 0.65, 5.2, materials_by_name["dark"], booster, vertices=48, bevel=0.015)
    rings = []
    for index in range(14):
        y = 10.0 + index * 4.25
        rings.append((4.515, y, 0.055 if index % 2 == 0 else 0.032))
    rings.append((4.44, 70.86, 0.055))
    merged_rings("Booster_ShellRings", rings, booster, materials_by_name["ring"])
    for index in range(4):
        make_grid_fin(index + 1, index * 90.0, booster)
    make_engines("Engines_Booster", 5.2, engine_specs_booster(), booster)
    return booster


def make_ship(materials_by_name):
    ship = empty("Ship", location=(0.0, 0.0, SHIP_BASE))
    ship["stage"] = "Starship upper stage"
    ship["height_m"] = SHIP_HEIGHT
    ship["radius_m"] = BODY_RADIUS
    cylinder("Ship_Barrel", BODY_RADIUS, 29.0, 17.5, materials_by_name["steel"], ship, vertices=64, bevel=0.018)

    nose = MeshBuilder(materials_by_name["steel"], smooth=True)
    profile = []
    for index in range(20, -1, -1):
        y = 32.0 + 18.0 * index / 20.0
        t = (y - 32.0) / 18.0
        profile.append((BODY_RADIUS * (1.0 - t) ** 0.72 + 0.015, y))
    nose.add_lathe(profile, segments=64)
    nose.add_disc(0.015, (0.0, 0.0, SHIP_HEIGHT), segments=24)
    nose.create("Ship_Ogive", ship)

    rings = []
    for index in range(9):
        rings.append((4.515, 4.0 + index * 3.4, 0.03))
    merged_rings("Ship_ShellRings", rings, ship, materials_by_name["ring"])
    make_hotstage(ship)
    make_tiles(ship)
    for kind, suffixes in (("aft", ("L", "R")), ("forward", ("L", "R"))):
        for suffix, angle in zip(suffixes, FLAP_LAYOUT[kind]["angles"]):
            make_flap(kind, suffix, angle, ship)
    cylinder("Ship_EngineDeck", 3.9, 0.45, 2.8, materials_by_name["dark"], ship, vertices=48, bevel=0.015)
    make_engines("Engines_Ship", 2.8, engine_specs_ship(), ship)
    return ship


def evaluated_triangle_count():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        # Blender 5.3 tessellates lazily when loop_triangles is accessed.
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def main():
    global collection, materials
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.world.color = (0.008, 0.012, 0.02)
    scene["model_notice"] = "Educational approximation; not real CAD"
    scene["total_height_m"] = TOTAL_HEIGHT

    collection = bpy.data.collections.new(COLLECTION_NAME)
    scene.collection.children.link(collection)
    materials = {
        "steel": make_material("StainlessSteel", "#c8d0d6", 0.62, 0.30),
        "black": make_material("BlackTiles", "#151b22", 0.08, 0.92),
        "dark": make_material("DarkSteel", "#39434c", 0.72, 0.34),
        "ring": make_material("RingSteel", "#8e9aa3", 0.78, 0.29),
        "interior": make_material("EngineInterior", "#151d25", 0.58, 0.42, double_sided=True),
    }

    booster = make_booster(materials)
    ship = make_ship(materials)
    required_names = {
        "Booster", "Ship", "ForwardFlap_L", "ForwardFlap_R", "AftFlap_L", "AftFlap_R",
        "Engines_Booster", "Engines_Ship", "Tiles_Windward", "HotStageRing",
    }
    missing = sorted(name for name in required_names if bpy.data.objects.get(name) is None)
    if missing:
        raise RuntimeError(f"Missing stable object names: {missing}")
    if bpy.data.objects["Engines_Booster"]["engine_count"] != 33 or bpy.data.objects["Engines_Ship"]["engine_count"] != 6:
        raise RuntimeError("Engine count contract failed")

    select_only(booster)
    bpy.context.view_layer.update()
    triangle_count = evaluated_triangle_count()
    if not 50000 <= triangle_count <= 150000:
        raise RuntimeError(f"Triangle budget is outside 50,000-150,000: {triangle_count}")

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=True,
    )
    print(f"Saved: {BLEND_PATH}")
    print(f"Saved: {GLB_PATH}")
    print(f"Triangles: {triangle_count}; tiles: {bpy.data.objects['Tiles_Windward']['tile_count']}; total height: {TOTAL_HEIGHT:.0f} m")


if __name__ == "__main__":
    main()
