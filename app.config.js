/** @type {import('@expo/config').ConfigContext} */
module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim() ?? '';
  const isEasBuild = Boolean(process.env.EAS_BUILD || process.env.EAS_BUILD_PROFILE);

  if (isEasBuild && !mapsKey) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY is required for EAS builds. ' +
        'Set it with `eas env:create` (or EAS secrets) before building Android.',
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          apiKey: mapsKey,
        },
      },
    },
  };
};
