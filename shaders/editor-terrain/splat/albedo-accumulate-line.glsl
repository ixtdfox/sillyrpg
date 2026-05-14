  albedo += texture2D(terrainLayerAtlas, terrainSplatAtlasUv(tiledUv, {{layerIndex}}.0)).rgb * {{weightsVar}}.{{channelName}};
