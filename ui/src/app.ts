import { platforma } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import { defineAppV3 } from '@platforma-sdk/ui-vue';
import { watch } from 'vue';
import BoxPage from './pages/BoxPage.vue';
import BubblePage from './pages/BubblePage.vue';
import LinePage from './pages/LinePage.vue';
import MainPage from './pages/MainPage.vue';
import ScatterPage from './pages/ScatterPage.vue';
import StackedPage from './pages/StackedPage.vue';

export const sdkPlugin = defineAppV3(platforma, (app) => {
  return {
    progress: () => {
      return app.model.outputs.isRunning;
    },
    routes: {
      '/': () => MainPage,
      '/bubble': () => BubblePage,
      '/line': () => LinePage,
      '/stacked': () => StackedPage,
      '/scatter': () => ScatterPage,
      '/box': () => BoxPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.data.customBlockLabel ??= '';
  app.model.data.defaultBlockLabel ??= 'Select Abundance';
  unwatch();
});
