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
// "" when none is chosen, undefined while a chosen column's option is not loaded yet.
function syncSubtitleLabel(model: AppModel) {
  const subtitleLabel = computed<string | undefined>(() => {
    const options = model.outputs.sequenceColumnOptions;
    const labels: string[] = [];
    for (const colId of model.data.clonotypeDefinition) {
      const label = options?.find((opt) => opt.value === colId)?.label;
      if (label === undefined) return undefined;
      labels.push(label);
    }
    return labels.join("-");
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
