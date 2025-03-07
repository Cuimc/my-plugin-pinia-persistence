import { defineStore } from "pinia";

export const useUserStore = defineStore("user", {
  state: () => ({
    name: "",
    count: 1,
    a: {
      b: "B",
    },
    c: {
      d: {
        e: "E",
        f: "F",
      },
    },
  }),
  actions: {
    setCount() {
      this.count += 1;
    },
  },
  persist: {
    key: "my_user",
    omit: ["name"],
    storage: sessionStorage,
    beforeHydrate: (ctx) => {
      console.log("before ctx", ctx);
    },
    afterHydrate: (ctx) => {
      console.log("after ctx", ctx);
    },
  },
});
