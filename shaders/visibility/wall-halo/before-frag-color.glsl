#ifdef PBR
  finalColor.a = max(finalColor.a, 1.0 - wallHaloVerticalFace);
#else
  color.a = max(color.a, 1.0 - wallHaloVerticalFace);
#endif
