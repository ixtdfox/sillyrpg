vec2 terrainSplatAtlasUv(vec2 tiledUv, float layerIndex) {
  float column = mod(layerIndex, terrainLayerAtlasGrid.x);
  float row = floor(layerIndex / terrainLayerAtlasGrid.x);
  vec2 cellUv = clamp(fract(tiledUv), vec2(0.002), vec2(0.998));
  return (vec2(column, row) + cellUv) / terrainLayerAtlasGrid;
}

vec3 terrainSplatAlbedo(vec2 uv) {
  vec2 tiledUv = uv * terrainSplatTileScale;
  vec3 albedo = vec3(0.0);
  float totalWeight = 0.0;
{{terrainSplatWeightSampling}}
  return albedo / max(totalWeight, 0.0001);
}
