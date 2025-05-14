import { model } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
// import volcanoPage from './pages/volcanoPage.vue';
import BubblePage from './pages/BubblePage.vue';
import LinePage from './pages/LinePage.vue';
import StackedPage from './pages/StackedPage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/buble': () => BubblePage,
      '/line': () => LinePage,
      '/stacked': () => StackedPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
