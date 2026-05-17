import type { EdisonPlugin } from "./EdisonPlugin";
import type { EdisonPluginManifest } from "./EdisonPluginManifest";

export interface EdisonPluginZipInstallResult {
  readonly ok: boolean;
  readonly message: string;
  readonly plugin?: EdisonPlugin;
}

export class EdisonPluginZipInstaller {
  public async install(file: File): Promise<EdisonPluginZipInstallResult> {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return {
        ok: false,
        message: "Edison plugins must be provided as .zip archives."
      };
    }

    try {
      const archive = await EdisonZipArchiveReader.read(file);
      const manifest = this.readManifest(archive);
      const entrySource = archive.readText(manifest.entry);
      if (!entrySource) {
        return {
          ok: false,
          message: `Plugin entry '${manifest.entry}' was not found in archive.`
        };
      }

      const plugin = await this.importPluginModule(entrySource, manifest);
      return {
        ok: true,
        message: `Plugin '${plugin.manifest.name}' is ready to install.`,
        plugin
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private readManifest(archive: EdisonZipArchive): EdisonPluginManifest {
    const manifestJson = archive.readText("edison-plugin.json");
    if (!manifestJson) {
      throw new Error("Archive must contain edison-plugin.json at the root.");
    }

    const manifest = JSON.parse(manifestJson) as Partial<EdisonPluginManifest>;
    if (!manifest.id || !manifest.name || !manifest.version || !manifest.entry) {
      throw new Error("edison-plugin.json must include id, name, version, and entry.");
    }

    if (manifest.edisonApiVersion !== "1") {
      throw new Error("Only Edison plugin API version 1 is supported.");
    }

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      entry: manifest.entry,
      edisonApiVersion: "1"
    };
  }

  private async importPluginModule(entrySource: string, manifest: EdisonPluginManifest): Promise<EdisonPlugin> {
    const moduleUrl = URL.createObjectURL(new Blob([entrySource], { type: "text/javascript" }));
    try {
      const module = await import(/* @vite-ignore */ moduleUrl) as {
        readonly default?: unknown;
        readonly plugin?: unknown;
      };
      const plugin = (module.plugin ?? module.default) as Partial<EdisonPlugin> | undefined;
      if (!plugin || typeof plugin !== "object" || typeof plugin.activate !== "function") {
        throw new Error(`Plugin '${manifest.id}' entry must export 'plugin' or default EdisonPlugin object.`);
      }

      if (!plugin.manifest) {
        throw new Error(`Plugin '${manifest.id}' entry must expose a manifest.`);
      }

      if (plugin.manifest.id !== manifest.id || plugin.manifest.edisonApiVersion !== manifest.edisonApiVersion) {
        throw new Error(`Plugin '${manifest.id}' entry manifest does not match edison-plugin.json.`);
      }

      return plugin as EdisonPlugin;
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  }
}

class EdisonZipArchive {
  public constructor(private readonly entries: ReadonlyMap<string, Uint8Array>) {}

  public readText(path: string): string | null {
    const bytes = this.entries.get(normalizeZipPath(path));
    return bytes ? new TextDecoder().decode(bytes) : null;
  }
}

interface EdisonZipCentralDirectoryEntry {
  readonly path: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

class EdisonZipArchiveReader {
  public static async read(file: File): Promise<EdisonZipArchive> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = new Map<string, Uint8Array>();
    for (const entry of this.readCentralDirectory(bytes, view)) {
      if (entry.path.endsWith("/")) {
        continue;
      }

      entries.set(entry.path, await this.readEntry(bytes, view, entry));
    }

    return new EdisonZipArchive(entries);
  }

  private static readCentralDirectory(bytes: Uint8Array, view: DataView): EdisonZipCentralDirectoryEntry[] {
    const eocdOffset = this.findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const entries: EdisonZipCentralDirectoryEntry[] = [];
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      this.assertSignature(view, offset, 0x02014b50, "central directory file header");
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > bytes.length) {
        throw new Error("ZIP archive central directory is truncated.");
      }

      entries.push({
        path: normalizeZipPath(new TextDecoder().decode(bytes.subarray(fileNameStart, fileNameEnd))),
        method,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
      offset = fileNameEnd + extraLength + commentLength;
    }

    return entries;
  }

  private static async readEntry(
    bytes: Uint8Array,
    view: DataView,
    entry: EdisonZipCentralDirectoryEntry
  ): Promise<Uint8Array> {
    this.assertSignature(view, entry.localHeaderOffset, 0x04034b50, "local file header");
    const fileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
    const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
    const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.length) {
      throw new Error(`ZIP entry '${entry.path}' is truncated.`);
    }

    const compressed = bytes.subarray(dataStart, dataEnd);
    if (entry.method === 0) {
      return compressed.slice();
    }

    if (entry.method === 8) {
      return this.inflateRaw(compressed, entry.uncompressedSize, entry.path);
    }

    throw new Error(`ZIP entry '${entry.path}' uses unsupported compression method ${entry.method}.`);
  }

  private static async inflateRaw(compressed: Uint8Array, expectedSize: number, path: string): Promise<Uint8Array> {
    const DecompressionStreamCtor = globalThis.DecompressionStream;
    if (!DecompressionStreamCtor) {
      throw new Error(`ZIP entry '${path}' is deflated, but this browser does not support DecompressionStream.`);
    }

    const compressedCopy = new ArrayBuffer(compressed.byteLength);
    new Uint8Array(compressedCopy).set(compressed);
    const stream = new Blob([compressedCopy]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
    const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
    if (inflated.length !== expectedSize) {
      throw new Error(`ZIP entry '${path}' inflated to ${inflated.length} bytes, expected ${expectedSize}.`);
    }
    return inflated;
  }

  private static findEndOfCentralDirectory(view: DataView): number {
    const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
    for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        return offset;
      }
    }

    throw new Error("Invalid ZIP archive: end of central directory was not found.");
  }

  private static assertSignature(view: DataView, offset: number, expected: number, label: string): void {
    if (offset < 0 || offset + 4 > view.byteLength || view.getUint32(offset, true) !== expected) {
      throw new Error(`Invalid ZIP archive: missing ${label}.`);
    }
  }
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}
