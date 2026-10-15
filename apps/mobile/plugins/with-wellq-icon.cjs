// Native vector launcher mark: preserve the supplied full logo inside the app.
const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
module.exports = function withWellqIcon(config) {
  config = withAndroidManifest(config, (result) => {
    const app = result.modResults.manifest.application[0];
    app.$["android:icon"] = "@drawable/wellq_icon";
    app.$["android:roundIcon"] = "@drawable/wellq_icon";
    return result;
  });
  return withDangerousMod(config, [
    "android",
    async (result) => {
      const res = join(
        result.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      await mkdir(join(res, "drawable"), { recursive: true });
      await mkdir(join(res, "values"), { recursive: true });
      await writeFile(
        join(res, "values", "wellq_icon_colors.xml"),
        '<resources><color name="wellq_icon_background">#000000</color></resources>',
      );
      await writeFile(
        join(res, "drawable", "wellq_icon.xml"),
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/wellq_icon_background"/><foreground android:drawable="@drawable/wellq_mark"/></adaptive-icon>',
      );
      await writeFile(
        join(res, "drawable", "wellq_mark.xml"),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:pathData="M54,22 A32,32 0 1,1 53.99,22" android:strokeWidth="7" android:fillColor="@android:color/transparent"><aapt:attr name="android:strokeColor"><gradient android:startX="54" android:startY="22" android:endX="54" android:endY="86" android:startColor="#20F3A2" android:endColor="#32BEDD" android:type="linear"/></aapt:attr></path></vector>`,
      );
      return result;
    },
  ]);
};
