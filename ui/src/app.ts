import { model } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
// import volcanoPage from './pages/volcanoPage.vue';
import bubblePage from './pages/bubblePage.vue';
import linePage from './pages/linePage.vue';
import stackedPage from './pages/stackedPage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/buble': () => bubblePage,
      '/line': () => linePage,
      '/stacked': () => stackedPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
