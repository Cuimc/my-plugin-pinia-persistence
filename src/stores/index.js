import { createPinia } from "pinia";

import createPersistedState from "./plugins/plugin-pinia-persistence";

const store = createPinia();

store.use(
  createPersistedState({
    key: (id) => `__${id}`,
    storage: window.localStorage,
  })
);

export default store;
