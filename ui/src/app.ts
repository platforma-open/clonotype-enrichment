import { model } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
import volcanoPage from './pages/volcanoPage.vue';
import bubblePage from './pages/bubblePage.vue';
import linePage from './pages/linePage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/volcano': () => volcanoPage,
      '/buble': () => bubblePage,
      '/line': () => linePage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
