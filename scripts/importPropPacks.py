import argparse
import json
import re
import sys
from pathlib import Path

import bpy


SUPPORTED_EXTENSIONS = {".fbx", ".obj"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert prop pack FBX/OBJ files to editor-ready GLB assets.")
    parser.add_argument("--city-source", required=True, type=Path)
    parser.add_argument("--interior-source", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(script_args)


def import_model(source_path: Path) -> None:
    if source_path.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source_path), use_anim=False)
        return

    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=str(source_path))
        return

    bpy.ops.import_scene.obj(filepath=str(source_path))


def convert_model(source_path: Path, source_root: Path, output_root: Path, category: str) -> dict[str, object]:
    relative_path = source_path.relative_to(source_root)
    output_path = output_root / category / relative_path.with_suffix(".glb")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model(source_path)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("Imported scene contains no meshes")

    for obj in bpy.context.scene.objects:
        obj["edison_asset_category"] = category
        obj["edison_source_pack"] = "city-pack" if category == "street" else "ultimate-house-interior-pack"

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_extras=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )

    return {
        "source": relative_path.as_posix(),
        "asset": output_path.relative_to(output_root.parent.parent).as_posix(),
        "category": category,
        "meshCount": len(mesh_objects),
        "sizeBytes": output_path.stat().st_size,
    }


def collect_models(source_root: Path) -> list[Path]:
    return sorted(
        path
        for path in source_root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def main() -> None:
    args = parse_args()
    jobs = [
        (args.city_source.resolve(), "street"),
        (args.interior_source.resolve(), "interior"),
    ]
    output_root = args.output_root.resolve()
    report: dict[str, object] = {"assets": [], "errors": []}

    for source_root, category in jobs:
        if not source_root.is_dir():
            raise FileNotFoundError(f"Asset source directory does not exist: {source_root}")

        for source_path in collect_models(source_root):
            try:
                asset = convert_model(source_path, source_root, output_root, category)
                report["assets"].append(asset)
                print(f"IMPORTED {category}: {source_path.relative_to(source_root)}")
            except Exception as error:
                report["errors"].append({
                    "source": source_path.relative_to(source_root).as_posix(),
                    "category": category,
                    "error": re.sub(r"\s+", " ", str(error)).strip(),
                })
                print(f"FAILED {category}: {source_path.relative_to(source_root)}: {error}")

    output_root.mkdir(parents=True, exist_ok=True)
    report_path = output_root / "prop-pack-import-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"REPORT {report_path}")


if __name__ == "__main__":
    main()
