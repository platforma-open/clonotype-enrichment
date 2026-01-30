import { model } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { watch } from 'vue';
import BubblePage from './pages/BubblePage.vue';
import LinePage from './pages/LinePage.vue';
import MainPage from './pages/MainPage.vue';
import ScatterPage from './pages/ScatterPage.vue';
import StackedPage from './pages/StackedPage.vue';

export const sdkPlugin = defineApp(model, (app) => {
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
    },
  };
});

export const useApp = sdkPlugin.useApp;

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.args.customBlockLabel ??= '';
  app.model.args.defaultBlockLabel ??= 'Select Abundance';
  unwatch();
});
