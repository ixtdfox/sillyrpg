export class TerrainNoise {
  private readonly seed: number;

  public constructor(seed: number) {
    this.seed = seed | 0;
  }

  public sample2D(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const tx = fade(x - x0);
    const tz = fade(z - z0);

    const v00 = this.random2D(x0, z0);
    const v10 = this.random2D(x1, z0);
    const v01 = this.random2D(x0, z1);
    const v11 = this.random2D(x1, z1);

    const top = lerp(v00, v10, tx);
    const bottom = lerp(v01, v11, tx);
    return lerp(top, bottom, tz) * 2 - 1;
  }

  public sampleFractal2D(
    x: number,
    z: number,
    octaves: number,
    persistence: number,
    lacunarity: number
  ): number {
    let signal = 0;
    let octaveAmplitude = 1;
    let amplitudeTotal = 0;
    let octaveFrequency = 1;

    for (let octave = 0; octave < octaves; octave += 1) {
      signal += this.sample2D(x * octaveFrequency, z * octaveFrequency) * octaveAmplitude;
      amplitudeTotal += octaveAmplitude;
      octaveAmplitude *= persistence;
      octaveFrequency *= lacunarity;
    }

    return amplitudeTotal > 0 ? signal / amplitudeTotal : 0;
  }

  private random2D(x: number, z: number): number {
    let hash = Math.imul(x ^ this.seed, 374761393);
    hash = Math.imul(hash ^ (z + 0x9e3779b9), 668265263);
    hash = (hash ^ (hash >>> 13)) >>> 0;
    hash = Math.imul(hash, 1274126177) >>> 0;
    return hash / 0xffffffff;
  }
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
