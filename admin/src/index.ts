import { PLUGIN_ID } from "./pluginId";
import { Initializer } from "./components/Initializer";
import { CustomMediaInput } from "./components/CustomMediaInput/CustomMediaInput";
import { setNativeMediaField } from "./utils/nativeMediaField";

export default {
  register(app: any) {
    setNativeMediaField(app.library.fields.media);
    app.addFields({
      type: "media",
      Component: CustomMediaInput,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(
            `./translations/${locale}.json`
          );

          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
