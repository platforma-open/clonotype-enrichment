import { platforma } from "@platforma-open/milaboratories.clonotype-enrichment.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { computed, watch } from "vue";
import BoxPage from "./pages/BoxPage.vue";
import BubblePage from "./pages/BubblePage.vue";
import LinePage from "./pages/LinePage.vue";
import MainPage from "./pages/MainPage.vue";
import ScatterPage from "./pages/ScatterPage.vue";
import StackedPage from "./pages/StackedPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  syncSubtitleLabel(app.model);

  return {
    progress: () => {
      return app.model.outputs.isRunning;
    },
    routes: {
      "/": () => MainPage,
      "/bubble": () => BubblePage,
      "/line": () => LinePage,
      "/stacked": () => StackedPage,
      "/scatter": () => ScatterPage,
      "/box": () => BoxPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.data.customBlockLabel ??= "";
  unwatch();
});

type AppModel = ReturnType<typeof useApp>["model"];

// The subtitle names the chosen clonotype-definition columns as the result pool labels them:
// "" when none is chosen, undefined while the options are loading; a chosen column the loaded
// options no longer list is left out.
function syncSubtitleLabel(model: AppModel) {
  const subtitleLabel = computed<string | undefined>(() => {
    const colIds = model.data.clonotypeDefinition;
    if (colIds.length === 0) return "";
    const options = model.outputs.sequenceColumnOptions;
    if (options === undefined) return undefined;
    return colIds
      .map((colId) => options.find((opt) => opt.value === colId)?.label)
      .filter(Boolean)
      .join("-");
  });

  watch(
    subtitleLabel,
    (label) => {
      if (label !== undefined && label !== model.data.subtitleLabel) {
        model.data.subtitleLabel = label;
      }
    },
    { immediate: true },
  );
}
