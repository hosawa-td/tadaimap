module.exports = {
  expo: {
    name: "タダイマップ",
    slug: "tadaimap",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      backgroundColor: "#FDF8F0",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.tadaimap.app",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "自宅の範囲に入っているかどうかを確認するために位置情報を使用します。",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "アプリを閉じているときも、自宅への出入りを検知して家族に在宅状況を伝えるために位置情報を使用します。",
        UIBackgroundModes: ["location"],
      },
    },
    android: {
      package: "com.tadaimap.app",
      versionCode: 3,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FDF8F0",
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
      ],
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "アプリを閉じているときも、自宅への出入りを検知して家族に在宅状況を伝えるために位置情報を使用します。",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "b862872c-c6ef-4fe1-bb5d-06062c165224",
      },
    },
    owner: "h.osawa",
  },
};
