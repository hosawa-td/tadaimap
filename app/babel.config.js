module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimatedの変換プラグイン。必ず配列の最後に置く必要がある。
    plugins: ["react-native-worklets/plugin"],
  };
};
